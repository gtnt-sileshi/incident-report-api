import { getDb } from '../db';
import { userRoles, rolePermissions, permissions, roles, users } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import type { Role, NewRole, User, Permission } from '../db/schema';

// Re-export Permission type so callers can use it
export type { Permission };

export class RoleRepository {
  private get db() {
    return getDb();
  }

  // ─── Roles CRUD ────────────────────────────────────────────────────────────

  async findAll(): Promise<Role[]> {
    return this.db.select().from(roles).orderBy(roles.name);
  }

  async findById(id: string): Promise<Role | null> {
    const rows = await this.db.select().from(roles).where(eq(roles.id, id));
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<Role | null> {
    const rows = await this.db.select().from(roles).where(eq(roles.name, name));
    return rows[0] ?? null;
  }

  async create(data: NewRole): Promise<Role> {
    const rows = await this.db.insert(roles).values(data).returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewRole>): Promise<Role | null> {
    const rows = await this.db.update(roles).set(data).where(eq(roles.id, id)).returning();
    return rows[0] ?? null;
  }

  /** Soft-delete: sets isActive = false */
  async softDelete(id: string): Promise<Role | null> {
    const rows = await this.db
      .update(roles)
      .set({ isActive: false })
      .where(eq(roles.id, id))
      .returning();
    return rows[0] ?? null;
  }

  // ─── Role-Permission management ────────────────────────────────────────────

  async getPermissionsForRole(roleId: string): Promise<Permission[]> {
    const rows = await this.db
      .select({ permission: permissions })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.permission);
  }

  async setPermissionsForRole(roleId: string, permissionIds: number[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permissionIds.length > 0) {
        await tx.insert(rolePermissions).values(
          permissionIds.map((permissionId) => ({ roleId, permissionId })),
        );
      }
    });
  }

  // ─── User-Role management ──────────────────────────────────────────────────

  async getRolesForUser(userId: string): Promise<Role[]> {
    const rows = await this.db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.role);
  }

  async setRolesForUser(userId: string, roleIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      if (roleIds.length > 0) {
        await tx.insert(userRoles).values(
          roleIds.map((roleId) => ({ userId, roleId })),
        );
      }
      // Keep users.role in sync with the primary role name for backward compat
      if (roleIds.length > 0) {
        const primaryRole = await tx
          .select({ name: roles.name })
          .from(roles)
          .where(eq(roles.id, roleIds[0]))
          .limit(1);
        if (primaryRole[0]) {
          await tx
            .update(users)
            .set({ role: primaryRole[0].name })
            .where(eq(users.id, userId));
        }
      }
    });
  }

  async getUsersForRole(roleId: string): Promise<User[]> {
    const rows = await this.db
      .select({ user: users })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, roleId));
    return rows.map((r) => r.user);
  }

  // ─── Permission resolution ─────────────────────────────────────────────────

  /**
   * Returns the deduplicated set of permission names for a user,
   * derived by unioning the permissions of all active roles assigned to that user.
   *
   * SQL equivalent:
   *   SELECT DISTINCT p.name
   *   FROM user_roles ur
   *   JOIN role_permissions rp ON rp.role_id = ur.role_id
   *   JOIN permissions p ON p.id = rp.permission_id
   *   JOIN roles r ON r.id = ur.role_id
   *   WHERE ur.user_id = $1 AND r.is_active = true
   *
   * Requirements: 5, 13
   */
  async resolvePermissionsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: permissions.name })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(roles.isActive, true)));

    return rows.map((r) => r.name);
  }
}

export const roleRepository = new RoleRepository();
