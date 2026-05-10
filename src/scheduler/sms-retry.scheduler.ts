import cron from 'node-cron';
import { smsLogRepository } from '../notifications/sms-log.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { config } from '../config';

const MAX_ATTEMPTS = 3;

/**
 * System actor used for audit log entries written by the scheduler.
 * These values are synthetic — the scheduler is not a human user.
 */
const SCHEDULER_ACTOR = {
  actorUserId: '00000000-0000-0000-0000-000000000000',
  actorRole: 'system',
  actorOrgId: '00000000-0000-0000-0000-000000000000',
};

/**
 * Processes all SMS log entries that are eligible for retry:
 *   - status is "pending" or "failed"
 *   - attempt_count < MAX_ATTEMPTS
 *
 * For each entry:
 *   1. Attempt delivery via the SMS gateway.
 *   2. Increment attempt_count.
 *   3. Update status to "sent", "failed", or "failed_permanent" (when
 *      attempt_count reaches MAX_ATTEMPTS and delivery still fails).
 *   4. Write an audit log entry recording the attempt.
 */
async function processPendingSms(): Promise<void> {
  let entries;

  try {
    entries = await smsLogRepository.findPendingForRetry(MAX_ATTEMPTS);
  } catch (err) {
    console.error('[SmsRetryScheduler] Failed to query sms_log:', err);
    return;
  }

  if (entries.length === 0) {
    return;
  }

  console.info(`[SmsRetryScheduler] Processing ${entries.length} pending SMS entries`);

  for (const entry of entries) {
    const newAttemptCount = entry.attemptCount + 1;
    let success = false;

    try {
      const response = await fetch(config.SMS_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.SMS_GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          sender: config.SMS_GATEWAY_SENDER_ID,
          recipient: entry.recipientPhone,
          message: entry.messageBody,
        }),
      });

      success = response.ok;
    } catch (err) {
      console.error(
        `[SmsRetryScheduler] Gateway request failed for sms_log ${entry.id}:`,
        err,
      );
      success = false;
    }

    // Determine the new status
    let newStatus: string;
    if (success) {
      newStatus = 'sent';
    } else if (newAttemptCount >= MAX_ATTEMPTS) {
      newStatus = 'failed_permanent';
    } else {
      newStatus = 'failed';
    }

    try {
      await smsLogRepository.updateStatus(entry.id, newStatus, newAttemptCount);
    } catch (err) {
      console.error(
        `[SmsRetryScheduler] Failed to update sms_log ${entry.id}:`,
        err,
      );
    }

    // Write audit log entry for this attempt
    try {
      await auditLogRepository.append({
        ...SCHEDULER_ACTOR,
        incidentId: entry.incidentId ?? undefined,
        actionType: 'sms_retry_attempt',
        fieldChanged: 'status',
        previousValue: entry.status,
        newValue: `${newStatus} (attempt ${newAttemptCount})`,
      });
    } catch (err) {
      console.error(
        `[SmsRetryScheduler] Failed to write audit log for sms_log ${entry.id}:`,
        err,
      );
    }
  }
}

/**
 * Starts the SMS retry cron job.
 * Runs every 60 seconds.
 * Call this once from server.ts after the database connection is established.
 */
export function startSmsRetryScheduler(): void {
  cron.schedule('*/1 * * * *', () => {
    void processPendingSms();
  });

  console.info('[SmsRetryScheduler] Started — running every 60 seconds');
}
