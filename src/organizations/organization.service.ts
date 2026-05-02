import { organizationRepository } from './organization.repository';
import { userRepository } from '../users/user.repository';
import { jwtService } from '../auth/jwt.service';
import { AppError } from '../middleware/errorHandler';
import { Organization, NewOrganization } from '../db/schema';

export class OrganizationService {
  /**
   * Creates a new organization and returns the created record.
   * Requirements: 2.1, 2.2
   */
  async createOrg(data: NewOrganization): Promise<Organization> {
    // Check for name uniqueness
    const existing = await organizationRepository.findByName(data.name);
    if (existing) {
      throw new AppError(409, 'ORG_NAME_CONFLICT', `Organization with name "${data.name}" already exists`);
    }

    return organizationRepository.create(data);
  }

  /**
   * Updates an existing organization's fields.
   * Requirements: 2.2
   */
  async updateOrg(id: string, data: Partial<NewOrganization>): Promise<Organization> {
    // If renaming, check uniqueness
    if (data.name) {
      const existing = await organizationRepository.findByName(data.name);
      if (existing && existing.id !== id) {
        throw new AppError(409, 'ORG_NAME_CONFLICT', `Organization with name "${data.name}" already exists`);
      }
    }

    const updated = await organizationRepository.update(id, data);
    if (!updated) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${id} not found`);
    }

    return updated;
  }

  /**
   * Deactivates an organization (sets is_active = false) and revokes all
   * active sessions for users of that organization via Redis.
   * Requirements: 2.7
   */
  async deactivateOrg(id: string): Promise<Organization> {
    const org = await organizationRepository.findById(id);
    if (!org) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${id} not found`);
    }

    if (!org.isActive) {
      throw new AppError(409, 'ORG_ALREADY_INACTIVE', `Organization ${id} is already inactive`);
    }

    const deactivated = await organizationRepository.deactivate(id);
    if (!deactivated) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${id} not found`);
    }

    // Revoke all sessions for users of this org via Redis
    await jwtService.revokeOrgSessions(id);

    return deactivated;
  }

  /**
   * Fetches a single organization by ID.
   * Requirements: 2.1
   */
  async getOrg(id: string): Promise<Organization> {
    const org = await organizationRepository.findById(id);
    if (!org) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${id} not found`);
    }
    return org;
  }

  /**
   * Lists all organizations (active only by default).
   * Requirements: 2.1
   */
  async listOrgs(includeInactive = false): Promise<Organization[]> {
    return organizationRepository.findAll(includeInactive);
  }

  /**
   * Replaces the org's permission set with the given permission names.
   * Cascade: for each permission removed from the org, removes it from all
   * users in the org via UserRepository.removePermissionFromAllOrgUsers.
   * Requirements: 2.3, 13.9, 18.7
   */
  async setOrgPermissions(orgId: string, permissionNames: string[]): Promise<void> {
    const org = await organizationRepository.findById(orgId);
    if (!org) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${orgId} not found`);
    }

    // Get current org permissions before the update
    const currentPermissions = await organizationRepository.getOrgPermissions(orgId);
    const newPermissionNames = new Set(permissionNames);

    // Determine which permissions are being removed
    const removedPermissions = currentPermissions.filter(
      (p) => !newPermissionNames.has(p.name),
    );

    // Resolve permission IDs for the new set
    // We need to look up permission IDs by name — use the current permissions
    // plus any new ones. We'll fetch all permissions from the org repo to get IDs.
    // Since permissions are system-defined, we can get IDs from the current set
    // and rely on the repository's setOrgPermissions to handle the rest.
    //
    // To get IDs for the new permission names, we query the permissions table
    // via the organization repository's internal DB access. However, the
    // OrganizationRepository.setOrgPermissions takes permissionIds (numbers).
    // We need to resolve names → IDs.
    //
    // Strategy: fetch all permissions from the DB to build a name→id map.
    const { getDb } = await import('../db/index');
    const { permissions } = await import('../db/schema');
    const db = getDb();

    const allPermissions = await db.select().from(permissions);
    const nameToId = new Map(allPermissions.map((p) => [p.name, p.id]));

    // Validate that all requested permission names exist
    const unknownNames = permissionNames.filter((name) => !nameToId.has(name));
    if (unknownNames.length > 0) {
      throw new AppError(
        400,
        'UNKNOWN_PERMISSIONS',
        `Unknown permission names: ${unknownNames.join(', ')}`,
      );
    }

    const newPermissionIds = permissionNames
      .map((name) => nameToId.get(name)!)
      .filter((id) => id !== undefined);

    // Update the org's permission set
    await organizationRepository.setOrgPermissions(orgId, newPermissionIds);

    // Cascade: remove each dropped permission from all users in the org
    for (const removedPerm of removedPermissions) {
      await userRepository.removePermissionFromAllOrgUsers(orgId, removedPerm.id);
    }
  }

  /**
   * Returns the current permission names for an organization.
   * Requirements: 2.3
   */
  async getOrgPermissions(orgId: string): Promise<string[]> {
    const org = await organizationRepository.findById(orgId);
    if (!org) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${orgId} not found`);
    }

    const perms = await organizationRepository.getOrgPermissions(orgId);
    return perms.map((p) => p.name);
  }
}

export const organizationService = new OrganizationService();
export default OrganizationService;
