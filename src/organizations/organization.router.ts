import { Router } from 'express';
import {
  listOrgs,
  createOrg,
  updateOrg,
  deactivateOrg,
  setOrgPermissions,
} from './organization.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/organizations
 * Lists all organizations.
 */
router.get(
  '/',
  authenticate,
  requirePermission('organizations.view'),
  listOrgs,
);

/**
 * POST /api/organizations
 * Creates a new organization.
 */
router.post(
  '/',
  authenticate,
  requirePermission('organizations.create'),
  createOrg,
);

/**
 * PATCH /api/organizations/:id
 * Updates an existing organization.
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('organizations.edit'),
  updateOrg,
);

/**
 * PATCH /api/organizations/:id/deactivate
 * Deactivates an organization and revokes all its users' sessions.
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  requirePermission('organizations.edit'),
  deactivateOrg,
);

/**
 * PATCH /api/organizations/:id/permissions
 * Replaces the organization's permission set (cascades to users).
 */
router.patch(
  '/:id/permissions',
  authenticate,
  requirePermission('organizations.assign_permissions'),
  setOrgPermissions,
);

export default router;
