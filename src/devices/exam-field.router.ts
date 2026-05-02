import { Router } from 'express';
import {
  listExamFields,
  createExamField,
  updateExamField,
  deleteExamField,
} from './exam-field.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * GET /api/exam-fields
 * Lists all active exam fields.
 * Requirements: 3.2, 3.3
 */
router.get(
  '/',
  authenticate,
  requirePermission('exam_fields.view'),
  listExamFields,
);

/**
 * POST /api/exam-fields
 * Creates a new exam field.
 * Requirements: 3.2
 */
router.post(
  '/',
  authenticate,
  requirePermission('exam_fields.create'),
  createExamField,
);

/**
 * PATCH /api/exam-fields/:id
 * Updates an existing exam field.
 * Requirements: 3.6
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('exam_fields.edit'),
  updateExamField,
);

/**
 * DELETE /api/exam-fields/:id
 * Soft-deletes an exam field (sets is_active = false).
 * Requirements: 3.6
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('exam_fields.delete'),
  deleteExamField,
);

export default router;
