import { eq, and, lt, or } from 'drizzle-orm';
import { getDb } from '../db/index';
import { smsLog, SmsLog, NewSmsLog } from '../db/schema';

export class SmsLogRepository {
  private get db() {
    return getDb();
  }

  async create(data: NewSmsLog): Promise<SmsLog> {
    const rows = await this.db
      .insert(smsLog)
      .values(data)
      .returning();
    return rows[0];
  }

  async findPendingForRetry(maxAttempts: number): Promise<SmsLog[]> {
    return this.db
      .select()
      .from(smsLog)
      .where(
        and(
          or(
            eq(smsLog.status, 'pending'),
            eq(smsLog.status, 'failed'),
          ),
          lt(smsLog.attemptCount, maxAttempts),
        ),
      );
  }

  async updateStatus(id: string, status: string, attemptCount: number): Promise<void> {
    await this.db
      .update(smsLog)
      .set({
        status,
        attemptCount,
        lastAttemptAt: new Date(),
        ...(status === 'sent' ? { sentAt: new Date() } : {}),
      })
      .where(eq(smsLog.id, id));
  }
}

export const smsLogRepository = new SmsLogRepository();
export default SmsLogRepository;
