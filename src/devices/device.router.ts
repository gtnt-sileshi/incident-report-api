import { Router } from 'express';
import { listDevices, registerDevice, deactivateDevice } from './device.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/devices
 * Lists all registered devices with assignment info.
 * Requirements: 3.8
 */
router.get(
  '/',
  authenticate,
  requirePermission('devices.view'),
  listDevices,
);

/**
 * POST /api/devices
 * Registers a new device.
 * Requirements: 3.1, 13.4
 */
router.post(
  '/',
  authenticate,
  requirePermission('devices.register'),
  registerDevice,
);

/**
 * PATCH /api/devices/:id/deactivate
 * Deactivates a registered device.
 * Requirements: 3.7
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  requirePermission('devices.deactivate'),
  deactivateDevice,
);

export default router;
