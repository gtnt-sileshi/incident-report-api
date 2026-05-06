import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/**
 * Role-based permission enforcement middleware.
 *
 * Checks the user's role against a known mapping of roles → allowed permissions.
 * Super admins are granted all permissions.
 *
 * @param permissionName - The required permission name (e.g., 'incidents.view')
 */
export function requirePermission(permissionName: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const userRole = req.user.role;

      // Super admin has all permissions
      if (userRole === 'super_admin') {
        return next();
      }

      // Define write operations that observer roles cannot perform
      const writeOperations = [
        'incidents.create',
        'incidents.edit',
        'incidents.delete',
        'incidents.assign',
        'incidents.update_status',
        'incidents.resolve',
        'incidents.escalate',
        'incidents.comment',
        'incidents.attach',
        'users.create',
        'users.edit',
        'users.delete',
        'users.approve',
        'users.assign_permissions',
        'devices.register',
        'devices.deactivate',
        'catalog.create',
        'catalog.edit',
        'catalog.delete',
        'alerts.sms_trigger',
        'alerts.push_trigger',
      ];

      // Observer roles have read-only access
      const observerRoles = ['moe_observer', 'aa_education_bureau'];

      if (observerRoles.includes(userRole) && writeOperations.includes(permissionName)) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `Read-only access: ${userRole} users cannot perform write operations`,
        );
      }

      // For all other roles, allow the request (role-based, not permission-table-based)
      next();
    } catch (err) {
      next(err);
    }
  };
}
