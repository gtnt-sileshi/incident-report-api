import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  users,
  userPermissions,
  permissions,
  User,
  NewUser,
  Permission,
} from '../db/schema';

export class UserRepository {
  private get db() {
    return getDb();
  }

  async findAll(orgId?: string, includeInactive = false): Promise<User[]> {
    const conditions = [];

    if (orgId) {
      conditions.push(eq(users.orgId, orgId));
    }
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }

    if (conditions.length === 0) {
      return this.db.select().from(users);
    }
    if (conditions.length === 1) {
      return this.db.select().from(users).where(conditions[0]);
    }
    return this.db.select().from(users).where(and(...conditions));
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values(data)
      .returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | null> {
    const rows = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async deactivate(id: string): Promise<User | null> {
    const rows = await this.db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const rows = await this.db
      .select({
        id: permissions.id,
        name: permissions.name,
        groupName: permissions.groupName,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(eq(userPermissions.userId, userId));
    return rows;
  }

  async setUserPermissions(userId: string, permissionIds: number[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(userPermissions)
        .where(eq(userPermissions.userId, userId));

      if (permissionIds.length > 0) {
        await tx.insert(userPermissions).values(
          permissionIds.map((permissionId) => ({ userId, permissionId })),
        );
      }
    });
  }

  async removePermissionFromUser(userId: string, permissionId: number): Promise<void> {
    await this.db
      .delete(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.permissionId, permissionId),
        ),
      );
  }

  async removePermissionFromAllOrgUsers(orgId: string, permissionId: number): Promise<void> {
    // Get all user IDs in the org
    const orgUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return;

    const userIds = orgUsers.map((u) => u.id);

    // Delete the permission from all those users in a transaction
    await this.db.transaction(async (tx) => {
      for (const userId of userIds) {
        await tx
          .delete(userPermissions)
          .where(
            and(
              eq(userPermissions.userId, userId),
              eq(userPermissions.permissionId, permissionId),
            ),
          );
      }
    });
  }
}

export const userRepository = new UserRepository();
export default UserRepository;
