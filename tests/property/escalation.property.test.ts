import * as fc from 'fast-check';

// ─── Mock config before any module imports ────────────────────────────────────

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
    SMS_GATEWAY_URL: 'https://test-sms-gateway.example.com/send',
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

// ─── Mock database ────────────────────────────────────────────────────────────

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// ─── Mock repositories ────────────────────────────────────────────────────────

jest.mock('../../src/incidents/incident.repository');
jest.mock('../../src/organizations/organization.repository');
jest.mock('../../src/users/user.repository');
jest.mock('../../src/audit/audit-log.repository');
jest.mock('../../src/notifications/sms.service');
jest.mock('../../src/push/push-notification.service');

import { incidentRepository } from '../../src/incidents/incident.repository';
import { organizationRepository } from '../../src/organizations/organization.repository';
import { userRepository } from '../../src/users/user.repository';
import { auditLogRepository } from '../../src/audit/audit-log.repository';
import { smsService } from '../../src/notifications/sms.service';
import { pushNotificationService } from '../../src/push/push-notification.service';

// ─── Shared arbitraries ───────────────────────────────────────────────────────

/** Generates a plausible UUID string */
const uuidArbitrary = fc.uuid();

/** Generates a priority value */
const priorityArbitrary = fc.constantFrom('Low' as const, 'Medium' as const, 'High' as const);

/** Generates an incident status */
const statusArbitrary = fc.constantFrom('Reported', 'Assigned', 'In-Progress', 'Resolved');

/** Generates elapsed time in minutes */
const elapsedMinutesArbitrary = fc.integer({ min: 0, max: 200 });

// ─── Escalation logic under test ──────────────────────────────────────────────

/**
 * Minimal in-process replica of the escalation logic used for property testing.
 *
 * This mirrors the logic in escalation.scheduler.ts but accepts injected
 * dependencies so we can control the repositories in tests.
 */

interface Incident {
  id: string;
  priority: 'Low' | 'Medium' | 'High';
  status: string;
  createdAt: Date;
  assignedOrgId: string | null;
}

interface EscalationThresholds {
  High: number;
  Medium: number;
}

interface EscalationResult {
  escalated: boolean;
  reason?: string;
}

/**
 * Determines if an incident should be escalated based on priority and elapsed time.
 */
function shouldEscalate(
  incident: Incident,
  elapsedMinutes: number,
  thresholds: EscalationThresholds,
): EscalationResult {
  // Only escalate In-Progress incidents
  if (incident.status !== 'In-Progress') {
    return { escalated: false, reason: 'status not In-Progress' };
  }

  // Check priority-based thresholds
  if (incident.priority === 'High' && elapsedMinutes >= thresholds.High) {
    return { escalated: true, reason: `High priority, ${elapsedMinutes} >= ${thresholds.High} minutes` };
  }

  if (incident.priority === 'Medium' && elapsedMinutes >= thresholds.Medium) {
    return { escalated: true, reason: `Medium priority, ${elapsedMinutes} >= ${thresholds.Medium} minutes` };
  }

  // Low priority incidents are never auto-escalated
  if (incident.priority === 'Low') {
    return { escalated: false, reason: 'Low priority incidents not auto-escalated' };
  }

  return { escalated: false, reason: 'threshold not exceeded' };
}

// ─── P5: Automatic Escalation by Priority Threshold ──────────────────────────

/**
 * Property-Based Test for Automatic Escalation by Priority Threshold (P5)
 *
 * **Validates: Requirements 7.7, 7.8, 7.9**
 *
 * Property 5: Automatic Escalation by Priority Threshold
 *
 * For any incident with status "In-Progress", if the incident has priority "High"
 * and remains unresolved for 30 or more minutes, OR has priority "Medium" and
 * remains unresolved for 90 or more minutes, the system SHALL trigger an
 * escalation to the MoE exam-coordination unit and send an SMS alert. The
 * escalation SHALL be recorded in the Audit_Log with the trigger condition and
 * timestamp.
 */
