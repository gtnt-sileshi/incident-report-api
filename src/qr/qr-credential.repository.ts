import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import { qrCredentials, QrCredential } from '../db/schema';

export interface NewQrCredentialData {
  userId: string;
  payload: string;
  signature: string;
}

export class QrCredentialRepository {
  private get db() {
    return getDb();
  }

  async findValidByUserId(userId: string): Promise<QrCredential | null> {
    const rows = await this.db
      .select()
      .from(qrCredentials)
      .where(
        and(
          eq(qrCredentials.userId, userId),
          eq(qrCredentials.isValid, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewQrCredentialData): Promise<QrCredential> {
    const rows = await this.db
      .insert(qrCredentials)
      .values({
        userId: data.userId,
        payload: data.payload,
        signature: data.signature,
      })
      .returning();
    return rows[0];
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await this.db
      .update(qrCredentials)
      .set({ isValid: false, invalidatedAt: new Date() })
      .where(eq(qrCredentials.userId, userId));
  }
}

export const qrCredentialRepository = new QrCredentialRepository();
export default QrCredentialRepository;
