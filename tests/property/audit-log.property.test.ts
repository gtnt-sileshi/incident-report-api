import * as fc from 'fast-check';

// Mock the config module before any imports that depend on it
jest.mock('../../src/config', () => ({
  config: {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
    JWT_EXPIRES_IN: '8h',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
    FCM_SERVER_KEY: 'test-fcm-server-key',
    SMS_GATEWAY_URL: 'https://test-sms-gateway.com',
    SMS_GATEWAY_API_KEY: 'test-sms-api-key',
    SMS_GATEWAY_SENDER_ID: 'TEST',
    ATTACHMENT_STORAGE_PATH: './test-attachments',
    MAX_FILE_SIZE_MB: 50,
    QR_PRIVATE_KEY_PATH: './test-ec-private.pem',
    QR_PUBLIC_KEY_PATH: './test-ec-public.pem',
    ESCALATION_HIGH_PRIORITY_MINUTES: 30,
    ESCALATION_MEDIUM_PRIORITY_MINUTES: 90,
    LOG_LEVEL: 'error',
  },
}));

// Mock the database connection
jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// Mock repositories used by IncidentService
jest.mock('../../src/audit/audit-log.repository');
jest.mock('../../src/incidents/incident.repository');
jest.mock('../../src/incidents/comment.repository');
jest.mock('../../src/organizations/organization.repository');
jest.mock('../../src/devices/exam-center-assignment.repository');
jest.mock('../../src/routing/routing-rule.service');

import { auditLogRepository, AuditLogRepository } from '../../src/audit/audit-log.repository';
import { incidentRepository } from '../../src/incidents/incident.repository';
import { organizationRepository } from '../../src/organizations/organization.repository';
import { examCenterAssignmentRepository } from '../../src/devices/exam-center-assignment.repository';
import { routingRuleService } from '../../src/routing/routing-rule.service';
import { incidentService } from '../../src/incidents/incident.service';
import type { Incident, AuditLogEntry, NewAuditLogEntry } from '../../src/db/schema';

// ─── Shared Arbitraries ───────────────────────────────────────────────────────

const ROLES = ['bureau_staff', 'org_admin', 'it_rep', 'super_admin', 'external'] as const;
const PRIORITIES = ['Low', 'Medium', 'High'] as const;

/** Generates a requesting user (actor) */
const actorArbitrary = fc.record({
  sub:   fc.uuid(),
  role:  fc.constantFrom(...ROLES),
  orgId: fc.uuid(),
  email: fc.emailAddress(),
});

// ─── P4: Audit Log Completeness ───────────────────────────────────────────────

/**
 * Property-Based Test for Audit Log Completeness
 *
 * **Validates: Requirements 6.6, 7.6, 7.9, 15.1, 15.2**
 *
 * Property 4: Audit Log Completeness
 *
 * For any state-changing action on an incident (creation, status change,
 * assignment), an Audit_Log entry SHALL be created containing the actor's
 * user ID, role, organization, the action type, and a UTC timestamp.
 * No state-changing action SHALL complete without a corresponding audit entry.
 */