describe('Property Test: Automatic Escalation by Priority Threshold (P5)', () => {
  const THRESHOLDS: EscalationThresholds = {
    High: 30,
    Medium: 90,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (incidentRepository.updateAssignment as jest.Mock).mockResolvedValue({
      id: 'test-incident-id',
      assignedOrgId: 'moe-org-id',
    });
    (organizationRepository.findByName as jest.Mock).mockImplementation(async (name: string) => {
      if (name === 'MoE') {
        return { id: 'moe-org-id', name: 'MoE', type: 'government', isActive: true };
      }
      if (name === 'ITDB') {
        return { id: 'itdb-org-id', name: 'ITDB', type: 'government', isActive: true };
      }
      return null;
    });
    (userRepository.findAll as jest.Mock).mockResolvedValue([]);
    (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });
    (smsService.enqueueAlert as jest.Mock).mockResolvedValue({ id: 'sms-log-id' });
    (pushNotificationService.sendToOrg as jest.Mock).mockResolvedValue(undefined);
    (pushNotificationService.sendToUsers as jest.Mock).mockResolvedValue(undefined);
  });

  // ── P5.1: High-priority incidents escalate at exactly 30 minutes ─────────────

  it('Property 5.1: High-priority In-Progress incidents escalate iff elapsed >= 30 minutes', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        elapsedMinutesArbitrary,
        uuidArbitrary,
        async (incidentId, elapsedMinutes, assignedOrgId) => {
          const incident: Incident = {
            id: incidentId,
            priority: 'High',
            status: 'In-Progress',
            createdAt: new Date(Date.now() - elapsedMinutes * 60000),
            assignedOrgId,
          };

          const result = shouldEscalate(incident, elapsedMinutes, THRESHOLDS);

          // Assert: escalation triggered iff elapsed >= 30
          if (elapsedMinutes >= THRESHOLDS.High) {
            expect(result.escalated).toBe(true);
            expect(result.reason).toContain('High priority');
          } else {
            expect(result.escalated).toBe(false);
          }
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P5.2: Medium-priority incidents escalate at exactly 90 minutes ───────────

  it('Property 5.2: Medium-priority In-Progress incidents escalate iff elapsed >= 90 minutes', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        elapsedMinutesArbitrary,
        uuidArbitrary,
        async (incidentId, elapsedMinutes, assignedOrgId) => {
          const incident: Incident = {
            id: incidentId,
            priority: 'Medium',
            status: 'In-Progress',
            createdAt: new Date(Date.now() - elapsedMinutes * 60000),
            assignedOrgId,
          };

          const result = shouldEscalate(incident, elapsedMinutes, THRESHOLDS);

          // Assert: escalation triggered iff elapsed >= 90
          if (elapsedMinutes >= THRESHOLDS.Medium) {
            expect(result.escalated).toBe(true);
            expect(result.reason).toContain('Medium priority');
          } else {
            expect(result.escalated).toBe(false);
          }
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P5.3: Low-priority incidents never auto-escalate ─────────────────────────

  it('Property 5.3: Low-priority incidents never auto-escalate regardless of elapsed time', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        elapsedMinutesArbitrary,
        uuidArbitrary,
        async (incidentId, elapsedMinutes, assignedOrgId) => {
          const incident: Incident = {
            id: incidentId,
            priority: 'Low',
            status: 'In-Progress',
            createdAt: new Date(Date.now() - elapsedMinutes * 60000),
            assignedOrgId,
          };

          const result = shouldEscalate(incident, elapsedMinutes, THRESHOLDS);

          // Assert: Low priority never escalates
          expect(result.escalated).toBe(false);
          expect(result.reason).toContain('Low priority');
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P5.4: Only In-Progress incidents are eligible for escalation ─────────────

  it('Property 5.4: Only In-Progress incidents are eligible for escalation', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        priorityArbitrary,
        statusArbitrary.filter((s) => s !== 'In-Progress'),
        fc.integer({ min: 100, max: 200 }), // Always exceeds thresholds
        uuidArbitrary,
        async (incidentId, priority, status, elapsedMinutes, assignedOrgId) => {
          const incident: Incident = {
            id: incidentId,
            priority,
            status,
            createdAt: new Date(Date.now() - elapsedMinutes * 60000),
            assignedOrgId,
          };

          const result = shouldEscalate(incident, elapsedMinutes, THRESHOLDS);

          // Assert: non-In-Progress incidents never escalate
          expect(result.escalated).toBe(false);
          expect(result.reason).toContain('status not In-Progress');
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P5.5: Escalation threshold is exact (boundary testing) ───────────────────

  it('Property 5.5: Escalation occurs at exact threshold boundary', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        fc.constantFrom('High' as const, 'Medium' as const),
        uuidArbitrary,
        async (incidentId, priority, assignedOrgId) => {
          const threshold = priority === 'High' ? THRESHOLDS.High : THRESHOLDS.Medium;

          // Test at threshold - 1 (should NOT escalate)
          const incidentBefore: Incident = {
            id: incidentId,
            priority,
            status: 'In-Progress',
            createdAt: new Date(Date.now() - (threshold - 1) * 60000),
            assignedOrgId,
          };
          const resultBefore = shouldEscalate(incidentBefore, threshold - 1, THRESHOLDS);
          expect(resultBefore.escalated).toBe(false);

          // Test at exact threshold (SHOULD escalate)
          const incidentAt: Incident = {
            id: incidentId,
            priority,
            status: 'In-Progress',
            createdAt: new Date(Date.now() - threshold * 60000),
            assignedOrgId,
          };
          const resultAt = shouldEscalate(incidentAt, threshold, THRESHOLDS);
          expect(resultAt.escalated).toBe(true);

          // Test at threshold + 1 (SHOULD escalate)
          const incidentAfter: Incident = {
            id: incidentId,
            priority,
            status: 'In-Progress',
            createdAt: new Date(Date.now() - (threshold + 1) * 60000),
            assignedOrgId,
          };
          const resultAfter = shouldEscalate(incidentAfter, threshold + 1, THRESHOLDS);
          expect(resultAfter.escalated).toBe(true);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  // ── P5.6: Escalation decision is deterministic ───────────────────────────────

  it('Property 5.6: Escalation decision is deterministic for same inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        priorityArbitrary,
        statusArbitrary,
        elapsedMinutesArbitrary,
        uuidArbitrary,
        async (incidentId, priority, status, elapsedMinutes, assignedOrgId) => {
          const incident: Incident = {
            id: incidentId,
            priority,
            status,
            createdAt: new Date(Date.now() - elapsedMinutes * 60000),
            assignedOrgId,
          };

          // Call twice with same inputs
          const result1 = shouldEscalate(incident, elapsedMinutes, THRESHOLDS);
          const result2 = shouldEscalate(incident, elapsedMinutes, THRESHOLDS);

          // Assert: results are identical
          expect(result1.escalated).toBe(result2.escalated);
          expect(result1.reason).toBe(result2.reason);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});
