import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../db/index';
import { pushTokens, users, PushToken, NewPushToken } from '../db/schema';

export class PushTokenRepository {
  private get db() {
    return getDb();
  }

  /**
   * Registers or updates a push token for a user.
   * Upserts into push_tokens table based on (userId, tokenType, deviceId) unique constraint.
   * Requirements: 14.1, 14.2
   */
  async register(
    userId: string,
    tokenType: 'fcm' | 'web_push',
    token: string,
    deviceId: string | null,
  ): Promise<PushToken> {
    const data: NewPushToken = {
      userId,
      tokenType,
      token,
      deviceId: deviceId ?? null,
      lastUsedAt: new Date(),
    };

    const rows = await this.db
      .insert(pushTokens)
      .values(data)
      .onConflictDoUpdate({
        target: [pushTokens.userId, pushTokens.tokenType, pushTokens.deviceId],
        set: {
          token: data.token,
          lastUsedAt: new Date(),
        },
      })
      .returning();
    return rows[0];
  }

  /**
   * Unregisters a push token for a user and device.
   * Deletes the matching row from push_tokens table.
   * Requirements: 14.1
   */
  async unregister(userId: string, deviceId: string): Promise<void> {
    await this.db
      .delete(pushTokens)
      .where(
        and(
          eq(pushTokens.userId, userId),
          eq(pushTokens.deviceId, deviceId),
        ),
      );
  }

  /**
   * Returns all FCM and web_push tokens for a user.
   * Requirements: 14.1, 14.2
   */
  async getTokensForUser(userId: string): Promise<PushToken[]> {
    return this.db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));
  }

  /**
   * Returns all tokens for all users in an organization.
   * Requirements: 14.1, 14.2
   */
  async getTokensForOrg(orgId: string): Promise<PushToken[]> {
    // Join users to get all tokens for all users in an org
    const orgUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return [];

    const userIds = orgUsers.map((u) => u.id);
    return this.getTokensForUsers(userIds);
  }

  /**
   * Returns all tokens for a list of user IDs.
   * Helper method used by getTokensForOrg.
   */
  async getTokensForUsers(userIds: string[]): Promise<PushToken[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select()
      .from(pushTokens)
      .where(inArray(pushTokens.userId, userIds));
  }

  // Legacy aliases for backward compatibility
  async upsert(data: NewPushToken): Promise<PushToken> {
    return this.register(
      data.userId,
      data.tokenType as 'fcm' | 'web_push',
      data.token,
      data.deviceId ?? null,
    );
  }

  async findByUser(userId: string): Promise<PushToken[]> {
    return this.getTokensForUser(userId);
  }

  async findByOrg(orgId: string): Promise<PushToken[]> {
    return this.getTokensForOrg(orgId);
  }

  async findByUsers(userIds: string[]): Promise<PushToken[]> {
    return this.getTokensForUsers(userIds);
  }

  async delete(userId: string, deviceId: string): Promise<void> {
    return this.unregister(userId, deviceId);
  }
}

export const pushTokenRepository = new PushTokenRepository();
export default PushTokenRepository;
