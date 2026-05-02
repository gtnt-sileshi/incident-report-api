import { attachmentRepository, NewAttachmentData } from './attachment.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { incidentRepository } from './incident.repository';
import { AppError } from '../middleware/errorHandler';
import { Attachment } from '../db/schema';
import { getFileTypeCategory } from '../middleware/upload';

export interface RequestingUser {
  sub: string;
  role: string;
  orgId: string;
}

export interface UploadedFileInfo {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * AttachmentService handles file attachment operations for incidents.
 *
 * Requirements: 5.3, 8.4, 8.5
 */
export class AttachmentService {
  /**
   * Creates attachment records for uploaded files.
   *
   * - Validates incident exists
   * - Creates attachment record for each file
   * - Writes audit log entry for each attachment
   *
   * Requirements: 5.3, 8.4, 8.5
   */
  async createAttachments(
    incidentId: string,
    files: UploadedFileInfo[],
    requestingUser: RequestingUser,
  ): Promise<Attachment[]> {
    // Validate incident exists
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }

    const attachments: Attachment[] = [];

    for (const file of files) {
      // Determine file type category
      const fileType = getFileTypeCategory(file.mimetype);

      // Create attachment record
      const attachmentData: NewAttachmentData = {
        incidentId,
        filePath: file.path,
        fileType,
        fileSize: file.size,
        uploadedBy: requestingUser.sub,
      };

      const attachment = await attachmentRepository.create(attachmentData);
      attachments.push(attachment);

      // Write audit log entry
      await auditLogRepository.append({
        incidentId,
        actorUserId: requestingUser.sub,
        actorRole: requestingUser.role,
        actorOrgId: requestingUser.orgId,
        actionType: 'attachment_uploaded',
        fieldChanged: 'attachments',
        previousValue: null,
        newValue: JSON.stringify({
          attachmentId: attachment.id,
          fileName: file.originalname,
          fileType,
          fileSize: file.size,
        }),
      });
    }

    return attachments;
  }

  /**
   * Retrieves all attachments for an incident.
   *
   * Requirements: 8.4
   */
  async getAttachmentsByIncident(incidentId: string): Promise<Attachment[]> {
    return attachmentRepository.findByIncident(incidentId);
  }
}

export const attachmentService = new AttachmentService();
