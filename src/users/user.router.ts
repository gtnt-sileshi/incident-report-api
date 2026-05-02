import { Router } from 'express';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  setUserPermissions,
  getMe,
} from './user.controller';
import { assignExamField, removeExamAssignment } from '../devices/device.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/users/me
 * Returns the current authenticated user and their effective permissions.
 * Requires authentication only — no extra permission needed.
 * Requirements: 13.7, 13.8, 18.5
 *
 * NOTE: This route must be registered BEFORE /:id routes to avoid
 * "me" being interpreted as a UUID parameter.
 */
router.get('/me', authenticate, getMe);

/**
 * GET /api/users
 * Lists users scoped by the requesting user's role.
 * Requirements: 13.1, 13.2, 13.6
 */
router.get('/', authenticate, requirePermission('users.view'), listUsers);

/**
 * POST /api/users
 * Creates a new user account.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
router.post('/', authenticate, requirePermission('users.create'), createUser);

/**
 * PATCH /api/users/:id
 * Updates an existing user's fields.
 * Requirements: 13.1, 13.2
 */
router.patch('/:id', authenticate, requirePermission('users.edit'), updateUser);

/**
 * PATCH /api/users/:id/deactivate
 * Deactivates a user account, revokes sessions, and invalidates QR credential.
 * Requirements: 13.5
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  requirePermission('users.delete'),
  deactivateUser,
);

/**
 * PATCH /api/users/:id/permissions
 * Replaces a user's permission set (must be subset of org's permission set).
 * Requirements: 13.7, 13.8
 */
router.patch(
  '/:id/permissions',
  authenticate,
  requirePermission('users.assign_permissions'),
  setUserPermissions,
);

/**
 * POST /api/users/:userId/exam-assignments
 * Assigns an exam field to a user (creates an Exam_Center_Assignment).
 * Requirements: 3.2, 3.6
 */
router.post(
  '/:userId/exam-assignments',
  authenticate,
  requirePermission('exam_fields.edit'),
  assignExamField,
);

/**
 * DELETE /api/users/:userId/exam-assignments/:fieldId
 * Removes an exam field assignment from a user.
 * Requirements: 3.2, 3.6
 */
router.delete(
  '/:userId/exam-assignments/:fieldId',
  authenticate,
  requirePermission('exam_fields.edit'),
  removeExamAssignment,
);

export default router;
