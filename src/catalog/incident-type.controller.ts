import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { incidentTypeService } from './incident-type.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createIncidentTypeSchema = z.object({
  name: z.string().min(1).max(255),
  defaultPriority: z.enum(['Low', 'Medium', 'High']),
  description: z.string().optional(),
});

const updateIncidentTypeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  defaultPriority: z.enum(['Low', 'Medium', 'High']).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ─── GET /api/catalog/incident-types ─────────────────────────────────────────

/**
 * Lists incident types with incident counts.
 * Accepts optional query param `includeInactive=true` to include inactive types.
 * Requirements: 19.5, 19.6
 */
export async function listIncidentTypes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const includeInactive = req.query['includeInactive'] === 'true';
    const types = await incidentTypeService.listIncidentTypes(includeInactive);
    res.status(200).json({ incidentTypes: types });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/catalog/incident-types ────────────────────────────────────────

/**
 * Creates a new incident type.
 * Requirements: 19.2, 19.3
 */
export async function createIncidentType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createIncidentTypeSchema.parse(req.body);
    const type = await incidentTypeService.createIncidentType(body);
    res.status(201).json({ incidentType: type });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/catalog/incident-types/:id ───────────────────────────────────

/**
 * Updates an existing incident type's fields (including active/inactive toggle).
 * Requirements: 19.3, 19.4
 */
export async function updateIncidentType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateIncidentTypeSchema.parse(req.body);
    const type = await incidentTypeService.updateIncidentType(id, body);
    res.status(200).json({ incidentType: type });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/catalog/incident-types/:id ──────────────────────────────────

/**
 * Soft-deletes an incident type (sets is_active = false).
 * Rejects with 409 if the type is referenced by routing rules or historical incidents.
 * Requirements: 19.7, 19.8
 */
export async function deleteIncidentType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const type = await incidentTypeService.softDeleteIncidentType(id);
    res.status(200).json({ incidentType: type });
  } catch (err) {
    next(err);
  }
}
