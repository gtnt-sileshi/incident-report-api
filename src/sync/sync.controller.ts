import { Request, Response, NextFunction } from 'express';
import { syncService } from './sync.service';

/**
 * Controller for mobile sync endpoint.
 * Requirements: 3.3, 3.5, 14.1, 19.5, 19.6
 */
export class SyncController {
  /**
   * GET /api/sync/mobile
   * Returns: active incident types catalog, device's exam field assignments, unread notifications
   * Validates Device_ID from JWT; returns only data scoped to that device's assignments
   */
  async getMobileSync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // req.user is populated by authenticateDevice middleware
      // It contains: sub (userId), deviceId, orgId, role, type
      const userId = req.user!.sub;

      const syncData = await syncService.getMobileSyncData(userId);

      res.json(syncData);
    } catch (err) {
      next(err);
    }
  }
}

export const syncController = new SyncController();
export default SyncController;
