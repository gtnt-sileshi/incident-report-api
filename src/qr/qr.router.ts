import { Router } from 'express';
import { getCredential, verifyCredential } from './qr.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/qr/:userId
 * Returns the current valid QR credential payload + signature for a user.
 * Requirements: 4.1, 4.3
 */
router.get(
  '/:userId',
  authenticate,
  requirePermission('qr.view'),
  getCredential,
);

/**
 * POST /api/qr/verify
 * Verifies a QR credential's ECDSA signature and returns user info + active status.
 * Requirements: 4.4, 4.5, 4.7
 */
router.post(
  '/verify',
  authenticate,
  requirePermission('qr.scan'),
  verifyCredential,
);

export default router;
