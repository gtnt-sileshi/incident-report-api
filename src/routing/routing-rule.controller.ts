import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { routingRuleRepository } from './routing-rule.repository';
import { AppError } from '../middleware/errorHandler';
import { auditLogRepository } from '../audit/audit-log.repository';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createRoutingRuleSchema = z.object({
  incidentTypeId: z.string().uuid().nullable().optional(),
  examFieldId:    z.string().uuid().nullable().optional(),
  targetUserId:   z.string().uuid(),
  autoAssign:     z.boolean().optional().default(false),
  priority:       z.number().int().min(1).optional().default(100),
  isActive:       z.boolean().optional().default(true),
});

const updateRoutingRuleSchema = z.object({
  incidentTypeId: z.string().uuid().nullable().optional(),
  examFieldId:    z.string().uuid().nullable().optional(),
  targetUserId:   z.string().uuid().optional(),
  autoAssign:     z.boolean().optional(),
  priority:       z.number().int().min(1).optional(),
  isActive:       z.boolean().optional(),
});

// ─── GET /api/routing-rules ───────────────────────────────────────────────────

/**
 * Lists all routing rules.
 */
export async function listRoutingRules(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rules = await routingRuleRepository.findAll();
    res.status(200).json({ routingRules: rules });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/routing-rules ──────────────────────────────────────────────────

/**
 * Creates a new routing rule.
 */
export async function createRoutingRule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createRoutingRuleSchema.parse(req.body);
    const rule = await routingRuleRepository.create({
      incidentTypeId: body.incidentTypeId ?? null,
      examFieldId:    body.examFieldId ?? null,
      targetUserId:   body.targetUserId,
      autoAssign:     body.autoAssign,
      priority:       body.priority,
      isActive:       body.isActive,
    });

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'ROUTING_RULE_CREATED',
      newValue: JSON.stringify(rule),
      details: `Routing rule created for target user ID ${rule.targetUserId} by ${req.user!.email}`,
    });

    res.status(201).json({ routingRule: rule });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/routing-rules/:id ────────────────────────────────────────────

/**
 * Updates an existing routing rule.
 */
export async function updateRoutingRule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateRoutingRuleSchema.parse(req.body);

    const existing = await routingRuleRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'ROUTING_RULE_NOT_FOUND', `Routing rule ${id} not found`);
    }

    const updated = await routingRuleRepository.update(id, body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'ROUTING_RULE_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
      details: `Routing rule ID ${id} modified by ${req.user!.email}`,
    });

    res.status(200).json({ routingRule: updated });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/routing-rules/:id ───────────────────────────────────────────

/**
 * Deletes a routing rule.
 */
export async function deleteRoutingRule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const existing = await routingRuleRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'ROUTING_RULE_NOT_FOUND', `Routing rule ${id} not found`);
    }

    await routingRuleRepository.delete(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'ROUTING_RULE_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Routing rule ID ${id} deleted by ${req.user!.email}`,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
