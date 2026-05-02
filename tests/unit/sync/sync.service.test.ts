// Mock the config module before any imports that depend on it
jest.mock('../../../src/config', () => ({
  config: {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
    JWT_EXPIRES_IN: '8h',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
    FCM_SERVER_KEY: 'test-fcm-server-key',
    SMS_GATEWAY_URL: 'https://test-sms-gateway.com',
    SMS_GATEWAY_API_KEY: 'test-sms-api-key',
    SMS_GATEWAY_SENDER_ID: 'TEST',
    ATTACHMENT_STORAGE_PATH: './test-attachments',
    MAX_FILE_SIZE_MB: 50,
    QR_PRIVATE_KEY_PATH: './test-ec-private.pem',
    QR_PUBLIC_KEY_PATH: './test-ec-public.pem',
    ESCALATION_HIGH_PRIORITY_MINUTES: 30,
    ESCALATION_MEDIUM_PRIORITY_MINUTES: 90,
    LOG_LEVEL: 'error',
  },
}));

// Mock the database connection
jest.mock('../../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// Mock repositories
jest.mock('../../../src/catalog/incident-type.repository');
jest.mock('../../../src/devices/exam-center-assignment.repository');
jest.mock('../../../src/devices/exam-field.repository');
jest.mock('../../../src/notifications/notification.repository');

import { syncService } from '../../../src/sync/sync.service';
import { incidentTypeRepository } from '../../../src/catalog/incident-type.repository';
import { examCenterAssignmentRepository } from '../../../src/devices/exam-center-assignment.repository';
import { examFieldRepository } from '../../../src/devices/exam-field.repository';
import { notificationRepository } from '../../../src/notifications/notification.repository';
import { IncidentType, ExamField, Notification, ExamCenterAssignment } from '../../../src/db/schema';

describe('SyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMobileSyncData', () => {
    it('should return active incident types, assigned exam fields, and unread notifications', async () => {
      const userId = 'user-123';

      // Mock data
      const mockIncidentTypes: IncidentType[] = [
        {
          id: 'type-1',
          name: 'Power Failure',
          defaultPriority: 'High',
          description: 'Power outage',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'type-2',
          name: 'Network Outage',
          defaultPriority: 'High',
          description: 'Network issue',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockAssignments: ExamCenterAssignment[] = [
        {
          id: 'assign-1',
          userId: 'user-123',
          examFieldId: 'field-1',
          assignedAt: new Date(),
        },
        {
          id: 'assign-2',
          userId: 'user-123',
          examFieldId: 'field-2',
          assignedAt: new Date(),
        },
      ];

      const mockExamFields: ExamField[] = [
        {
          id: 'field-1',
          name: 'Exam Center A',
          location: 'Location A',
          latitude: '9.030000',
          longitude: '38.740000',
          isActive: true,
        },
        {
          id: 'field-2',
          name: 'Exam Center B',
          location: 'Location B',
          latitude: '9.031000',
          longitude: '38.741000',
          isActive: true,
        },
      ];

      const mockNotifications: Notification[] = [
        {
          id: 'notif-1',
          userId: 'user-123',
          incidentId: 'incident-1',
          message: 'Your incident has been assigned',
          isRead: false,
          createdAt: new Date(),
        },
      ];

      // Setup mocks
      (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue(mockIncidentTypes);
      (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue(mockAssignments);
      (examFieldRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockExamFields[0])
        .mockResolvedValueOnce(mockExamFields[1]);
      (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue(mockNotifications);

      // Execute
      const result = await syncService.getMobileSyncData(userId);

      // Verify
      expect(result.catalog).toEqual(mockIncidentTypes);
      expect(result.examFields).toEqual(mockExamFields);
      expect(result.notifications).toEqual(mockNotifications);

      // Verify repository calls
      expect(incidentTypeRepository.findAll).toHaveBeenCalledWith(false); // only active types
      expect(examCenterAssignmentRepository.findByUser).toHaveBeenCalledWith(userId);
      expect(examFieldRepository.findById).toHaveBeenCalledTimes(2);
      expect(examFieldRepository.findById).toHaveBeenCalledWith('field-1');
      expect(examFieldRepository.findById).toHaveBeenCalledWith('field-2');
      expect(notificationRepository.findUnreadByUser).toHaveBeenCalledWith(userId);
    });

    it('should return empty exam fields when user has no assignments', async () => {
      const userId = 'user-no-assignments';

      const mockIncidentTypes: IncidentType[] = [
        {
          id: 'type-1',
          name: 'Power Failure',
          defaultPriority: 'High',
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue(mockIncidentTypes);
      (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([]);
      (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

      const result = await syncService.getMobileSyncData(userId);

      expect(result.catalog).toEqual(mockIncidentTypes);
      expect(result.examFields).toEqual([]);
      expect(result.notifications).toEqual([]);
      expect(examFieldRepository.findById).not.toHaveBeenCalled();
    });

    it('should exclude inactive incident types from catalog', async () => {
      const userId = 'user-123';

      const mockActiveTypes: IncidentType[] = [
        {
          id: 'type-1',
          name: 'Power Failure',
          defaultPriority: 'High',
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue(mockActiveTypes);
      (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([]);
      (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

      const result = await syncService.getMobileSyncData(userId);

      expect(result.catalog).toEqual(mockActiveTypes);
      expect(incidentTypeRepository.findAll).toHaveBeenCalledWith(false); // false = exclude inactive
    });

    it('should handle missing exam fields gracefully', async () => {
      const userId = 'user-123';

      const mockAssignments: ExamCenterAssignment[] = [
        {
          id: 'assign-1',
          userId: 'user-123',
          examFieldId: 'field-1',
          assignedAt: new Date(),
        },
        {
          id: 'assign-2',
          userId: 'user-123',
          examFieldId: 'field-missing',
          assignedAt: new Date(),
        },
      ];

      const mockExamField: ExamField = {
        id: 'field-1',
        name: 'Exam Center A',
        location: 'Location A',
        latitude: '9.030000',
        longitude: '38.740000',
        isActive: true,
      };

      (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue([]);
      (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue(mockAssignments);
      (examFieldRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockExamField)
        .mockResolvedValueOnce(null); // field-missing not found
      (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

      const result = await syncService.getMobileSyncData(userId);

      // Should only include the found field
      expect(result.examFields).toEqual([mockExamField]);
      expect(result.examFields).toHaveLength(1);
    });
  });
});
