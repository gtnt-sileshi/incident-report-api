import { incidentTypeRepository } from '../catalog/incident-type.repository';
import { examCenterAssignmentRepository } from '../devices/exam-center-assignment.repository';
import { examFieldRepository } from '../devices/exam-field.repository';
import { notificationRepository } from '../notifications/notification.repository';
import { IncidentType, ExamField, Notification } from '../db/schema';

/**
 * Response structure for mobile sync endpoint
 */
export interface MobileSyncResponse {
  catalog: IncidentType[];
  examFields: ExamField[];
  notifications: Notification[];
}

/**
 * Service for mobile sync operations.
 * Requirements: 3.3, 3.5, 14.1, 19.5, 19.6
 */
export class SyncService {
  /**
   * Fetches all data needed for mobile sync:
   * - Active incident types catalog (only active types)
   * - Exam fields assigned to the device's user
   * - Unread notifications for the user
   *
   * Requirements: 3.3, 3.5, 14.1, 19.5, 19.6
   */
  async getMobileSyncData(userId: string): Promise<MobileSyncResponse> {
    // Fetch active incident types only (Requirement 19.5, 19.6)
    const catalog = await incidentTypeRepository.findAll(false);

    // Fetch exam center assignments for this user (Requirement 3.3)
    const assignments = await examCenterAssignmentRepository.findByUser(userId);
    const examFieldIds = assignments.map((a) => a.examFieldId);

    // Fetch the full exam field details for assigned fields (Requirement 3.5)
    const examFields: ExamField[] = [];
    for (const fieldId of examFieldIds) {
      const field = await examFieldRepository.findById(fieldId);
      if (field) {
        examFields.push(field);
      }
    }

    // Fetch unread notifications for this user (Requirement 14.1)
    const notifications = await notificationRepository.findUnreadByUser(userId);

    return {
      catalog,
      examFields,
      notifications,
    };
  }
}

export const syncService = new SyncService();
export default SyncService;
