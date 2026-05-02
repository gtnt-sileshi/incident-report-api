import webpush from 'web-push';
import { pushTokenRepository } from './push-token.repository';
import { config } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  incidentId?: string;
  data?: Record<string, unknown>;
}

// ─── PushNotificationService ─────────────────────────────────────────────────

export class PushNotificationService {
  private vapidConfigured = false;

  constructor() {
    // Configure VAPID keys for Web Push
    try {
      webpush.setVapidDetails(
        config.VAPID_SUBJECT,
        config.VAPID_PUBLIC_KEY,
        config.VAPID_PRIVATE_KEY,
      );
      this.vapidConfigured = true;
    } catch (err) {
      console.warn('[PushNotificationService] VAPID configuration failed:', err);
      console.warn('[PushNotificationService] Web Push notifications will be disabled');
      this.vapidConfigured = false;
    }
  }

  /**
   * Sends a push notification to a single user.
   * Fetches all tokens for the user and dispatches to FCM and Web Push.
   * Requirements: 14.1, 14.2
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      const tokens = await pushTokenRepository.getTokensForUser(userId);
      if (tokens.length === 0) {
        console.info(`[PushNotificationService] No tokens found for user ${userId}`);
        return;
      }

      await this.dispatchToTokens(tokens, payload);
    } catch (err) {
      // Push delivery failures must not block the primary action
      console.error('[PushNotificationService] sendToUser failed:', err);
    }
  }

  /**
   * Sends a push notification to all users in an organization.
   * Fetches all tokens for all users in the org and dispatches.
   * Requirements: 14.1, 14.2
   */
  async sendToOrg(orgId: string, payload: PushPayload): Promise<void> {
    try {
      const tokens = await pushTokenRepository.getTokensForOrg(orgId);
      if (tokens.length === 0) {
        console.info(`[PushNotificationService] No tokens found for org ${orgId}`);
        return;
      }

      await this.dispatchToTokens(tokens, payload);
    } catch (err) {
      // Push delivery failures must not block the primary action
      console.error('[PushNotificationService] sendToOrg failed:', err);
    }
  }

  /**
   * Sends a push notification to multiple users.
   * Fetches all tokens for the given user IDs and dispatches.
   * Requirements: 14.1, 14.2
   */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    try {
      const tokens = await pushTokenRepository.getTokensForUsers(userIds);
      if (tokens.length === 0) {
        console.info(`[PushNotificationService] No tokens found for users ${userIds.join(', ')}`);
        return;
      }

      await this.dispatchToTokens(tokens, payload);
    } catch (err) {
      // Push delivery failures must not block the primary action
      console.error('[PushNotificationService] sendToUsers failed:', err);
    }
  }

  /**
   * Dispatches push notifications to a list of tokens.
   * Handles both FCM and Web Push token types.
   */
  private async dispatchToTokens(
    tokens: Array<{ id: string; tokenType: string; token: string; userId: string }>,
    payload: PushPayload,
  ): Promise<void> {
    const fcmTokens = tokens.filter((t) => t.tokenType === 'fcm');
    const webPushTokens = tokens.filter((t) => t.tokenType === 'web_push');

    // Dispatch FCM notifications
    if (fcmTokens.length > 0) {
      await Promise.allSettled(
        fcmTokens.map((t) => this.sendFCM(t.token, payload)),
      );
    }

    // Dispatch Web Push notifications
    if (webPushTokens.length > 0) {
      await Promise.allSettled(
        webPushTokens.map((t) => this.sendWebPush(t.token, payload)),
      );
    }
  }

  /**
   * Sends a push notification via FCM HTTP v1 API.
   * Requirements: 14.1, 14.2
   */
  private async sendFCM(token: string, payload: PushPayload): Promise<void> {
    try {
      // FCM HTTP v1 API endpoint
      // Note: This is a simplified implementation. In production, you would use
      // the official Firebase Admin SDK or construct the full OAuth2 flow.
      // For now, we'll use the legacy server key approach (FCM_SERVER_KEY).

      const fcmPayload = {
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          incidentId: payload.incidentId ?? '',
          ...payload.data,
        },
      };

      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${config.FCM_SERVER_KEY}`,
        },
        body: JSON.stringify(fcmPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PushNotificationService] FCM send failed:', errorText);
      }
    } catch (err) {
      console.error('[PushNotificationService] FCM send error:', err);
    }
  }

  /**
   * Sends a push notification via VAPID Web Push.
   * Requirements: 14.1, 14.2
   */
  private async sendWebPush(subscriptionJson: string, payload: PushPayload): Promise<void> {
    if (!this.vapidConfigured) {
      console.warn('[PushNotificationService] Web Push disabled - VAPID not configured');
      return;
    }

    try {
      const subscription = JSON.parse(subscriptionJson);

      const webPushPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        incidentId: payload.incidentId ?? '',
        data: payload.data ?? {},
      });

      await webpush.sendNotification(subscription, webPushPayload);
    } catch (err) {
      console.error('[PushNotificationService] Web Push send error:', err);
    }
  }
}

export const pushNotificationService = new PushNotificationService();
export default PushNotificationService;
