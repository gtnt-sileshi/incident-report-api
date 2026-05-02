import { Router } from 'express';
import { pushController } from './push.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /api/push/register
 * Register a push token (FCM or Web Push) for the authenticated user.
 * Requirements: 14.1
 */
router.post('/register', authenticate, (req, res, next) =>
  pushController.register(req, res, next),
);

/**
 * DELETE /api/push/unregister
 * Unregister a push token for the authenticated user and device.
 * Requirements: 14.1
 */
router.delete('/unregister', authenticate, (req, res, next) =>
  pushController.unregister(req, res, next),
);

export default router;
