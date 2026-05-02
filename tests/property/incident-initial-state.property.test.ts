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

// Mock all repositories and services used by IncidentService
jest.mock('../../src/incidents/incident.repository');
jest.mock('../../src/audit/audit-log.repository');
jest.mock('../../src/routing/routing-rule.service');
jest.mock('../../src/devices/exam-center-assignment.repository');
jest.mock('../../src/organizations/organization.repository');

import { incidentRepository } from '../../src/incidents/incident.repository';
import { auditLogRepository } from '../../src/audit/audit-log.repository';
import { routingRuleService } from '../../src/routing/routing-rule.service';
import { examCenterAssignmentRepository } from '../../src/devices/exam-center-assignment.repository';
import { organizationRepository } from '../../src/organizations/organization.repository';
import { incidentService } from '../../src/incidents/incident.service';
import { Incident, Organization } from '../../src/db/schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ITDB_ORG_ID = 'itdb-org-id-00000000-0000-0000-0000-000000000001';

const makeItdbOrg = (): Organization => ({
  id:        ITDB_ORG_ID,
  name:      'ITDB',
  type:      'itdb',
  isActive:  true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
});

const makeIncident = (
  id: string,
  examFieldId: string,
  incidentTypeId: string,
  reportedByUserId: string,
  priority: 'Low' | 'Medium' | 'High',
  assignedOrgId: string,
): Incident => ({
  id,
  examFieldId,
  incidentTypeId,
  reportedByUserId,
  deviceId:          null,
  priority,
  status:            'Reported',
  description:       null,
  assignedOrgId,
  assignedUserId:    null,
  resolvedAt:        null,
  resolutionSummary: null,
  localId:           null,
  createdAt:         new Date('2024-01-01T00:00:00Z'),
  updatedAt:         new Date('2024-01-01T00:00:00Z'),
});

// ─── P10: Incident Initial State Invariant ────────────────────────────────────

/**
 * Property-Based Test for Incident Initial State Invariant (P10)
 *
 * **Validates: Requirements 6.1**
 *
 * Property 10: Incident Initial State Invariant
 *
 * For any incident successfully received by the central server, the initial
 * status SHALL be "Reported" and the assigned_org SHALL be ITDB. No other
 * initial status or assignment SHALL be possible through the normal submission
 * path.
 */
