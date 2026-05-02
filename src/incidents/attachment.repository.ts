import { eq } from 'drizzle-orm';
import { getDb } from '../db/index';
import { attachments, Attachment } from '../db/schema';

export interface NewAttachmentData {
  incidentId: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
}

export class AttachmentRepository {
  private get db() {
    return getDb();
  }

  async findByIncident(incidentId: string): Promise<Attachment[]> {
    return this.db
      .select()
      .from(attachments)
      .where(eq(attachments.incidentId, incidentId));
  }

  async create(data: NewAttachmentData): Promise<Attachment> {
    const rows = await this.db
      .insert(attachments)
      .values({
        incidentId: data.incidentId,
        filePath: data.filePath,
        fileType: data.fileType,
        fileSize: data.fileSize,
        uploadedBy: data.uploadedBy,
      })
      .returning();
    return rows[0];
  }
}

export const attachmentRepository = new AttachmentRepository();
export default AttachmentRepository;
