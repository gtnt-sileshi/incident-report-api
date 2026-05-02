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

// Mock all repositories used by IncidentService
jest.mock('../../src/incidents/incident.repository');
jest.mock('../../src/audit/audit-log.repository');
jest.mock('../../src/routing/routing-rule.service');
jest.mock('../../src/devices/exam-center-assignment.repository');
jest.mock('../../src/organizations/organization.repository');

import { incidentRepository } from '../../src/incidents/incident.repository';
import { auditLogRepository } from '../../src/audit/audit-log.repository';
import { incidentService, STATUS_ORDER } from '../../src/incidents/incident.service';
import { Incident } from '../../src/db/schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type IncidentStatus = 'Reported' | 'Assigned' | 'In-Progress' | 'Resolved';

const ALL_STATUSES: IncidentStatus[] = ['Reported', 'Assigned', 'In-Progress', 'Resolved'];

const makeIncident = (
  id: string,
  status: IncidentStatus,
  assignedOrgId = 'org-1',
): Incident => ({
  id,
  examFieldId:       'field-1',
  incidentTypeId:    'type-1',
  reportedByUserId:  'user-1',
  deviceId:          null,
  priority:          'Medium',
  status,
  description:       null,
  assignedOrgId,
  assignedUserId:    null,
  resolvedAt:        null,
  resolutionSummary: null,
  localId:           null,
  createdAt:         new Date('2024-01-01T00:00:00Z'),
  updatedAt:         new Date('2024-01-01T00:00:00Z'),
});

// ─── P11: Forward-Only Status Transitions ────────────────────────────────────

/**
 * Property-Based Test for Forward-Only Status Transitions (P11)
 *
 * **Validates: Requirements 6.5**
 *
 * Property 11: Status Transition Forward-Only Invariant
 *
 * For any incident in status S, and for any user without Super_Admin
 * authorization, any attempt to transition the incident to a status that
 * precedes S in the lifecycle order (Reported → Assigned → In-Progress →
 * Resolved) SHALL be rejected. The status SHALL only move forward.
 */
