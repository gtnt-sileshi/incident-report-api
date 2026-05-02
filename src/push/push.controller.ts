import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pushTokenRepository } from './push-token.repository';
import { AppError } from '../middleware/errorHandler';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const RegisterTokenSchema = z.object({
  tokenType: z.enum(['fcm', 'web_push']),
  token: z.string().min(1),
  deviceId: z.string().optional(),
});

const UnregisterTokenSchema = z.object({
  deviceId: z.string().min(1),
});

// ─── Controller ──────────────────────────────────────────────────────────────

export class PushController {
  /**
   * POST /api/push/register
   * Registers a push token for the authenticated user.
   * Requirements: 14.1
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
      }

      const parsed = RegisterTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request body', {
          errors: parsed.error.errors,
        });
      }

      const { tokenType, token, deviceId } = parsed.data;

      const pushToken = await pushTokenRepository.register(
        userId,
        tokenType,
        token,
        deviceId ?? null,
      );

      res.status(200).json({
        message: 'Push token registered successfully',
        data: {
          id: pushToken.id,
          tokenType: pushToken.tokenType,
          deviceId: pushToken.deviceId,
          createdAt: pushToken.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/push/unregister
   * Unregisters a push token for the authenticated user and device.
   * Requirements: 14.1
   */
  async unregister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
      }

      const parsed = UnregisterTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request body', {
          errors: parsed.error.errors,
        });
      }

      const { deviceId } = parsed.data;

      await pushTokenRepository.unregister(userId, deviceId);

      res.status(200).json({
        message: 'Push token unregistered successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const pushController = new PushController();
export default PushController;
