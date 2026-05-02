import { Request, Response, NextFunction } from 'express';
import { userRepository } from '../users/user.repository';
import { organizationRepository } from '../organizations/organization.repository';
import { AppError } from './errorHandler';

/**
 * Two-level permission enforcement middleware factory.
 * 
 * For any user with permission set P_user belonging to an organization with 
 * permission set P_org, and for any action requiring permission P, the action 
 * SHALL be denied if P is absent from P_user OR absent from P_org.
 * 
 * The effective permission set is always P_user ∩ P_org.
 * 
 * @param permissionName - The required permission name (e.g., 'incidents.view')
 * @returns Express middleware that enforces the permission check
 * 
 * @example
 * router.get('/incidents', authenticate, requirePermission('incidents.view'), handler);
 */
export function requirePermission(permissionName: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Ensure user is authenticated (should be set by authenticate middleware)
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const userId = req.user.sub;
      const orgId = req.user.orgId;
      const userRole = req.user.role;

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
        'organizations.create',
        'organizations.edit',
        'organizations.delete',
        'organizations.assign_permissions',
        'devices.register',
        'devices.deactivate',
        'exam_fields.create',
        'exam_fields.edit',
        'exam_fields.delete',
        'catalog.create',
        'catalog.edit',
        'catalog.delete',
        'routing.create',
        'routing.edit',
        'routing.delete',
        'alerts.sms_trigger',
        'alerts.push_trigger'
      ];

      // Observer roles (MoE, AA_Education_Bureau) have read-only access
      const observerRoles = ['moe', 'aa_education_bureau'];
      
      // Deny all write operations for observer roles regardless of permissions
      if (observerRoles.includes(userRole) && writeOperations.includes(permissionName)) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `Read-only access: ${userRole} users cannot perform write operations`,
        );
      }

      // Load user's permission set
      const userPermissions = await userRepository.getUserPermissions(userId);
      const userPermissionNames = new Set(userPermissions.map(p => p.name));

      // Load organization's permission set
      const orgPermissions = await organizationRepository.getOrgPermissions(orgId);
      const orgPermissionNames = new Set(orgPermissions.map(p => p.name));

      // Compute intersection: permission must be in BOTH sets
      const hasUserPermission = userPermissionNames.has(permissionName);
      const hasOrgPermission = orgPermissionNames.has(permissionName);

      // Deny if permission is absent from either set
      if (!hasUserPermission || !hasOrgPermission) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `Permission denied: ${permissionName} not granted`,
        );
      }

      // Permission is in both sets - allow request to proceed
      next();
    } catch (err) {
      next(err);
    }
  };
}
