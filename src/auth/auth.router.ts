import { Router } from 'express';
import { login, deviceVerify, logout, deviceStatus } from './auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticates a user with email + password and returns a JWT.
 * Mobile clients include deviceId for device binding enforcement.
 */
router.post('/login', login);

/**
 * POST /api/auth/device-verify
 * Verifies a hardware device ID and issues a device-scoped JWT for an IT Rep.
 */
router.post('/device-verify', deviceVerify);

/**
 * GET /api/auth/device-status
 * Returns the approval/active status of the device linked to the authenticated user.
 * Used by the mobile app to poll for device approval.
 */
router.get('/device-status', authenticate, deviceStatus);

/**
 * POST /api/auth/logout
 * Revokes the current user's sessions in Redis.
 * Requires a valid Bearer token.
 */
router.post('/logout', authenticate, logout);

export default router;
