import { Router } from 'express';
import { login, deviceVerify, logout } from './auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticates a user with email + password and returns a JWT.
 */
router.post('/login', login);

/**
 * POST /api/auth/device-verify
 * Verifies a hardware device ID and issues a device-scoped JWT for an IT Rep.
 */
router.post('/device-verify', deviceVerify);

/**
 * POST /api/auth/logout
 * Revokes the current user's sessions in Redis.
 * Requires a valid Bearer token.
 */
router.post('/logout', authenticate, logout);

export default router;
