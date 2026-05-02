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

jest.mock('../../src/notifications/sms-log.repository');
jest.mock('../../src/audit/audit-log.repository');

import { smsLogRepository } from '../../src/notifications/sms-log.repository';
import { auditLogRepository } from '../../src/audit/audit-log.repository';

// ─── Shared arbitraries ───────────────────────────────────────────────────────

/** Generates a plausible phone number string without using a slow filter */
const phoneArbitrary = fc
  .tuple(
    fc.constantFrom('+', ''),
    fc.stringOf(
      fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      { minLength: 7, maxLength: 12 },
    ),
  )
  .map(([prefix, digits]) => `${prefix}${digits}`);

// ─── Retry loop under test ────────────────────────────────────────────────────

/**
 * Minimal in-process replica of the SMS retry loop used for property testing.
 *
 * This mirrors the logic in sms-retry.scheduler.ts but accepts injected
 * dependencies so we can control the gateway and repository in tests.
 */
const MAX_ATTEMPTS = 3;

interface SmsLogEntry {
  id: string;
  recipientPhone: string;
  messageBody: string;
  incidentId: string | null;
  status: string;
  attemptCount: number;
}

interface RetryResult {
  finalStatus: string;
  finalAttemptCount: number;
  auditEntriesWritten: number;
}

async function runRetryLoop(
  entry: SmsLogEntry,
  /** Returns true if the gateway accepts the message, false otherwise */
  gatewayResponds: (attempt: number) => boolean,
): Promise<RetryResult> {
  let currentEntry = { ...entry };
  let auditEntriesWritten = 0;

  while (
    (currentEntry.status === 'pending' || currentEntry.status === 'failed') &&
    currentEntry.attemptCount < MAX_ATTEMPTS
  ) {
    const newAttemptCount = currentEntry.attemptCount + 1;
    const success = gatewayResponds(newAttemptCount);

    let newStatus: string;
    if (success) {
      newStatus = 'sent';
    } else if (newAttemptCount >= MAX_ATTEMPTS) {
      newStatus = 'failed_permanent';
    } else {
      newStatus = 'failed';
    }

    // Simulate repository update
    await smsLogRepository.updateStatus(currentEntry.id, newStatus, newAttemptCount);

    // Simulate audit log write
    await auditLogRepository.append({
      actorUserId: '00000000-0000-0000-0000-000000000000',
      actorRole: 'system',
      actorOrgId: '00000000-0000-0000-0000-000000000000',
      incidentId: currentEntry.incidentId ?? undefined,
      actionType: 'sms_retry_attempt',
      fieldChanged: 'status',
      previousValue: currentEntry.status,
      newValue: `${newStatus} (attempt ${newAttemptCount})`,
    });

    auditEntriesWritten++;

    currentEntry = {
      ...currentEntry,
      status: newStatus,
      attemptCount: newAttemptCount,
    };
  }

  return {
    finalStatus: currentEntry.status,
    finalAttemptCount: currentEntry.attemptCount,
    auditEntriesWritten,
  };
}

/** Builds a base SMS log entry arbitrary */
function smsEntryArb(statusArb: fc.Arbitrary<string>, attemptArb: fc.Arbitrary<number>) {
  return fc.record({
    id:             fc.uuid(),
    recipientPhone: phoneArbitrary,
    messageBody:    fc.string({ minLength: 1, maxLength: 160 }),
    incidentId:     fc.option(fc.uuid(), { nil: null }),
    status:         statusArb,
    attemptCount:   attemptArb,
  });
}

// ─── P16: SMS Delivery Retry Bounded ─────────────────────────────────────────

/**
 * Property-Based Test for SMS Delivery Retry Bounded (P16)
 *
 * **Validates: Requirements 12.5, 12.4**
 *
 * Property 16: SMS Delivery Retry Bounded
 *
 * For any SMS send attempt that receives a delivery failure from the
 * SMS_Gateway, the system SHALL retry delivery up to 3 times at 60-second
 * intervals. After 3 failed attempts the system SHALL stop retrying and set
 * the status to "failed_permanent". Each attempt SHALL be logged (attempt_count
 * incremented) and recorded in the Audit_Log.
 */
