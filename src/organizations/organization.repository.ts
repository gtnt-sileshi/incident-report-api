import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  organizations,
  orgPermissions,
  permissions,
  Organization,
  NewOrganization,
  Permission,
} from '../db/schema';

export class OrganizationRepository {
  private get db() {
    return getDb();
  }

  async findAll(includeInactive = false): Promise<Organization[]> {
    if (includeInactive) {
      return this.db.select().from(organizations);
    }
    return this.db
      .select()
      .from(organizations)
      .where(eq(organizations.isActive, true));
  }

  async findById(id: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.name, name))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewOrganization): Promise<Organization> {
    const rows = await this.db
      .insert(organizations)
      .values(data)
      .returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewOrganization>): Promise<Organization | null> {
    const rows = await this.db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async deactivate(id: string): Promise<Organization | null> {
    const rows = await this.db
      .update(organizations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async getOrgPermissions(orgId: string): Promise<Permission[]> {
    const rows = await this.db
      .select({
        id: permissions.id,
        name: permissions.name,
        groupName: permissions.groupName,
      })
      .from(orgPermissions)
      .innerJoin(permissions, eq(orgPermissions.permissionId, permissions.id))
      .where(eq(orgPermissions.orgId, orgId));
    return rows;
  }

  async setOrgPermissions(orgId: string, permissionIds: number[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(orgPermissions)
        .where(eq(orgPermissions.orgId, orgId));

      if (permissionIds.length > 0) {
        await tx.insert(orgPermissions).values(
          permissionIds.map((permissionId) => ({ orgId, permissionId })),
        );
      }
    });
  }

  async removePermissionFromOrg(orgId: string, permissionId: number): Promise<void> {
    await this.db
      .delete(orgPermissions)
      .where(
        and(
          eq(orgPermissions.orgId, orgId),
          eq(orgPermissions.permissionId, permissionId),
        ),
      );
  }
}

export const organizationRepository = new OrganizationRepository();
export default OrganizationRepository;