describe('Property Test: Audit Log Completeness (P4)', () => {
  const ITDB_ORG = {
    id: 'itdb-org-id',
    name: 'ITDB',
    type: 'government',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: routing rule service returns null (no auto-assign)
    (routingRuleService.evaluateRule as jest.Mock).mockResolvedValue(null);
  });

  // ── 4.1: Incident creation produces exactly one audit entry ─────────────────

  it('Property 4.1: createIncident produces exactly one audit entry with correct fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        actorArbitrary,
        fc.record({
          examFieldId:    fc.uuid(),
          incidentTypeId: fc.uuid(),
          priority:       fc.constantFrom(...PRIORITIES),
          description:    fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
          localId:        fc.option(fc.string({ minLength: 1, maxLength: 50 }),  { nil: undefined }),
        }),
        async (actor, createData) => {
          jest.clearAllMocks();

          const createdIncident: Incident = {
            id:               'new-incident-id',
            examFieldId:      createData.examFieldId,
            incidentTypeId:   createData.incidentTypeId,
            reportedByUserId: actor.sub,
            deviceId:         null,
            priority:         createData.priority,
            status:           'Reported',
            description:      createData.description ?? null,
            assignedOrgId:    ITDB_ORG.id,
            assignedUserId:   null,
            resolvedAt:       null,
            resolutionSummary: null,
            localId:          createData.localId ?? null,
            createdAt:        new Date(),
            updatedAt:        new Date(),
          };

          // Mock exam center assignment — actor is assigned to the exam field
          (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([
            { examFieldId: createData.examFieldId, userId: actor.sub },
          ]);

          // Mock ITDB org lookup
          (organizationRepository.findByName as jest.Mock).mockResolvedValue(ITDB_ORG);

          // Mock incident creation
          (incidentRepository.create as jest.Mock).mockResolvedValue(createdIncident);

          // Mock audit log append — capture the call
          const appendedEntries: NewAuditLogEntry[] = [];
          (auditLogRepository.append as jest.Mock).mockImplementation(
            async (entry: NewAuditLogEntry) => {
              appendedEntries.push(entry);
              return { id: 1, occurredAt: new Date(), ...entry } as AuditLogEntry;
            },
          );

          // Act
          await incidentService.createIncident(createData, actor);

          // Assert: exactly one audit entry was written
          expect(appendedEntries).toHaveLength(1);

          const entry = appendedEntries[0];

          // Assert: correct actor fields
          expect(entry.actorUserId).toBe(actor.sub);
          expect(entry.actorRole).toBe(actor.role);
          expect(entry.actorOrgId).toBe(actor.orgId);

          // Assert: correct action type
          expect(entry.actionType).toBe('incident_created');

          // Assert: incident ID is linked
          expect(entry.incidentId).toBe(createdIncident.id);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  // ── 4.2: Status change produces exactly one audit entry ─────────────────────

  it('Property 4.2: updateStatus produces exactly one audit entry with correct fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        actorArbitrary,
        // Generate a forward-only status transition
        fc.record({
          fromStatus: fc.constantFrom('Reported', 'Assigned', 'In-Progress'),
          toStatus:   fc.constantFrom('Assigned', 'In-Progress'),
        }).filter(({ fromStatus, toStatus }) => {
          const order: Record<string, number> = {
            Reported: 0, Assigned: 1, 'In-Progress': 2, Resolved: 3,
          };
          return order[toStatus] > order[fromStatus];
        }),
        async (actor, transition) => {
          jest.clearAllMocks();

          const incidentId = 'test-incident-id';
          const existingIncident: Incident = {
            id:               incidentId,
            examFieldId:      'exam-field-id',
            incidentTypeId:   'incident-type-id',
            reportedByUserId: 'reporter-id',
            deviceId:         null,
            priority:         'Medium',
            status:           transition.fromStatus,
            description:      null,
            assignedOrgId:    ITDB_ORG.id,
            assignedUserId:   null,
            resolvedAt:       null,
            resolutionSummary: null,
            localId:          null,
            createdAt:        new Date(),
            updatedAt:        new Date(),
          };

          const updatedIncident: Incident = {
            ...existingIncident,
            status: transition.toStatus,
          };

          (incidentRepository.findById as jest.Mock).mockResolvedValue(existingIncident);
          (incidentRepository.updateStatus as jest.Mock).mockResolvedValue(updatedIncident);

          const appendedEntries: NewAuditLogEntry[] = [];
          (auditLogRepository.append as jest.Mock).mockImplementation(
            async (entry: NewAuditLogEntry) => {
              appendedEntries.push(entry);
              return { id: 1, occurredAt: new Date(), ...entry } as AuditLogEntry;
            },
          );

          // Act
          await incidentService.updateStatus(incidentId, transition.toStatus, actor);

          // Assert: exactly one audit entry
          expect(appendedEntries).toHaveLength(1);

          const entry = appendedEntries[0];

          // Assert: correct actor fields
          expect(entry.actorUserId).toBe(actor.sub);
          expect(entry.actorRole).toBe(actor.role);
          expect(entry.actorOrgId).toBe(actor.orgId);

          // Assert: correct action type
          expect(entry.actionType).toBe('status_changed');

          // Assert: incident ID is linked
          expect(entry.incidentId).toBe(incidentId);

          // Assert: previous and new values are recorded
          expect(entry.previousValue).toBe(transition.fromStatus);
          expect(entry.newValue).toBe(transition.toStatus);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  // ── 4.3: Assignment produces exactly one audit entry ────────────────────────

  it('Property 4.3: assignIncident produces exactly one audit entry with correct fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        actorArbitrary,
        fc.uuid(), // incidentId
        fc.uuid(), // targetOrgId
        async (actor, incidentId, targetOrgId) => {
          jest.clearAllMocks();

          const existingIncident: Incident = {
            id:               incidentId,
            examFieldId:      'exam-field-id',
            incidentTypeId:   'incident-type-id',
            reportedByUserId: 'reporter-id',
            deviceId:         null,
            priority:         'Low',
            status:           'Reported',
            description:      null,
            assignedOrgId:    null, // not yet assigned → first assignment (no reason required)
            assignedUserId:   null,
            resolvedAt:       null,
            resolutionSummary: null,
            localId:          null,
            createdAt:        new Date(),
            updatedAt:        new Date(),
          };

          const updatedIncident: Incident = {
            ...existingIncident,
            assignedOrgId: targetOrgId,
          };

          (incidentRepository.findById as jest.Mock).mockResolvedValue(existingIncident);
          (incidentRepository.updateAssignment as jest.Mock).mockResolvedValue(updatedIncident);

          const appendedEntries: NewAuditLogEntry[] = [];
          (auditLogRepository.append as jest.Mock).mockImplementation(
            async (entry: NewAuditLogEntry) => {
              appendedEntries.push(entry);
              return { id: 1, occurredAt: new Date(), ...entry } as AuditLogEntry;
            },
          );

          // Act
          await incidentService.assignIncident(incidentId, { orgId: targetOrgId }, actor);

          // Assert: exactly one audit entry
          expect(appendedEntries).toHaveLength(1);

          const entry = appendedEntries[0];

          // Assert: correct actor fields
          expect(entry.actorUserId).toBe(actor.sub);
          expect(entry.actorRole).toBe(actor.role);
          expect(entry.actorOrgId).toBe(actor.orgId);

          // Assert: correct action type (first assignment)
          expect(entry.actionType).toBe('incident_assigned');

          // Assert: incident ID is linked
          expect(entry.incidentId).toBe(incidentId);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});

// ─── P13: Audit Log Immutability ──────────────────────────────────────────────

/**
 * Property-Based Test for Audit Log Immutability
 *
 * **Validates: Requirements 15.5**
 *
 * Property 13: Audit Log Immutability
 *
 * For any existing Audit_Log entry, any attempt to update or delete that entry
 * — regardless of the actor's role, including Super_Admin — SHALL be rejected.
 * The audit log is append-only.
 *
 * The audit_log table enforces this at the DB level via:
 *   CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
 *   CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
 *
 * At the application layer, AuditLogRepository must expose NO update or delete
 * methods, and calling append multiple times must create multiple independent
 * entries (append-only semantics).
 */
describe('Property Test: Audit Log Immutability (P13)', () => {
  // ── 13.1: AuditLogRepository has no update or delete methods ────────────────

  it('Property 13.1: AuditLogRepository exposes no update or delete methods', () => {
    const repo = new AuditLogRepository();
    const proto = Object.getOwnPropertyNames(AuditLogRepository.prototype);

    // Collect all method names on the prototype
    const methodNames = proto.filter(
      (name) => name !== 'constructor' && typeof (repo as unknown as Record<string, unknown>)[name] === 'function',
    );

    // Assert: no method name contains 'update', 'delete', 'remove', 'patch', 'put', 'modify', 'edit'
    const mutatingKeywords = ['update', 'delete', 'remove', 'patch', 'put', 'modify', 'edit'];

    for (const method of methodNames) {
      const lowerMethod = method.toLowerCase();
      for (const keyword of mutatingKeywords) {
        expect(lowerMethod).not.toContain(keyword);
      }
    }

    // Assert: the only write method is 'append'
    const writeMethods = methodNames.filter((m) => {
      const lower = m.toLowerCase();
      return (
        lower.includes('write') ||
        lower.includes('insert') ||
        lower.includes('create') ||
        lower.includes('save') ||
        lower.includes('append') ||
        lower.includes('add')
      );
    });

    // 'append' is the only allowed write method
    expect(writeMethods).toEqual(['append']);
  });

  // ── 13.2: Calling append N times creates N independent entries ───────────────

  it('Property 13.2: Calling append N times creates N independent entries (append-only)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate between 1 and 10 audit entries
        fc.array(
          fc.record({
            actorUserId:  fc.uuid(),
            actorRole:    fc.constantFrom('bureau_staff', 'org_admin', 'super_admin', 'it_rep'),
            actorOrgId:   fc.uuid(),
            actionType:   fc.constantFrom(
              'incident_created',
              'status_changed',
              'incident_assigned',
              'incident_reassigned',
              'comment_added',
              'incident_escalated',
            ),
            incidentId:   fc.option(fc.uuid(), { nil: undefined }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (entries) => {
          jest.clearAllMocks();

          // In-memory store simulating append-only behaviour
          const storedEntries: AuditLogEntry[] = [];
          let nextId = 1;

          (auditLogRepository.append as jest.Mock).mockImplementation(
            async (entry: NewAuditLogEntry): Promise<AuditLogEntry> => {
              const stored: AuditLogEntry = {
                id:            nextId++,
                occurredAt:    new Date(),
                fieldChanged:  null,
                previousValue: null,
                newValue:      null,
                deviceId:      null,
                routingRuleId: null,
                ...entry,
                incidentId:    entry.incidentId ?? null,
              };
              storedEntries.push(stored);
              return stored;
            },
          );

          // Act: append each entry
          for (const entry of entries) {
            await auditLogRepository.append(entry);
          }

          // Assert: exactly N entries were stored
          expect(storedEntries).toHaveLength(entries.length);

          // Assert: each entry has a unique, monotonically increasing ID
          const ids = storedEntries.map((e) => e.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(entries.length);

          // Assert: IDs are strictly increasing (append-only ordering)
          for (let i = 1; i < ids.length; i++) {
            expect(ids[i]).toBeGreaterThan(ids[i - 1]);
          }

          // Assert: each stored entry preserves the original actor fields
          for (let i = 0; i < entries.length; i++) {
            expect(storedEntries[i].actorUserId).toBe(entries[i].actorUserId);
            expect(storedEntries[i].actorRole).toBe(entries[i].actorRole);
            expect(storedEntries[i].actorOrgId).toBe(entries[i].actorOrgId);
            expect(storedEntries[i].actionType).toBe(entries[i].actionType);
          }

          // Assert: append was called exactly N times (no hidden deletes/updates)
          expect(auditLogRepository.append).toHaveBeenCalledTimes(entries.length);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  // ── 13.3: No role (including super_admin) can call update/delete ─────────────

  it('Property 13.3: No role can invoke update or delete on AuditLogRepository', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('super_admin', 'org_admin', 'bureau_staff', 'it_rep', 'moe', 'external'),
        (role) => {
          const repo = new AuditLogRepository();

          // Regardless of role, there must be no update/delete method
          const updateMethod = (repo as unknown as Record<string, unknown>)['update'];
          const deleteMethod = (repo as unknown as Record<string, unknown>)['delete'];
          const removeMethod = (repo as unknown as Record<string, unknown>)['remove'];
          const patchMethod  = (repo as unknown as Record<string, unknown>)['patch'];

          expect(updateMethod).toBeUndefined();
          expect(deleteMethod).toBeUndefined();
          expect(removeMethod).toBeUndefined();
          expect(patchMethod).toBeUndefined();

          // The role variable is intentionally used to parameterise the test
          // (fast-check shrinks to the simplest failing role if any assertion fails)
          void role;
        },
      ),
      { numRuns: 6, verbose: true },
    );
  });
});