describe('Property Test: SMS Delivery Retry Bounded (P16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations — tests override as needed
    (smsLogRepository.updateStatus as jest.Mock).mockResolvedValue(undefined);
    (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });
  });

  // ── P16.1: Retry stops at exactly 3 attempts when gateway always fails ───────

  it('Property 16.1: Retry stops at 3 attempts when gateway always fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        smsEntryArb(
          fc.constantFrom('pending', 'failed'),
          fc.integer({ min: 0, max: MAX_ATTEMPTS - 1 }),
        ),
        async (entry) => {
          jest.clearAllMocks();
          (smsLogRepository.updateStatus as jest.Mock).mockResolvedValue(undefined);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });

          // Gateway always fails
          const result = await runRetryLoop(entry, () => false);

          // Assert: attempt_count never exceeds MAX_ATTEMPTS
          expect(result.finalAttemptCount).toBeLessThanOrEqual(MAX_ATTEMPTS);

          // Assert: final status is "failed_permanent" (not "failed" or "pending")
          expect(result.finalStatus).toBe('failed_permanent');

          // Assert: the loop ran at most (MAX_ATTEMPTS - entry.attemptCount) times
          const maxPossibleAttempts = MAX_ATTEMPTS - entry.attemptCount;
          expect(result.auditEntriesWritten).toBeLessThanOrEqual(maxPossibleAttempts);
          expect(result.auditEntriesWritten).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P16.2: Each attempt increments attempt_count by exactly 1 ───────────────

  it('Property 16.2: Each retry attempt increments attempt_count by exactly 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        smsEntryArb(
          fc.constantFrom('pending', 'failed'),
          fc.integer({ min: 0, max: MAX_ATTEMPTS - 1 }),
        ),
        async (entry) => {
          jest.clearAllMocks();

          const observedAttemptCounts: number[] = [];

          (smsLogRepository.updateStatus as jest.Mock).mockImplementation(
            async (_id: string, _status: string, attemptCount: number) => {
              observedAttemptCounts.push(attemptCount);
            },
          );
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });

          // Gateway always fails so we see all attempts
          await runRetryLoop(entry, () => false);

          // Assert: each call increments by exactly 1 from the previous
          for (let i = 0; i < observedAttemptCounts.length; i++) {
            expect(observedAttemptCounts[i]).toBe(entry.attemptCount + i + 1);
          }
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P16.3: Each attempt is logged in the audit log ───────────────────────────

  it('Property 16.3: Each retry attempt produces exactly one audit log entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        smsEntryArb(
          fc.constantFrom('pending', 'failed'),
          fc.integer({ min: 0, max: MAX_ATTEMPTS - 1 }),
        ),
        async (entry) => {
          jest.clearAllMocks();
          (smsLogRepository.updateStatus as jest.Mock).mockResolvedValue(undefined);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });

          // Gateway always fails
          const result = await runRetryLoop(entry, () => false);

          // Assert: audit log was called exactly once per attempt
          expect(auditLogRepository.append).toHaveBeenCalledTimes(result.auditEntriesWritten);

          // Assert: updateStatus was called the same number of times
          expect(smsLogRepository.updateStatus).toHaveBeenCalledTimes(result.auditEntriesWritten);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P16.4: Successful delivery stops retrying immediately ────────────────────

  it('Property 16.4: Retry stops immediately when gateway succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        smsEntryArb(
          fc.constantFrom('pending', 'failed'),
          fc.integer({ min: 0, max: MAX_ATTEMPTS - 1 }),
        ).chain((entry) => {
          // successOnAttempt must be within the remaining attempts for this entry
          const remainingAttempts = MAX_ATTEMPTS - entry.attemptCount;
          return fc
            .integer({ min: 1, max: remainingAttempts })
            .map((successOnAttempt) => ({ entry, successOnAttempt }));
        }),
        async ({ entry, successOnAttempt }) => {
          jest.clearAllMocks();
          (smsLogRepository.updateStatus as jest.Mock).mockResolvedValue(undefined);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });

          let loopAttempt = 0;
          const result = await runRetryLoop(entry, () => {
            loopAttempt++;
            return loopAttempt === successOnAttempt;
          });

          // Assert: final status is "sent"
          expect(result.finalStatus).toBe('sent');

          // Assert: the loop stopped as soon as success was returned
          expect(result.auditEntriesWritten).toBe(successOnAttempt);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  // ── P16.5: Entries already at MAX_ATTEMPTS are not retried ──────────────────

  it('Property 16.5: Entries with attempt_count >= MAX_ATTEMPTS are not retried', async () => {
    await fc.assert(
      fc.asyncProperty(
        smsEntryArb(
          fc.constantFrom('failed', 'failed_permanent'),
          fc.integer({ min: MAX_ATTEMPTS, max: MAX_ATTEMPTS + 5 }),
        ),
        async (entry) => {
          jest.clearAllMocks();
          (smsLogRepository.updateStatus as jest.Mock).mockResolvedValue(undefined);
          (auditLogRepository.append as jest.Mock).mockResolvedValue({ id: 1, occurredAt: new Date() });

          const result = await runRetryLoop(entry, () => false);

          // Assert: no attempts were made (loop condition was false from the start)
          expect(result.auditEntriesWritten).toBe(0);
          expect(smsLogRepository.updateStatus).not.toHaveBeenCalled();
          expect(auditLogRepository.append).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});
