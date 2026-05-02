import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import { notifications, Notification, NewNotification } from '../db/schema';

export class NotificationRepository {
  private get db() {
    return getDb();
  }

  async findUnreadByUser(userId: string): Promise<Notification[]> {
    return this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
        ),
      );
  }

  async create(data: NewNotification): Promise<Notification> {
    const rows = await this.db
      .insert(notifications)
      .values(data)
      .returning();
    return rows[0];
  }

  async markRead(id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }
}

export const notificationRepository = new NotificationRepository();
export default NotificationRepository;
