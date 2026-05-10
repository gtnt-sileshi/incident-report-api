import { Router } from 'express';
import {
  listExamPeriods,
  createExamPeriod,
  updateExamPeriod,
  deleteExamPeriod,
  activateExamPeriod,
  deactivateExamPeriod,
} from './exam-period.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

const guard = [authenticate, requirePermission('exam_periods.manage')];

router.get('/',           authenticate, listExamPeriods);
router.post('/',          ...guard, createExamPeriod);
router.patch('/:id',      ...guard, updateExamPeriod);
router.delete('/:id',     ...guard, deleteExamPeriod);
router.post('/:id/activate',   ...guard, activateExamPeriod);
router.post('/:id/deactivate', ...guard, deactivateExamPeriod);

export default router;
