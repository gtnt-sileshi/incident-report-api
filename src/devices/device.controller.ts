import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { deviceService } from './device.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1).max(255),
  userId: z.string().uuid().optional(),
  deviceName: z.string().max(255).optional(),
  model: z.string().max(255).optional(),
  osVersion: z.string().max(50).optional(),
  appVersion: z.string().max(50).optional(),
  installationId: z.string().max(255).optional(),
  publicKey: z.string().optional(),
  isActive: z.boolean().optional(),
});

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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const result = await deviceService.listDevices({
      includeInactive,
      limit,
      offset
    });
    res.status(200).json(result);
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

// ─── PATCH /api/devices/:id/toggle ──────────────────────────────────────────
export async function toggleDeviceStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const device = await deviceService.toggleDeviceStatus(id, req.user);
    res.status(200).json({ device });
  } catch (err) {
    next(err);
  }
}
