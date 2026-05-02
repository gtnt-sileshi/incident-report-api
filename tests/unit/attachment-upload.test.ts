// Mock config before importing other modules
jest.mock('../../src/config', () => ({
  config: {
    ATTACHMENT_STORAGE_PATH: '/data/attachments',
    MAX_FILE_SIZE_MB: 50,
  },
}));

// Mock dependencies
jest.mock('../../src/incidents/attachment.repository');
jest.mock('../../src/audit/audit-log.repository');
jest.mock('../../src/incidents/incident.repository');

import { AttachmentService } from '../../src/incidents/attachment.service';
import { attachmentRepository } from '../../src/incidents/attachment.repository';
import { auditLogRepository } from '../../src/audit/audit-log.repository';
import { incidentRepository } from '../../src/incidents/incident.repository';
import { AppError } from '../../src/middleware/errorHandler';

describe('AttachmentService', () => {
  let attachmentService: AttachmentService;

  const mockIncident = {
    id: 'incident-123',
    examFieldId: 'field-1',
    incidentTypeId: 'type-1',
    reportedByUserId: 'user-1',
    priority: 'High',
    status: 'Reported',
    assignedOrgId: 'org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRequestingUser = {
    sub: 'user-1',
    role: 'it_rep',
    orgId: 'org-1',
  };

  beforeEach(() => {
    attachmentService = new AttachmentService();
    jest.clearAllMocks();
  });

  describe('createAttachments', () => {
    it('should create attachment records for uploaded files', async () => {
      // Arrange
      const files = [
        {
          path: '/data/attachments/incident-123/1234567890-photo.jpg',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024000,
        },
        {
          path: '/data/attachments/incident-123/1234567891-video.mp4',
          originalname: 'video.mp4',
          mimetype: 'video/mp4',
          size: 5120000,
        },
      ];

      const mockAttachment1 = {
        id: 'attachment-1',
        incidentId: 'incident-123',
        filePath: files[0].path,
        fileType: 'photo',
        fileSize: files[0].size,
        uploadedBy: mockRequestingUser.sub,
        uploadedAt: new Date(),
      };

      const mockAttachment2 = {
        id: 'attachment-2',
        incidentId: 'incident-123',
        filePath: files[1].path,
        fileType: 'video',
        fileSize: files[1].size,
        uploadedBy: mockRequestingUser.sub,
        uploadedAt: new Date(),
      };

      (incidentRepository.findById as jest.Mock).mockResolvedValue(mockIncident);
      (attachmentRepository.create as jest.Mock)
        .mockResolvedValueOnce(mockAttachment1)
        .mockResolvedValueOnce(mockAttachment2);
      (auditLogRepository.append as jest.Mock).mockResolvedValue({});

      // Act
      const result = await attachmentService.createAttachments(
        'incident-123',
        files,
        mockRequestingUser,
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockAttachment1);
      expect(result[1]).toEqual(mockAttachment2);

      expect(incidentRepository.findById).toHaveBeenCalledWith('incident-123');
      expect(attachmentRepository.create).toHaveBeenCalledTimes(2);
      expect(auditLogRepository.append).toHaveBeenCalledTimes(2);

      // Verify audit log entries
      expect(auditLogRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: 'incident-123',
          actorUserId: mockRequestingUser.sub,
          actorRole: mockRequestingUser.role,
          actorOrgId: mockRequestingUser.orgId,
          actionType: 'attachment_uploaded',
          fieldChanged: 'attachments',
        }),
      );
    });

    it('should throw error if incident does not exist', async () => {
      // Arrange
      const files = [
        {
          path: '/data/attachments/incident-123/1234567890-photo.jpg',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024000,
        },
      ];

      (incidentRepository.findById as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        attachmentService.createAttachments('incident-123', files, mockRequestingUser),
      ).rejects.toThrow(AppError);

      await expect(
        attachmentService.createAttachments('incident-123', files, mockRequestingUser),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'INCIDENT_NOT_FOUND',
      });
    });

    it('should correctly categorize file types', async () => {
      // Arrange
      const files = [
        {
          path: '/data/attachments/incident-123/1234567890-photo.jpg',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024000,
        },
        {
          path: '/data/attachments/incident-123/1234567891-video.mp4',
          originalname: 'video.mp4',
          mimetype: 'video/mp4',
          size: 5120000,
        },
        {
          path: '/data/attachments/incident-123/1234567892-document.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
          size: 512000,
        },
      ];

      (incidentRepository.findById as jest.Mock).mockResolvedValue(mockIncident);
      (attachmentRepository.create as jest.Mock).mockImplementation((data) => ({
        id: 'attachment-id',
        ...data,
        uploadedAt: new Date(),
      }));
      (auditLogRepository.append as jest.Mock).mockResolvedValue({});

      // Act
      await attachmentService.createAttachments('incident-123', files, mockRequestingUser);

      // Assert
      expect(attachmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 'photo' }),
      );
      expect(attachmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 'video' }),
      );
      expect(attachmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 'document' }),
      );
    });
  });

  describe('getAttachmentsByIncident', () => {
    it('should retrieve all attachments for an incident', async () => {
      // Arrange
      const mockAttachments = [
        {
          id: 'attachment-1',
          incidentId: 'incident-123',
          filePath: '/data/attachments/incident-123/photo.jpg',
          fileType: 'photo',
          fileSize: 1024000,
          uploadedBy: 'user-1',
          uploadedAt: new Date(),
        },
        {
          id: 'attachment-2',
          incidentId: 'incident-123',
          filePath: '/data/attachments/incident-123/video.mp4',
          fileType: 'video',
          fileSize: 5120000,
          uploadedBy: 'user-1',
          uploadedAt: new Date(),
        },
      ];

      (attachmentRepository.findByIncident as jest.Mock).mockResolvedValue(mockAttachments);

      // Act
      const result = await attachmentService.getAttachmentsByIncident('incident-123');

      // Assert
      expect(result).toEqual(mockAttachments);
      expect(attachmentRepository.findByIncident).toHaveBeenCalledWith('incident-123');
    });
  });
});
