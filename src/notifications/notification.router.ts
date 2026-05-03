import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { notificationService } from './notification.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/notifications
 * Returns all unread notifications for the authenticated user.
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const notifications = await notificationService.getUnread(req.user.sub);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
router.patch('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    await notificationService.markRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Marks all notifications as read for the authenticated user.
 */
router.patch('/read-all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const { notificationRepository } = await import('./notification.repository');
    await notificationRepository.markAllReadForUser(req.user.sub);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
