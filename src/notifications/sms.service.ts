import { smsLogRepository } from './sms-log.repository';
import { config } from '../config';
import type { SmsLog } from '../db/schema';

export class SmsService {
  /**
   * Inserts an SMS log entry with status = "pending".
   * The SMS retry scheduler will pick it up and attempt delivery.
   */
  async enqueueAlert(
    phone: string,
    message: string,
    incidentId?: string,
  ): Promise<SmsLog> {
    return smsLogRepository.create({
      recipientPhone: phone,
      messageBody: message,
      incidentId: incidentId ?? undefined,
      status: 'pending',
      attemptCount: 0,
    });
  }

  /**
   * Sends an SMS immediately via the configured SMS gateway.
   * Inserts (or updates) the sms_log entry with the delivery outcome.
   *
   * Returns `true` when the gateway accepts the message, `false` otherwise.
   */
  async sendImmediate(
    phone: string,
    message: string,
    incidentId?: string,
  ): Promise<boolean> {
    // Create a log entry so every attempt is traceable
    const logEntry = await smsLogRepository.create({
      recipientPhone: phone,
      messageBody: message,
      incidentId: incidentId ?? undefined,
      status: 'pending',
      attemptCount: 1,
    });

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
          recipient: phone,
          message,
        }),
      });

      success = response.ok;
    } catch (err) {
      // Network-level failure — treat as failed delivery
      console.error('[SmsService] Gateway request failed:', err);
      success = false;
    }

    await smsLogRepository.updateStatus(
      logEntry.id,
      success ? 'sent' : 'failed',
      1,
    );

    return success;
  }
}

export const smsService = new SmsService();
export default SmsService;
