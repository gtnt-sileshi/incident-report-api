import { incidentTypeRepository } from '../catalog/incident-type.repository';
import { notificationRepository } from '../notifications/notification.repository';
import { IncidentType, Notification } from '../db/schema';

/**
 * Response structure for mobile sync endpoint
 */
export interface MobileSyncResponse {
  catalog: IncidentType[];
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
   * - Unread notifications for the user
   *
   * Requirements: 3.3, 3.5, 14.1, 19.5, 19.6
   */
  async getMobileSyncData(userId: string): Promise<MobileSyncResponse> {
    // Fetch active incident types only (Requirement 19.5, 19.6)
    const catalog = await incidentTypeRepository.findAll(false);

    // Fetch unread notifications for this user (Requirement 14.1)
    const notifications = await notificationRepository.findUnreadByUser(userId);

    return {
      catalog,
      notifications,
    };
  }
}

export const syncService = new SyncService();
export default SyncService;
