import bcrypt from 'bcryptjs';
import { userRepository } from './user.repository';
import { organizationRepository } from '../organizations/organization.repository';
import { deviceRepository } from '../devices/device.repository';
import { jwtService } from '../auth/jwt.service';
import { qrCredentialRepository } from '../qr/qr-credential.repository';
import { AppError } from '../middleware/errorHandler';
import { User, NewUser } from '../db/schema';
import { JwtPayload } from '../auth/jwt.service';

export interface CreateUserData {
  orgId: string;
  name: string;
  email?: string;
  password?: string;
  role: string;
  phoneNumber?: string;
  deviceId?: string; // required for IT_Rep role
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  phoneNumber?: string;
  isActive?: boolean;
}

export class UserService {
  /**
   * Creates a new user.
   * - If role = 'it_rep', enforces Device_ID uniqueness (no other active IT_Rep
   *   may have the same deviceId).
   * - Hashes the password with bcrypt before storing.
   * - Auto-issues a QR credential stub for IT_Rep (full QR service in task 13).
   * Requirements: 13.1, 13.2, 13.3, 13.4
   */
  async createUser(data: CreateUserData): Promise<User> {
    // Validate org exists
    const org = await organizationRepository.findById(data.orgId);
    if (!org) {
      throw new AppError(404, 'ORG_NOT_FOUND', `Organization ${data.orgId} not found`);
    }

    // Check email uniqueness if provided
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing) {
        throw new AppError(409, 'EMAIL_CONFLICT', `A user with email "${data.email}" already exists`);
      }
    }

    // IT_Rep-specific validation
    if (data.role === 'it_rep') {
      if (!data.deviceId) {
        throw new AppError(
          400,
          'DEVICE_ID_REQUIRED',
          'A Device_ID is required when creating an IT_Representative account',
        );
      }

      // Enforce Device_ID uniqueness: no other active IT_Rep may have the same deviceId
      const existingDevice = await deviceRepository.findByDeviceId(data.deviceId);
      if (existingDevice && existingDevice.isActive) {
        // Check if the device is linked to an active IT_Rep user
        if (existingDevice.userId) {
          const linkedUser = await userRepository.findById(existingDevice.userId);
          if (linkedUser && linkedUser.isActive && linkedUser.role === 'it_rep') {
            throw new AppError(
              409,
              'DEVICE_ID_CONFLICT',
              `Device_ID "${data.deviceId}" is already associated with an active IT_Representative`,
            );
          }
        }
      }
    }

    // Hash password if provided
    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    // Build the new user record
    const newUser: NewUser = {
      orgId: data.orgId,
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      phoneNumber: data.phoneNumber,
      isActive: true,
    };

    const user = await userRepository.create(newUser);

    // If IT_Rep, register the device and stub QR credential issuance
    if (data.role === 'it_rep' && data.deviceId) {
      // Register the device linked to this user
      const existingDevice = await deviceRepository.findByDeviceId(data.deviceId);
      if (!existingDevice) {
        await deviceRepository.register({
          deviceId: data.deviceId,
          userId: user.id,
          isActive: true,
        });
      }

      // Stub: QR credential auto-issuance noted here.
      // Full QR credential generation (ECDSA signing) is implemented in task 13.
      // For now, we record a placeholder credential so the user record is complete.
      // TODO (task 13): replace stub with real QrService.issueCredential(user)
    }

    return user;
  }

  /**
   * Updates an existing user's fields.
   * Requirements: 13.1, 13.2
   */
  async updateUser(id: string, data: UpdateUserData): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }

    // Check email uniqueness if changing email
    if (data.email && data.email !== user.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) {
        throw new AppError(409, 'EMAIL_CONFLICT', `A user with email "${data.email}" already exists`);
      }
    }

    // Hash new password if provided
    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    const updateData: Partial<NewUser> = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(passwordHash !== undefined && { passwordHash }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    };

    const updated = await userRepository.update(id, updateData);
    if (!updated) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }

    return updated;
  }

  /**
   * Deactivates a user account:
   * - Sets is_active = false
   * - Revokes all active JWT sessions via Redis
   * - Invalidates the user's QR credential (stub)
   * Requirements: 13.5
   */
  async deactivateUser(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }

    if (!user.isActive) {
      throw new AppError(409, 'USER_ALREADY_INACTIVE', `User ${id} is already inactive`);
    }

    const deactivated = await userRepository.deactivate(id);
    if (!deactivated) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }

    // Revoke all active JWT sessions for this user
    await jwtService.revokeUserSessions(id);

    // Invalidate QR credential if the user is an IT_Rep
    if (user.role === 'it_rep') {
      // Stub: full QR invalidation + re-issuance is in task 13.
      // For now, mark existing credentials as invalid.
      await qrCredentialRepository.invalidateByUserId(id);
    }

    return deactivated;
  }

  /**
   * Fetches a single user by ID.
   * Requirements: 13.1, 13.2
   */
  async getUser(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }
    return user;
  }

  /**
   * Lists users scoped by the requesting user's role:
   * - Super_Admin: sees all users across all organizations
   * - Org_Admin: sees only users within their own organization
   * Requirements: 13.1, 13.2, 13.6
   */
  async listUsers(requestingUser: JwtPayload): Promise<User[]> {
    if (requestingUser.role === 'super_admin') {
      return userRepository.findAll(undefined, false);
    }

    // Org_Admin and all other roles: scoped to their own org
    return userRepository.findAll(requestingUser.orgId, false);
  }

  /**
   * Replaces a user's permission set with the given permission names.
   * The new set must be a subset of the user's organization's Org_Permission_Set.
   * Rejects with 400 if any permission is not in the org set.
   * Requirements: 13.7, 13.8
   */
  async setUserPermissions(userId: string, permissionNames: string[]): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${userId} not found`);
    }

    // Fetch the org's permission set
    const orgPermissions = await organizationRepository.getOrgPermissions(user.orgId);
    const orgPermissionNames = new Set(orgPermissions.map((p) => p.name));

    // Validate: every requested permission must be in the org's set
    const invalidPermissions = permissionNames.filter((name) => !orgPermissionNames.has(name));
    if (invalidPermissions.length > 0) {
      throw new AppError(
        400,
        'PERMISSIONS_NOT_IN_ORG_SET',
        `The following permissions are not in the organization's permission set: ${invalidPermissions.join(', ')}`,
      );
    }

    // Resolve permission names → IDs
    const { getDb } = await import('../db/index');
    const { permissions } = await import('../db/schema');
    const db = getDb();

    const allPermissions = await db.select().from(permissions);
    const nameToId = new Map(allPermissions.map((p) => [p.name, p.id]));

    // Validate all names exist in the system
    const unknownNames = permissionNames.filter((name) => !nameToId.has(name));
    if (unknownNames.length > 0) {
      throw new AppError(
        400,
        'UNKNOWN_PERMISSIONS',
        `Unknown permission names: ${unknownNames.join(', ')}`,
      );
    }

    const permissionIds = permissionNames
      .map((name) => nameToId.get(name)!)
      .filter((id) => id !== undefined);

    await userRepository.setUserPermissions(userId, permissionIds);
  }

  /**
   * Returns the current permission names for a user.
   * Requirements: 13.7
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${userId} not found`);
    }

    const perms = await userRepository.getUserPermissions(userId);
    return perms.map((p) => p.name);
  }

  /**
   * Returns the effective permissions for a user — the intersection of the
   * user's permission set and their organization's permission set.
   * Requirements: 13.7, 13.8, 18.5
   */
  async getEffectivePermissions(userId: string): Promise<string[]> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${userId} not found`);
    }

    const [userPerms, orgPerms] = await Promise.all([
      userRepository.getUserPermissions(userId),
      organizationRepository.getOrgPermissions(user.orgId),
    ]);

    const orgPermissionNames = new Set(orgPerms.map((p) => p.name));
    return userPerms
      .map((p) => p.name)
      .filter((name) => orgPermissionNames.has(name));
  }
}

export const userService = new UserService();
export default UserService;
