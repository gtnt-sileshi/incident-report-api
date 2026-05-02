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

/**
 * GET /api/routing-rules
 * Lists all routing rules.
 */
router.get(
  '/',
  authenticate,
  requirePermission('routing.view'),
  listRoutingRules,
);

/**
 * POST /api/routing-rules
 * Creates a new routing rule.
 */
router.post(
  '/',
  authenticate,
  requirePermission('routing.create'),
  createRoutingRule,
);

/**
 * PATCH /api/routing-rules/:id
 * Updates an existing routing rule.
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('routing.edit'),
  updateRoutingRule,
);

/**
 * DELETE /api/routing-rules/:id
 * Hard-deletes a routing rule.
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('routing.delete'),
  deleteRoutingRule,
);

export default router;
