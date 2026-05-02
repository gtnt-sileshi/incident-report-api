import { Router } from 'express';
import {
  listIncidentTypes,
  createIncidentType,
  updateIncidentType,
  deleteIncidentType,
} from './incident-type.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/catalog/incident-types
 * Lists all incident types (active only by default).
 * Requirements: 19.5, 19.6
 */
router.get(
  '/incident-types',
  authenticate,
  requirePermission('catalog.view'),
  listIncidentTypes,
);

/**
 * POST /api/catalog/incident-types
 * Creates a new incident type.
 * Requirements: 19.2, 19.3
 */
router.post(
  '/incident-types',
  authenticate,
  requirePermission('catalog.create'),
  createIncidentType,
);

/**
 * PATCH /api/catalog/incident-types/:id
 * Updates an existing incident type (including active/inactive toggle).
 * Requirements: 19.3, 19.4
 */
router.patch(
  '/incident-types/:id',
  authenticate,
  requirePermission('catalog.edit'),
  updateIncidentType,
);

/**
 * DELETE /api/catalog/incident-types/:id
 * Soft-deletes an incident type (rejects if referenced).
 * Requirements: 19.7, 19.8
 */
router.delete(
  '/incident-types/:id',
  authenticate,
  requirePermission('catalog.delete'),
  deleteIncidentType,
);

export default router;
