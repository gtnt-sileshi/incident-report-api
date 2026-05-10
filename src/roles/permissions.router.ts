import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getDb } from '../db';
import { permissions } from '../db/schema';
import { asc } from 'drizzle-orm';
import type { Permission } from '../db/schema';

const router = Router();

/**
 * GET /api/permissions
 *
 * Returns all system permissions grouped by group_name, ordered alphabetically
 * within each group. Requires authentication but no specific permission.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
router.get('/permissions', authenticate, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDb();
    const allPermissions = await db
      .select()
      .from(permissions)
      .orderBy(asc(permissions.groupName), asc(permissions.name));

    // Group by group_name
    const grouped = allPermissions.reduce<Record<string, Permission[]>>((acc, perm) => {
      const group = perm.groupName;
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(perm);
      return acc;
    }, {});

    res.status(200).json({ permissions: grouped });
  } catch (err) {
    next(err);
  }
});

export default router;
