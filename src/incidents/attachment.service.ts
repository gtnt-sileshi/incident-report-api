import { attachmentRepository, NewAttachmentData } from './attachment.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { incidentRepository } from './incident.repository';
import { AppError } from '../middleware/errorHandler';
import { Attachment } from '../db/schema';
import { getFileTypeCategory } from '../middleware/upload';
import { JwtPayload } from '../auth/jwt.service';

export interface UploadedFileInfo {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export class AttachmentService {
  async createAttachments(
    incidentId: string,
    files: UploadedFileInfo[],
    requestingUser: JwtPayload,
  ): Promise<Attachment[]> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }

    const attachments: Attachment[] = [];

    for (const file of files) {
      const fileType = getFileTypeCategory(file.mimetype);

      const attachmentData: NewAttachmentData = {
        incidentId,
        filePath: file.path,
        fileType,
        fileSize: file.size,
        uploadedBy: requestingUser.sub,
      };

      const attachment = await attachmentRepository.create(attachmentData);
      attachments.push(attachment);

      await auditLogRepository.append({
        incidentId,
        actorUserId: requestingUser.sub,
        actorRole: requestingUser.role,
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

  async getAttachmentsByIncident(incidentId: string): Promise<Attachment[]> {
    return attachmentRepository.findByIncident(incidentId);
  }
}

export const attachmentService = new AttachmentService();
