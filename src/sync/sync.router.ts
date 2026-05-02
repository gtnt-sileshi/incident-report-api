import { Router } from 'express';
import { syncController } from './sync.controller';
import { authenticateDevice } from '../middleware/auth';

const router = Router();

/**
 * GET /api/sync/mobile
 * Mobile sync endpoint - returns catalog, exam field assignments, and notifications
 * Requires device token authentication
 * Requirements: 3.3, 3.5, 14.1, 19.5, 19.6
 */
router.get('/mobile', authenticateDevice, (req, res, next) =>
  syncController.getMobileSync(req, res, next),
);

export default router;
