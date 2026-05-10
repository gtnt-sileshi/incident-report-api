import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { examPeriodRepository } from './exam-period.repository';
import { AppError } from '../middleware/errorHandler';
import { auditLogRepository } from '../audit/audit-log.repository';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createExamPeriodSchema = z.object({
  name:      z.string().min(1).max(255),
  startDate: z.string().datetime({ message: 'startDate must be a valid ISO8601 date-time string' }),
  endDate:   z.string().datetime({ message: 'endDate must be a valid ISO8601 date-time string' }),
});

const updateExamPeriodSchema = z.object({
  name:      z.string().min(1).max(255).optional(),
  startDate: z.string().datetime({ message: 'startDate must be a valid ISO8601 date-time string' }).optional(),
  endDate:   z.string().datetime({ message: 'endDate must be a valid ISO8601 date-time string' }).optional(),
});

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function listExamPeriods(_req: Request, res: Response, next: NextFunction) {
  try {
    const periods = await examPeriodRepository.findAll();
    res.status(200).json({ examPeriods: periods });
  } catch (err) {
    next(err);
  }
}

export async function createExamPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createExamPeriodSchema.parse(req.body);

    const start = new Date(body.startDate);
    const end   = new Date(body.endDate);
    if (start >= end) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'startDate must be before endDate');
    }

    const period = await examPeriodRepository.create({
      name:      body.name,
      startDate: start,
      endDate:   end,
    });

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_PERIOD_CREATED',
      newValue: JSON.stringify(period),
      details: `New exam period "${period.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ examPeriod: period });
  } catch (err) {
    next(err);
  }
}

export async function updateExamPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = updateExamPeriodSchema.parse(req.body);

    // Validate date range if both dates are provided
    if (body.startDate && body.endDate) {
      const start = new Date(body.startDate);
      const end   = new Date(body.endDate);
      if (start >= end) {
        throw new AppError(400, 'INVALID_DATE_RANGE', 'startDate must be before endDate');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.name      !== undefined) updateData.name      = body.name;
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate);
    if (body.endDate   !== undefined) updateData.endDate   = new Date(body.endDate);

    const existing = await examPeriodRepository.findById(id);
    const period = await examPeriodRepository.update(id, updateData);
    if (!period) {
      throw new AppError(404, 'NOT_FOUND', 'Exam period not found');
    }

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_PERIOD_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(period),
      details: `Exam period "${period.name}" updated by ${req.user!.email}`,
    });

    res.status(200).json({ examPeriod: period });
  } catch (err) {
    next(err);
  }
}

export async function deleteExamPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await examPeriodRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Exam period not found');
    }
    await examPeriodRepository.delete(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_PERIOD_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Exam period "${existing.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function activateExamPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await examPeriodRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Exam period not found');
    }
    const period = await examPeriodRepository.activate(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_PERIOD_ACTIVATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(period),
      details: `Exam period "${period.name}" set as active by ${req.user!.email}`,
    });

    res.status(200).json({ examPeriod: period });
  } catch (err) {
    next(err);
  }
}

export async function deactivateExamPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await examPeriodRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Exam period not found');
    }
    const period = await examPeriodRepository.deactivate(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_PERIOD_DEACTIVATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(period),
      details: `Exam period "${period.name}" deactivated by ${req.user!.email}`,
    });

    res.status(200).json({ examPeriod: period });
  } catch (err) {
    next(err);
  }
}