describe('Property Test: Forward-Only Status Transitions (P11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 11: Backward transitions are rejected for non-Super_Admin users', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a (current_status, target_status) pair where target < current
        fc.integer({ min: 1, max: 3 }).chain((currentIdx) => {
          return fc.integer({ min: 0, max: currentIdx - 1 }).map((targetIdx) => ({
            currentStatus: ALL_STATUSES[currentIdx],
            targetStatus:  ALL_STATUSES[targetIdx],
          }));
        }),
        // Non-Super_Admin roles
        fc.constantFrom('bureau_staff', 'org_admin', 'it_rep', 'external', 'moe'),
        fc.uuid(), // incidentId
        fc.uuid(), // userId
        fc.uuid(), // orgId
        async ({ currentStatus, targetStatus }, role, incidentId, userId, orgId) => {
          // Sanity check: target must be strictly before current
          expect(STATUS_ORDER[targetStatus]).toBeLessThan(STATUS_ORDER[currentStatus]);

          // Mock: incident exists with currentStatus
          (incidentRepository.findById as jest.Mock).mockResolvedValue(
            makeIncident(incidentId, currentStatus),
          );

          // Act & Assert: backward transition should be rejected
          await expect(
            incidentService.updateStatus(
              incidentId,
              targetStatus,
              { sub: userId, role, orgId },
            ),
          ).rejects.toMatchObject({
            statusCode: 400,
            code:       'INVALID_STATUS_TRANSITION',
          });
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 11: Forward transitions are accepted for non-Super_Admin users', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a (current_status, target_status) pair where target > current
        fc.integer({ min: 0, max: 2 }).chain((currentIdx) => {
          return fc.integer({ min: currentIdx + 1, max: 3 }).map((targetIdx) => ({
            currentStatus: ALL_STATUSES[currentIdx],
            targetStatus:  ALL_STATUSES[targetIdx],
          }));
        }),
        // Non-Super_Admin roles
        fc.constantFrom('bureau_staff', 'org_admin', 'it_rep', 'external'),
        fc.uuid(), // incidentId
        fc.uuid(), // userId
        fc.uuid(), // orgId
        async ({ currentStatus, targetStatus }, role, incidentId, userId, orgId) => {
          // Sanity check: target must be strictly after current
          expect(STATUS_ORDER[targetStatus]).toBeGreaterThan(STATUS_ORDER[currentStatus]);

          // Mock: incident exists with currentStatus
          (incidentRepository.findById as jest.Mock).mockResolvedValue(
            makeIncident(incidentId, currentStatus),
          );

          // Mock: status update succeeds
          const updatedIncident = makeIncident(incidentId, targetStatus);
          (incidentRepository.updateStatus as jest.Mock).mockResolvedValue(updatedIncident);
          (incidentRepository.resolve as jest.Mock).mockResolvedValue(updatedIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          // For Resolved transitions, provide a valid resolution summary
          const resolutionSummary =
            targetStatus === 'Resolved' ? 'Issue has been fully resolved and verified.' : undefined;

          // Act: forward transition should succeed
          const result = await incidentService.updateStatus(
            incidentId,
            targetStatus,
            { sub: userId, role, orgId },
            resolutionSummary,
          );

          // Assert: the updated incident is returned with the new status
          expect(result.status).toBe(targetStatus);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 11: Super_Admin can perform backward transitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a (current_status, target_status) pair where target < current
        fc.integer({ min: 1, max: 3 }).chain((currentIdx) => {
          return fc.integer({ min: 0, max: currentIdx - 1 }).map((targetIdx) => ({
            currentStatus: ALL_STATUSES[currentIdx],
            targetStatus:  ALL_STATUSES[targetIdx],
          }));
        }),
        fc.uuid(), // incidentId
        fc.uuid(), // userId
        fc.uuid(), // orgId
        async ({ currentStatus, targetStatus }, incidentId, userId, orgId) => {
          // Mock: incident exists with currentStatus
          (incidentRepository.findById as jest.Mock).mockResolvedValue(
            makeIncident(incidentId, currentStatus),
          );

          // Mock: status update succeeds
          const updatedIncident = makeIncident(incidentId, targetStatus);
          (incidentRepository.updateStatus as jest.Mock).mockResolvedValue(updatedIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          // Act: Super_Admin backward transition should succeed
          const result = await incidentService.updateStatus(
            incidentId,
            targetStatus,
            { sub: userId, role: 'super_admin', orgId },
          );

          // Assert: the updated incident is returned
          expect(result.status).toBe(targetStatus);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 11: Same-status transition is allowed (idempotent)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES),
        fc.constantFrom('bureau_staff', 'org_admin', 'it_rep'),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (status, role, incidentId, userId, orgId) => {
          // Mock: incident exists with the same status
          (incidentRepository.findById as jest.Mock).mockResolvedValue(
            makeIncident(incidentId, status),
          );

          // Mock: status update succeeds
          const updatedIncident = makeIncident(incidentId, status);
          (incidentRepository.updateStatus as jest.Mock).mockResolvedValue(updatedIncident);
          (incidentRepository.resolve as jest.Mock).mockResolvedValue(updatedIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          // For Resolved, provide a resolution summary
          const resolutionSummary =
            status === 'Resolved' ? 'Issue has been fully resolved and verified.' : undefined;

          // Act: same-status transition should succeed (not a backward transition)
          const result = await incidentService.updateStatus(
            incidentId,
            status,
            { sub: userId, role, orgId },
            resolutionSummary,
          );

          expect(result.status).toBe(status);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 11: Resolved transition requires resolution summary of at least 10 chars', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Current status can be anything before Resolved
        fc.constantFrom('Reported' as const, 'Assigned' as const, 'In-Progress' as const),
        fc.constantFrom('bureau_staff', 'org_admin'),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        // Short summary (0-9 chars)
        fc.string({ minLength: 0, maxLength: 9 }),
        async (currentStatus, role, incidentId, userId, orgId, shortSummary) => {
          // Mock: incident exists
          (incidentRepository.findById as jest.Mock).mockResolvedValue(
            makeIncident(incidentId, currentStatus),
          );

          // Act & Assert: should reject with RESOLUTION_SUMMARY_REQUIRED
          await expect(
            incidentService.updateStatus(
              incidentId,
              'Resolved',
              { sub: userId, role, orgId },
              shortSummary,
            ),
          ).rejects.toMatchObject({
            statusCode: 400,
            code:       'RESOLUTION_SUMMARY_REQUIRED',
          });
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 11: Resolved transition succeeds with summary of at least 10 chars', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Reported' as const, 'Assigned' as const, 'In-Progress' as const),
        fc.constantFrom('bureau_staff', 'org_admin'),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        // Valid summary (10+ non-whitespace chars after trimming)
        fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10),
        async (currentStatus, role, incidentId, userId, orgId, validSummary) => {
          // Mock: incident exists
          (incidentRepository.findById as jest.Mock).mockResolvedValue(
            makeIncident(incidentId, currentStatus),
          );

          // Mock: resolve succeeds
          const resolvedIncident = makeIncident(incidentId, 'Resolved');
          (incidentRepository.resolve as jest.Mock).mockResolvedValue(resolvedIncident);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1 });

          // Act: should succeed
          const result = await incidentService.updateStatus(
            incidentId,
            'Resolved',
            { sub: userId, role, orgId },
            validSummary,
          );

          expect(result.status).toBe('Resolved');
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});
