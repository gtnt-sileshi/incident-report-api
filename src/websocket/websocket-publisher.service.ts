import { getRedis } from '../db/redis';

/**
 * Service for publishing WebSocket events to Redis pub/sub channels.
 *
 * Events are published to region-scoped channels (region:<regionId>).
 * The WebSocket server subscribes to these channels and fans out to connected clients.
 *
 * Requirements: 8.2
 */

export interface WebSocketEvent {
  event: 'incident.created' | 'incident.status_changed' | 'incident.assigned' | 'incident.escalated' | 'notification.new';
  data: unknown;
}

export class WebSocketPublisherService {
  /**
   * Publishes an event to a region's WebSocket channel.
   */
  async publishToOrg(regionId: string, event: WebSocketEvent): Promise<void> {
    try {
      const redis = getRedis();
      const channel = `region:${regionId}`;
      const message = JSON.stringify(event);

      await redis.publish(channel, message);

      console.info(`[WebSocketPublisher] Published event=${event.event} to channel=${channel}`);
    } catch (err) {
      // Publishing failure must not block the primary action
      console.error('[WebSocketPublisher] Failed to publish event:', err);
    }
  }

  /**
   * Publishes an event to multiple regions' WebSocket channels.
   */
  async publishToRegions(regionIds: string[], event: WebSocketEvent): Promise<void> {
    try {
      await Promise.all(regionIds.map((regionId) => this.publishToOrg(regionId, event)));
    } catch (err) {
      // Publishing failure must not block the primary action
      console.error('[WebSocketPublisher] Failed to publish to multiple regions:', err);
    }
  }
}

export const websocketPublisher = new WebSocketPublisherService();
export default WebSocketPublisherService;
