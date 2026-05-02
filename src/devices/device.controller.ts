import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { deviceService } from './device.service';
import { examCenterAssignmentRepository } from './exam-center-assignment.repository';
import { AppError } from '../middleware/errorHandler';

// ─── Validation schemas ───────────────────────────────────────────────────────

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1).max(255),
  userId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

const assignExamFieldSchema = z.object({
  fieldId: z.string().uuid().optional(),
  examFieldId: z.string().uuid().optional(),
}).refine(
  (data) => data.fieldId || data.examFieldId,
  { message: 'Either fieldId or examFieldId is required' }
);

// ─── GET /api/devices ─────────────────────────────────────────────────────────

/**
 * Lists all registered devices with assignment info.
 * Accepts optional query param `includeInactive=true`.
 * Requirements: 3.8
 */
export async function listDevices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const includeInactive = req.query['includeInactive'] === 'true';
    const deviceList = await deviceService.listDevices(includeInactive);
    res.status(200).json({ devices: deviceList });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/devices ────────────────────────────────────────────────────────

/**
 * Registers a new device.
 * Enforces Device_ID uniqueness.
 * Requirements: 3.1, 13.4
 */
export async function registerDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = registerDeviceSchema.parse(req.body);
    const device = await deviceService.registerDevice(body);
    res.status(201).json({ device });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/devices/:id/deactivate ───────────────────────────────────────

/**
 * Deactivates a registered device.
 * Requirements: 3.7
 */
export async function deactivateDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const device = await deviceService.deactivateDevice(id);
    res.status(200).json({ device });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users/:userId/exam-assignments ─────────────────────────────────

/**
 * Assigns an exam field to a user (creates an Exam_Center_Assignment).
 * Accepts either fieldId or examFieldId in the request body.
 * Requirements: 3.2, 3.6
 */
export async function assignExamField(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params;
    const body = assignExamFieldSchema.parse(req.body);
    
    // Accept either fieldId or examFieldId
    const fieldId = body.fieldId || body.examFieldId;
    
    if (!fieldId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'fieldId or examFieldId is required');
    }

    const assignment = await examCenterAssignmentRepository.assign(userId, fieldId);
    res.status(201).json({ assignment });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/users/:userId/exam-assignments/:fieldId ─────────────────────

/**
 * Removes an exam field assignment from a user.
 * Requirements: 3.2, 3.6
 */
export async function removeExamAssignment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, fieldId } = req.params;
    await examCenterAssignmentRepository.unassign(userId, fieldId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
