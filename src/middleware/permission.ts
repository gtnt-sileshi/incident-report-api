import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { permissionService } from '../roles/permission.service';

/**
 * Dynamic permission enforcement middleware.
 *
 * Resolves the requesting user's permission set from Redis cache (warm path)
 * or the database (cold path) via the PermissionService.
 *
 * Super admins bypass all checks without any DB or cache query.
 *
 * @param permissionName - The required permission name (e.g., 'incidents.view')
 *
 * Requirements: 5
 */
export function requirePermission(permissionName: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      // Super admin bypasses all checks — no DB/cache query
      if (req.user.role === 'super_admin') {
        return next();
      }

      let permissions: string[];
      try {
        permissions = await permissionService.resolvePermissions(req.user.sub);
      } catch {
        throw new AppError(
          503,
          'PERMISSION_SERVICE_UNAVAILABLE',
          'Permission service is temporarily unavailable',
        );
      }

      if (!permissions.includes(permissionName)) {
        throw new AppError(403, 'FORBIDDEN', `Missing required permission: ${permissionName}`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
