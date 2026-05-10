import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { upload, checkDiskSpace } from '../middleware/upload';
import {
  listIncidents,
  createIncident,
  getIncident,
  updateStatus,
  assignIncident,
  addComment,
  escalateIncident,
  triggerSmsAlert,
  uploadAttachments,
  confirmResolution,
  rejectResolution,
} from './incident.controller';

const router = Router();

// All incident routes require authentication
router.use(authenticate);

/**
 * GET /api/incidents
 * List incidents (scoped by role/org)
 * Requirements: 1.3, 8.1, 9.1
 */
router.get('/', requirePermission('incidents.view'), listIncidents);

/**
 * POST /api/incidents
 * Create a new incident
 * Requirements: 6.1
 */
router.post('/', requirePermission('incidents.create'), createIncident);

/**
 * GET /api/incidents/:id
 * Get a single incident by ID
 * Requirements: 1.3, 9.1
 */
router.get('/:id', requirePermission('incidents.view'), getIncident);

/**
 * PATCH /api/incidents/:id/status
 * Update incident status
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6
 */
router.patch('/:id/status', requirePermission('incidents.update_status'), updateStatus);

/**
 * PATCH /api/incidents/:id/assign
 * Assign or reassign an incident
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */
router.patch('/:id/assign', requirePermission('incidents.assign'), assignIncident);

/**
 * POST /api/incidents/:id/comments
 * Add a comment to an incident
 * Requirements: 8.5
 */
router.post('/:id/comments', requirePermission('incidents.comment'), addComment);

/**
 * POST /api/incidents/:id/escalate
 * Manually escalate an incident to MoE
 * Requirements: 7.7, 7.8, 7.9
 */
router.post('/:id/escalate', requirePermission('incidents.escalate'), escalateIncident);

/**
 * POST /api/incidents/:id/confirm-resolution
 * Confirm that a resolved incident is actually fixed — transitions to Closed
 * Requirements: 6
 */
router.post('/:id/confirm-resolution', requirePermission('incidents.resolve'), confirmResolution);

/**
 * POST /api/incidents/:id/reject-resolution
 * Reject a resolution — transitions Resolved → Resolution Rejected → Reopened
 * Requirements: 6
 */
router.post('/:id/reject-resolution', requirePermission('incidents.resolve'), rejectResolution);

/**
 * POST /api/incidents/:id/sms-alert
 * Trigger an SMS alert for an incident (stub)
 * Requirements: 12.6
 */
router.post('/:id/sms-alert', requirePermission('alerts.sms_trigger'), triggerSmsAlert);

/**
 * POST /api/incidents/:id/attachments
 * Upload attachments to an incident
 * Requirements: 5.3, 8.4, 8.5
 * 
 * Multipart form data with field name 'files'
 * Max 10 files per request
 * Validates file type (photo, video, document) and size limits
 * Returns 507 if storage full
 */
router.post(
  '/:id/attachments',
  requirePermission('incidents.attach'),
  checkDiskSpace,
  upload.array('files', 10),
  uploadAttachments,
);

export default router;
