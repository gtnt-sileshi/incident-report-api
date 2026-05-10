import { Router } from 'express';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  getMe,
  getUser,
} from './user.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/users/me
 * Returns the current authenticated user.
 */
router.get('/me', authenticate, getMe);

/**
 * GET /api/users
 * Lists users scoped by the requesting user's role.
 */
router.get('/', authenticate, requirePermission('users.view'), listUsers);

/**
 * POST /api/users
 * Creates a new user account.
 */
router.post('/', authenticate, requirePermission('users.create'), createUser);

/**
 * PATCH /api/users/:id
 * Updates an existing user's fields.
 */
router.patch('/:id', authenticate, requirePermission('users.edit'), updateUser);

/**
 * PATCH /api/users/:id/deactivate
 * Deactivates a user account, revokes sessions, and invalidates QR credential.
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  requirePermission('users.delete'),
  deactivateUser,
);

/**
 * GET /api/users/:id
 * Fetches user details for identity verification.
 */
router.get('/:id', authenticate, requirePermission('identity.view'), getUser);

export default router;
