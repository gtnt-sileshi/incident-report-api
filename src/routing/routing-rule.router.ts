import { Router } from 'express';
import {
  listRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
} from './routing-rule.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.get('/',     authenticate, requirePermission('routing.view'),   listRoutingRules);
router.post('/',    authenticate, requirePermission('routing.create'), createRoutingRule);
router.patch('/:id', authenticate, requirePermission('routing.edit'),  updateRoutingRule);
router.delete('/:id', authenticate, requirePermission('routing.delete'), deleteRoutingRule);

export default router;
