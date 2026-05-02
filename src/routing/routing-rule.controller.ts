import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { routingRuleService } from './routing-rule.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createRoutingRuleSchema = z.object({
  incidentTypeId: z.string().uuid(),
  targetOrgId: z.string().uuid().optional().nullable(),
  targetUserId: z.string().uuid().optional().nullable(),
  autoAssign: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

const updateRoutingRuleSchema = z.object({
  incidentTypeId: z.string().uuid().optional(),
  targetOrgId: z.string().uuid().optional().nullable(),
  targetUserId: z.string().uuid().optional().nullable(),
  autoAssign: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ─── GET /api/routing-rules ───────────────────────────────────────────────────

/**
 * Lists all routing rules.
 * Accepts optional query param `includeInactive=true` to include inactive rules.
 * Requirements: 17.1
 */
export async function listRoutingRules(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const includeInactive = req.query['includeInactive'] === 'true';
    const rules = await routingRuleService.listRoutingRules(includeInactive);
    res.status(200).json({ routingRules: rules });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/routing-rules ──────────────────────────────────────────────────

/**
 * Creates a new routing rule.
 * Requirements: 17.1, 17.4
 */
export async function createRoutingRule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createRoutingRuleSchema.parse(req.body);
    const rule = await routingRuleService.createRoutingRule(body);
    res.status(201).json({ routingRule: rule });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/routing-rules/:id ────────────────────────────────────────────

/**
 * Updates an existing routing rule's fields.
 * Requirements: 17.5
 */
export async function updateRoutingRule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateRoutingRuleSchema.parse(req.body);
    const rule = await routingRuleService.updateRoutingRule(id, body);
    res.status(200).json({ routingRule: rule });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/routing-rules/:id ───────────────────────────────────────────

/**
 * Hard-deletes a routing rule.
 * Requirements: 17.6
 */
export async function deleteRoutingRule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    await routingRuleService.deleteRoutingRule(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
