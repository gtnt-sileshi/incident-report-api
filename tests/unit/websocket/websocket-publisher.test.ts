import { websocketPublisher } from '../../../src/websocket/websocket-publisher.service';

// Mock dependencies before importing
jest.mock('../../../src/db/redis');
jest.mock('../../../src/config', () => ({
  config: {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test',
    REDIS_URL: 'redis://test',
    JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
    JWT_EXPIRES_IN: '8h',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
    FCM_SERVER_KEY: 'test-fcm-key',
    SMS_GATEWAY_URL: 'https://test-sms-gateway.com',
    SMS_GATEWAY_API_KEY: 'test-sms-key',
    SMS_GATEWAY_SENDER_ID: 'ITDB',
    ATTACHMENT_STORAGE_PATH: '/tmp/attachments',
    MAX_FILE_SIZE_MB: 50,
    QR_PRIVATE_KEY_PATH: '/tmp/private.pem',
    QR_PUBLIC_KEY_PATH: '/tmp/public.pem',
    ESCALATION_HIGH_PRIORITY_MINUTES: 30,
    ESCALATION_MEDIUM_PRIORITY_MINUTES: 90,
    LOG_LEVEL: 'info',
  },
}));

import { getRedis } from '../../../src/db/redis';

describe('WebSocketPublisherService', () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      publish: jest.fn().mockResolvedValue(1),
    };
    (getRedis as jest.Mock).mockReturnValue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('publishToOrg', () => {
    it('should publish event to org channel', async () => {
      const orgId = 'org-123';
      const event = {
        event: 'incident.created' as const,
        data: { incidentId: 'inc-456' },
      };

      await websocketPublisher.publishToOrg(orgId, event);

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'org:org-123',
        JSON.stringify(event),
      );
    });

    it('should not throw on Redis publish failure', async () => {
      mockRedis.publish.mockRejectedValue(new Error('Redis error'));

      const orgId = 'org-123';
      const event = {
        event: 'incident.created' as const,
        data: { incidentId: 'inc-456' },
      };

      await expect(websocketPublisher.publishToOrg(orgId, event)).resolves.not.toThrow();
    });
  });

  describe('publishToOrgs', () => {
    it('should publish event to multiple org channels', async () => {
      const orgIds = ['org-123', 'org-456', 'org-789'];
      const event = {
        event: 'incident.status_changed' as const,
        data: { incidentId: 'inc-456', newStatus: 'In-Progress' },
      };

      await websocketPublisher.publishToOrgs(orgIds, event);

      expect(mockRedis.publish).toHaveBeenCalledTimes(3);
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'org:org-123',
        JSON.stringify(event),
      );
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'org:org-456',
        JSON.stringify(event),
      );
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'org:org-789',
        JSON.stringify(event),
      );
    });

    it('should not throw on Redis publish failure', async () => {
      mockRedis.publish.mockRejectedValue(new Error('Redis error'));

      const orgIds = ['org-123', 'org-456'];
      const event = {
        event: 'incident.assigned' as const,
        data: { incidentId: 'inc-456' },
      };

      await expect(websocketPublisher.publishToOrgs(orgIds, event)).resolves.not.toThrow();
    });
  });

  describe('event types', () => {
    it('should support all required event types', async () => {
      const orgId = 'org-123';

      const events = [
        { event: 'incident.created' as const, data: {} },
        { event: 'incident.status_changed' as const, data: {} },
        { event: 'incident.assigned' as const, data: {} },
        { event: 'incident.escalated' as const, data: {} },
        { event: 'notification.new' as const, data: {} },
      ];

      for (const event of events) {
        await websocketPublisher.publishToOrg(orgId, event);
      }

      expect(mockRedis.publish).toHaveBeenCalledTimes(5);
    });
  });
});
