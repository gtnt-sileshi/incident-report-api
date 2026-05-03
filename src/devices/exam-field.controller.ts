import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { examFieldService } from './exam-field.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const coordSchema = z.union([
  z.string().regex(/^-?\d{1,3}(\.\d{1,8})?$/),
  z.number().transform(n => n.toString()),
]).optional();

const createExamFieldSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().max(500).optional(),
  latitude: coordSchema,
  longitude: coordSchema,
});

const updateExamFieldSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  location: z.string().max(500).optional(),
  latitude: coordSchema,
  longitude: coordSchema,
  isActive: z.boolean().optional(),
});

// ─── GET /api/exam-fields ─────────────────────────────────────────────────────

/**
 * Lists all active exam fields.
 * Requirements: 3.2, 3.3
 */
export async function listExamFields(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fields = await examFieldService.listExamFields();
    res.status(200).json({ examFields: fields });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/exam-fields ────────────────────────────────────────────────────

/**
 * Creates a new exam field.
 * Requirements: 3.2
 */
export async function createExamField(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createExamFieldSchema.parse(req.body);
    const field = await examFieldService.createExamField(body);
    res.status(201).json({ examField: field });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/exam-fields/:id ───────────────────────────────────────────────

/**
 * Updates an existing exam field.
 * Requirements: 3.6
 */
export async function updateExamField(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateExamFieldSchema.parse(req.body);
    const field = await examFieldService.updateExamField(id, body);
    res.status(200).json({ examField: field });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/exam-fields/:id ──────────────────────────────────────────────

/**
 * Soft-deletes an exam field (sets is_active = false).
 * Requirements: 3.6
 */
export async function deleteExamField(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const field = await examFieldService.deleteExamField(id);
    res.status(200).json({ examField: field });
  } catch (err) {
    next(err);
  }
}
