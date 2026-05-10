import { inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { permissions } from '../db/schema';
import { roleRepository } from './role.repository';
import { permissionService } from './permission.service';
import { auditLogRepository } from '../audit/audit-log.repository';
import { AppError } from '../middleware/errorHandler';
import type { Role, NewRole } from '../db/schema';
import type { JwtPayload } from '../auth/jwt.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateRoleData {
  name: string;
  description?: string;
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
  isActive?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class RoleService {
  /**
   * Creates a new role after validating name uniqueness.
   * Appends a ROLE_CREATED audit log entry.
   *
   * Requirements: 1, 12
   */
  async createRole(data: CreateRoleData, actor: JwtPayload): Promise<Role> {
    const existing = await roleRepository.findByName(data.name);
    if (existing) {
      throw new AppError(
        409,
        'ROLE_NAME_CONFLICT',
        `A role with name "${data.name}" already exists`,
      );
    }

    const newRole: NewRole = {
      name: data.name,
      description: data.description ?? null,
      isSystem: false,
      isActive: true,
    };

    const role = await roleRepository.create(newRole);

    await auditLogRepository.append({
      actorUserId: actor.sub,
      actorRole: actor.role,
      actionType: 'ROLE_CREATED',
      newValue: JSON.stringify({ id: role.id, name: role.name, description: role.description }),
      details: `New role "${role.name}" created by ${actor.email}`,
    });

    return role;
  }

  /**
   * Updates an existing role's fields.
   * Appends a ROLE_UPDATED audit log entry.
   *
   * Requirements: 1, 12
   */
  async updateRole(id: string, data: UpdateRoleData, actor: JwtPayload): Promise<Role> {
    const existing = await roleRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);
    }

    const updated = await roleRepository.update(id, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    });

    if (!updated) {
      throw new AppError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);
    }

    await auditLogRepository.append({
      actorUserId: actor.sub,
      actorRole: actor.role,
      actionType: 'ROLE_UPDATED',
      previousValue: JSON.stringify({
        name: existing.name,
        description: existing.description,
        isActive: existing.isActive,
      }),
      newValue: JSON.stringify({
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
      }),
      details: `Role "${updated.name}" modified by ${actor.email}. Fields: ${Object.keys(data).join(', ')}`,
    });

    return updated;
  }

  /**
   * Soft-deletes a role by setting isActive = false.
   * Throws 403 if the role is a system role (isSystem = true).
   * Invalidates the permission cache for all users assigned to this role.
   * Appends a ROLE_DEACTIVATED audit log entry.
   *
   * Requirements: 1, 11, 12
   */
  async deactivateRole(id: string, actor: JwtPayload): Promise<Role> {
    const role = await roleRepository.findById(id);
    if (!role) {
      throw new AppError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);
    }

    if (role.isSystem) {
      throw new AppError(
        403,
        'ROLE_PROTECTED',
        `Role "${role.name}" is a system role and cannot be deactivated`,
      );
    }

    const deactivated = await roleRepository.softDelete(id);
    if (!deactivated) {
      throw new AppError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);
    }

    // Invalidate cache for all users assigned to this role
    await permissionService.invalidateRole(id);

    await auditLogRepository.append({
      actorUserId: actor.sub,
      actorRole: actor.role,
      actionType: 'ROLE_DEACTIVATED',
      previousValue: JSON.stringify({ name: role.name, isActive: role.isActive }),
      newValue: JSON.stringify({ name: deactivated.name, isActive: deactivated.isActive }),
      details: `Role "${role.name}" deactivated by ${actor.email}`,
    });

    return deactivated;
  }

  /**
   * Replaces the permission set for a role.
   * Validates that all provided permissionIds exist in the permissions table.
   * Invalidates the permission cache for all users assigned to this role.
   * Appends a ROLE_PERMISSIONS_UPDATED audit log entry.
   *
   * Requirements: 2, 11, 12
   */
  async setRolePermissions(
    roleId: string,
    permissionIds: number[],
    actor: JwtPayload,
  ): Promise<void> {
    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw new AppError(404, 'ROLE_NOT_FOUND', `Role ${roleId} not found`);
    }

    // Validate all permissionIds exist
    if (permissionIds.length > 0) {
      const db = getDb();
      const foundPermissions = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.id, permissionIds));

      const foundIds = new Set(foundPermissions.map((p) => p.id));
      const invalidIds = permissionIds.filter((id) => !foundIds.has(id));

      if (invalidIds.length > 0) {
        throw new AppError(
          422,
          'INVALID_PERMISSION_ID',
          `The following permission IDs do not exist: ${invalidIds.join(', ')}`,
          { invalidIds },
        );
      }
    }

    // Capture previous state for audit log
    const previousPermissions = await roleRepository.getPermissionsForRole(roleId);
    const previousIds = previousPermissions.map((p) => p.id);

    await roleRepository.setPermissionsForRole(roleId, permissionIds);

    // Invalidate cache for all users assigned to this role
    await permissionService.invalidateRole(roleId);

    await auditLogRepository.append({
      actorUserId: actor.sub,
      actorRole: actor.role,
      actionType: 'ROLE_PERMISSIONS_UPDATED',
      previousValue: JSON.stringify(previousIds),
      newValue: JSON.stringify(permissionIds),
      details: `Permissions updated for role "${role.name}" by ${actor.email}`,
    });
  }

  /**
   * Replaces the role set for a user.
   * Validates that all provided roleIds exist and are active.
   * Invalidates the permission cache for the affected user.
   * Appends a USER_ROLES_UPDATED audit log entry.
   *
   * Requirements: 3, 11, 12
   */
  async setUserRoles(
    userId: string,
    roleIds: string[],
    actor: JwtPayload,
  ): Promise<void> {
    // Validate all roleIds exist and are active
    if (roleIds.length > 0) {
      const foundRoles = await Promise.all(roleIds.map((id) => roleRepository.findById(id)));
      const invalidIds = roleIds.filter((_id, index) => {
        const found = foundRoles[index];
        return !found || !found.isActive;
      });

      if (invalidIds.length > 0) {
        throw new AppError(
          422,
          'INVALID_ROLE_ID',
          `The following role IDs do not exist or are inactive: ${invalidIds.join(', ')}`,
          { invalidIds },
        );
      }
    }

    // Capture previous state for audit log
    const previousRoles = await roleRepository.getRolesForUser(userId);
    const previousIds = previousRoles.map((r) => r.id);

    await roleRepository.setRolesForUser(userId, roleIds);

    // Invalidate cache for the affected user
    await permissionService.invalidateUser(userId);

    await auditLogRepository.append({
      actorUserId: actor.sub,
      actorRole: actor.role,
      actionType: 'USER_ROLES_UPDATED',
      previousValue: JSON.stringify(previousIds),
      newValue: JSON.stringify(roleIds),
      details: `Roles updated for user ID ${userId} by ${actor.email}`,
    });
  }
}

export const roleService = new RoleService();
