import { notificationRepository } from './notification.repository';
import { pushNotificationService } from '../push/push-notification.service';
import { websocketPublisher } from '../websocket/websocket-publisher.service';
import { userRepository } from '../users/user.repository';
import { getRedis } from '../db/redis';
import type { Notification } from '../db/schema';

export class NotificationService {
  /**
   * Creates a new notification for a user, persists it to the database,
   * publishes a `notification.new` event to the Redis pub/sub channel
   * `notifications:<userId>` so connected WebSocket clients receive it in
   * real time, and sends a push notification to the user.
   *
   * Requirements: 14.1, 14.2, 8.2
   */
  async createNotification(
    userId: string,
    incidentId: string | null,
    message: string,
  ): Promise<Notification> {
    const notification = await notificationRepository.create({
      userId,
      incidentId: incidentId ?? undefined,
      message,
    });

    // Publish WebSocket event scoped to user's region (non-blocking)
    const user = await userRepository.findById(userId);
    if (user && user.regionId) {
      this.publishNotificationEvent(user.regionId, notification).catch((err) => {
        console.error('[NotificationService] Failed to publish WebSocket event:', err);
      });
    }

    // Publish to legacy Redis pub/sub channel for backward compatibility
    try {
      const redis = getRedis();
      await redis.publish(
        `notifications:${userId}`,
        JSON.stringify({ event: 'notification.new', data: notification }),
      );
    } catch (err) {
      // Publishing failure must not block the primary action
      console.error('[NotificationService] Redis publish failed:', err);
    }

    // Send push notification (non-blocking)
    this.sendPushNotification(userId, incidentId, message).catch((err) => {
      console.error('[NotificationService] Push notification failed:', err);
    });

    return notification;
  }

  /**
   * Publishes WebSocket event when a notification is created.
   * Requirements: 8.2
   */
  private async publishNotificationEvent(orgId: string, notification: Notification): Promise<void> {
    try {
      await websocketPublisher.publishToOrg(orgId, {
        event: 'notification.new',
        data: notification,
      });
    } catch (err) {
      console.error('[NotificationService] publishNotificationEvent error:', err);
    }
  }

  /**
   * Sends a push notification to a user.
   * Requirements: 14.1, 14.2
   */
  private async sendPushNotification(
    userId: string,
    incidentId: string | null,
    message: string,
  ): Promise<void> {
    try {
      await pushNotificationService.sendToUser(userId, {
        title: 'New Notification',
        body: message,
        incidentId: incidentId ?? undefined,
      });
    } catch (err) {
      console.error('[NotificationService] sendPushNotification error:', err);
    }
  }

  /**
   * Returns all unread notifications for the given user.
   */
  async getUnread(userId: string): Promise<Notification[]> {
    return notificationRepository.findUnreadByUser(userId);
  }

  /**
   * Marks a single notification as read.
   */
  async markRead(notificationId: string): Promise<void> {
    return notificationRepository.markRead(notificationId);
  }
}

export const notificationService = new NotificationService();
export default NotificationService;
