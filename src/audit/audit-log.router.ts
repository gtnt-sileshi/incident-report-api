import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { listAuditLog, getIncidentAuditLog } from './audit-log.controller';

const router = Router();

/**
 * GET /api/audit-log
 * List audit log entries with optional filters.
 * Requires: audit.view permission
 */
router.get(
  '/',
  authenticate,
  requirePermission('audit.view'),
  listAuditLog,
);

/**
 * GET /api/audit-log/incident/:incidentId
 * Get all audit log entries for a specific incident.
 * Requires: audit.view permission
 */
router.get(
  '/incident/:incidentId',
  authenticate,
  requirePermission('audit.view'),
  getIncidentAuditLog,
);

export default router;