describe('Property Test: Incident Initial State Invariant (P10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 10: Every created incident has status="Reported" and assigned_org=ITDB', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          examFieldId:    fc.uuid(),
          incidentTypeId: fc.uuid(),
          priority:       fc.constantFrom('Low' as const, 'Medium' as const, 'High' as const),
          description:    fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
          localId:        fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        }),
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constantFrom('it_rep', 'bureau_staff'),
          orgId: fc.uuid(),
        }),
        async (submissionData, requestingUser) => {
          jest.clearAllMocks();
          const itdbOrg = makeItdbOrg();

          (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([
            { id: 'assign-1', userId: requestingUser.sub, examFieldId: submissionData.examFieldId, assignedAt: new Date() },
          ]);
          (organizationRepository.findByName as jest.Mock).mockResolvedValue(itdbOrg);
          (routingRuleService.evaluateRule as jest.Mock).mockResolvedValue(null);

          const createdIncident = makeIncident(
            'incident-' + submissionData.examFieldId,
            submissionData.examFieldId,
            submissionData.incidentTypeId,
            requestingUser.sub,
            submissionData.priority,
            itdbOrg.id,
          );
          (incidentRepository.create as jest.Mock).mockResolvedValue(createdIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          const result = await incidentService.createIncident(submissionData, requestingUser);

          // Assert: status is always "Reported"
          expect(result.status).toBe('Reported');
          // Assert: assigned_org is ITDB
          expect(result.assignedOrgId).toBe(ITDB_ORG_ID);

          // Assert: incident repository was called with correct initial values
          const createCall = (incidentRepository.create as jest.Mock).mock.calls[0][0];
          expect(createCall.status).toBe('Reported');
          expect(createCall.assignedOrgId).toBe(ITDB_ORG_ID);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 10: Routing rule with autoAssign=false does NOT override ITDB assignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          examFieldId:    fc.uuid(),
          incidentTypeId: fc.uuid(),
          priority:       fc.constantFrom('Low' as const, 'Medium' as const, 'High' as const),
        }),
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constant('it_rep'),
          orgId: fc.uuid(),
        }),
        fc.uuid(),
        async (submissionData, requestingUser, ruleTargetOrgId) => {
          jest.clearAllMocks();
          const itdbOrg = makeItdbOrg();

          (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([
            { id: 'assign-1', userId: requestingUser.sub, examFieldId: submissionData.examFieldId, assignedAt: new Date() },
          ]);
          (organizationRepository.findByName as jest.Mock).mockResolvedValue(itdbOrg);
          (routingRuleService.evaluateRule as jest.Mock).mockResolvedValue({
            id: 'rule-1', incidentTypeId: submissionData.incidentTypeId,
            targetOrgId: ruleTargetOrgId, targetUserId: null,
            autoAssign: false, isActive: true, createdAt: new Date(), updatedAt: new Date(),
          });

          const createdIncident = makeIncident(
            'incident-' + submissionData.examFieldId,
            submissionData.examFieldId, submissionData.incidentTypeId,
            requestingUser.sub, submissionData.priority, itdbOrg.id,
          );
          (incidentRepository.create as jest.Mock).mockResolvedValue(createdIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          const result = await incidentService.createIncident(submissionData, requestingUser);

          expect(result.status).toBe('Reported');
          const createCall = (incidentRepository.create as jest.Mock).mock.calls[0][0];
          expect(createCall.assignedOrgId).toBe(ITDB_ORG_ID);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 10: Routing rule with autoAssign=true overrides the assigned org', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          examFieldId:    fc.uuid(),
          incidentTypeId: fc.uuid(),
          priority:       fc.constantFrom('Low' as const, 'Medium' as const, 'High' as const),
        }),
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constant('it_rep'),
          orgId: fc.uuid(),
        }),
        fc.uuid(),
        async (submissionData, requestingUser, ruleTargetOrgId) => {
          jest.clearAllMocks();
          const itdbOrg = makeItdbOrg();

          (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([
            { id: 'assign-1', userId: requestingUser.sub, examFieldId: submissionData.examFieldId, assignedAt: new Date() },
          ]);
          (organizationRepository.findByName as jest.Mock).mockResolvedValue(itdbOrg);
          (routingRuleService.evaluateRule as jest.Mock).mockResolvedValue({
            id: 'rule-1', incidentTypeId: submissionData.incidentTypeId,
            targetOrgId: ruleTargetOrgId, targetUserId: null,
            autoAssign: true, isActive: true, createdAt: new Date(), updatedAt: new Date(),
          });

          const createdIncident = makeIncident(
            'incident-' + submissionData.examFieldId,
            submissionData.examFieldId, submissionData.incidentTypeId,
            requestingUser.sub, submissionData.priority, ruleTargetOrgId,
          );
          (incidentRepository.create as jest.Mock).mockResolvedValue(createdIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          const result = await incidentService.createIncident(submissionData, requestingUser);

          // Status is still "Reported" even when routing rule overrides org
          expect(result.status).toBe('Reported');

          // The service passes ruleTargetOrgId to the repository when autoAssign=true
          const createCall = (incidentRepository.create as jest.Mock).mock.calls[0][0];
          expect(createCall.assignedOrgId).toBe(ruleTargetOrgId);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 10: Exam field not in assignment is rejected (403)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          examFieldId:    fc.uuid(),
          incidentTypeId: fc.uuid(),
          priority:       fc.constantFrom('Low' as const, 'Medium' as const, 'High' as const),
        }),
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constant('it_rep'),
          orgId: fc.uuid(),
        }),
        async (submissionData, requestingUser) => {
          jest.clearAllMocks();
          (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([]);

          await expect(
            incidentService.createIncident(submissionData, requestingUser),
          ).rejects.toMatchObject({
            statusCode: 403,
            code:       'EXAM_FIELD_NOT_ASSIGNED',
          });
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});

// ─── P3: Incident Scoping by Organization ────────────────────────────────────

/**
 * Property-Based Test for Incident Scoping by Organization (P3)
 *
 * **Validates: Requirements 1.3, 9.1**
 *
 * Property 3: Incident Scoping by Organization
 *
 * For any user belonging to an external organization (Ethio_Telecom, ELPA,
 * Security_Police), the set of incidents returned by any query SHALL contain
 * only incidents where the assigned_org_id matches that user's organization ID.
 * No incident assigned to a different organization SHALL appear in their view.
 */
describe('Property Test: Incident Scoping by Organization (P3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 3: External org users only see incidents assigned to their org', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constantFrom('external', 'ethio_telecom', 'elpa', 'security_police'),
          orgId: fc.uuid(),
        }),
        fc.array(
          fc.record({
            id:            fc.uuid(),
            assignedOrgId: fc.uuid(),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (externalUser, allIncidents) => {
          const myOrgIncidents = allIncidents.map((inc) => ({
            ...makeIncident(inc.id, 'field-1', 'type-1', 'user-1', 'Low', externalUser.orgId),
            id: inc.id,
          }));

          (incidentRepository.findAll as jest.Mock).mockImplementation(
            async (filters?: { assignedOrgId?: string }) => {
              if (filters?.assignedOrgId) {
                return myOrgIncidents.filter(
                  (inc) => inc.assignedOrgId === filters.assignedOrgId,
                );
              }
              return myOrgIncidents;
            },
          );

          const result = await incidentService.listIncidents(externalUser);

          // Assert: every returned incident belongs to the user's org
          for (const incident of result) {
            expect(incident.assignedOrgId).toBe(externalUser.orgId);
          }

          // Assert: the repository was called with the user's orgId as filter
          expect(incidentRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ assignedOrgId: externalUser.orgId }),
          );
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 3: Bureau_Staff users see all incidents (no org scoping)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constantFrom('bureau_staff', 'super_admin'),
          orgId: fc.uuid(),
        }),
        fc.array(
          fc.record({
            id:            fc.uuid(),
            assignedOrgId: fc.uuid(),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (bureauUser, allIncidents) => {
          const incidents = allIncidents.map((inc) =>
            makeIncident(inc.id, 'field-1', 'type-1', 'user-1', 'Low', inc.assignedOrgId),
          );

          (incidentRepository.findAll as jest.Mock).mockResolvedValue(incidents);

          const result = await incidentService.listIncidents(bureauUser);

          expect(result.length).toBe(incidents.length);

          const callArgs = (incidentRepository.findAll as jest.Mock).mock.calls[0];
          const filters = callArgs?.[0] ?? {};
          expect(filters.assignedOrgId).toBeUndefined();
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 3: External org user cannot access incident assigned to different org', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constantFrom('external', 'ethio_telecom', 'elpa', 'security_police'),
          orgId: fc.uuid(),
        }),
        fc.uuid(),
        async (externalUser, differentOrgId) => {
          if (differentOrgId === externalUser.orgId) return;

          const incident = makeIncident(
            'incident-1', 'field-1', 'type-1', 'user-1', 'Low', differentOrgId,
          );
          (incidentRepository.findById as jest.Mock).mockResolvedValue(incident);

          await expect(
            incidentService.getIncident('incident-1', externalUser),
          ).rejects.toMatchObject({
            statusCode: 403,
            code:       'FORBIDDEN',
          });
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 3: External org user can access incident assigned to their own org', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sub:   fc.uuid(),
          role:  fc.constantFrom('external', 'ethio_telecom', 'elpa', 'security_police'),
          orgId: fc.uuid(),
        }),
        async (externalUser) => {
          const incident = makeIncident(
            'incident-1', 'field-1', 'type-1', 'user-1', 'Low', externalUser.orgId,
          );
          (incidentRepository.findById as jest.Mock).mockResolvedValue(incident);

          const result = await incidentService.getIncident('incident-1', externalUser);

          expect(result.assignedOrgId).toBe(externalUser.orgId);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});
