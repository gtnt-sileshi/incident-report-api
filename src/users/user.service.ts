import bcrypt from 'bcryptjs';
import { userRepository } from './user.repository';
import { deviceRepository } from '../devices/device.repository';
import { jwtService } from '../auth/jwt.service';
import { qrCredentialRepository } from '../qr/qr-credential.repository';
import { AppError } from '../middleware/errorHandler';
import { auditLogRepository } from '../audit/audit-log.repository';
import { User, NewUser, Device } from '../db/schema';
import { JwtPayload } from '../auth/jwt.service';

export interface CreateUserData {
  name: string;
  email?: string;
  password?: string;
  role: string;
  phoneNumber?: string;
  deviceId?: string; // required for IT_Rep role
  regionId?: string;
  examCenterId?: string;
  examRoomId?: string;
  powerClusterId?: string;
  internetClusterId?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  phoneNumber?: string;
  isActive?: boolean;
  regionId?: string;
  examCenterId?: string;
  examRoomId?: string;
  powerClusterId?: string;
  internetClusterId?: string;
  deviceId?: string;
}

export interface UserWithDevice extends Omit<User, 'passwordHash'> {
  device: Pick<Device, 'id' | 'deviceId' | 'isActive' | 'registeredAt' | 'lastSeenAt'> | null;
}

export class UserService {
  async createUser(data: CreateUserData, requestingUser?: JwtPayload): Promise<User> {
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing) {
        throw new AppError(409, 'EMAIL_CONFLICT', `A user with email "${data.email}" already exists`);
      }
    }

    // Device binding requirement removed during creation. 
    // It will be captured during first login on mobile app.

    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    const newUser: NewUser = {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      phoneNumber: data.phoneNumber,
      regionId: data.regionId,
      examCenterId: data.examCenterId,
      examRoomId: data.examRoomId,
      powerClusterId: data.powerClusterId,
      internetClusterId: data.internetClusterId,
      isActive: true,
    };

    const user = await userRepository.create(newUser);

    await auditLogRepository.append({
      actorUserId: requestingUser?.sub ?? user.id,
      actorRole: requestingUser?.role ?? user.role,
      actionType: 'USER_CREATED',
      details: `User ${user.name} (${user.email}) was created with role ${user.role} by ${requestingUser?.email ?? 'System'}`,
    });

    return user;

    return user;
  }

  async updateUser(id: string, data: UpdateUserData, requestingUser?: JwtPayload): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }

    if (data.email && data.email !== user.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) {
        throw new AppError(409, 'EMAIL_CONFLICT', `A user with email "${data.email}" already exists`);
      }
    }

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
      ...(data.regionId !== undefined && { regionId: data.regionId }),
      ...(data.examCenterId !== undefined && { examCenterId: data.examCenterId }),
      ...(data.examRoomId !== undefined && { examRoomId: data.examRoomId }),
      ...(data.powerClusterId !== undefined && { powerClusterId: data.powerClusterId }),
      ...(data.internetClusterId !== undefined && { internetClusterId: data.internetClusterId }),
    };

    const updated = await userRepository.update(id, updateData);
    if (!updated) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }

    await auditLogRepository.append({
      actorUserId: requestingUser?.sub ?? id,
      actorRole: requestingUser?.role ?? updated.role,
      actionType: 'USER_UPDATED',
      details: `User profile (${updated.name}) modified by ${requestingUser?.email ?? 'System'}. Fields: ${Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined).join(', ')}`,
    });

    // Device update via profile is now optional/removed as binding is handled on login.

    return updated;
  }

  async deactivateUser(id: string, requestingUser?: JwtPayload): Promise<User> {
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

    await jwtService.revokeUserSessions(id);

    if (user.role === 'it_rep') {
      await qrCredentialRepository.invalidateByUserId(id);
    }

    await auditLogRepository.append({
      actorUserId: requestingUser?.sub ?? id,
      actorRole: requestingUser?.role ?? user.role,
      actionType: 'USER_DEACTIVATED',
      details: `User account (${user.name}) suspended by ${requestingUser?.email ?? 'System'}`,
    });

    return deactivated;
  }

  async getUser(id: string): Promise<UserWithDevice> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }
    return this.enrichWithDevice(user);
  }

  async listUsersByRegion(regionId: string, limit = 10, offset = 0): Promise<{ users: UserWithDevice[]; total: number }> {
    const { users, total } = await userRepository.findAll({ regionId, limit, offset });
    const enriched = await Promise.all(users.map(u => this.enrichWithDevice(u)));
    return { users: enriched, total };
  }

  async listUsers(requestingUser: JwtPayload, limit = 10, offset = 0): Promise<{ users: UserWithDevice[]; total: number }> {
    // Basic scoping: non-admins only see users in their same region
    const regionId = (requestingUser.role !== 'super_admin' && requestingUser.role !== 'national_command') 
      ? (requestingUser.regionId ?? undefined)
      : undefined;

    const { users, total } = await userRepository.findAll({ regionId, limit, offset });
    const enriched = await Promise.all(users.map(u => this.enrichWithDevice(u)));
    return { users: enriched, total };
  }

  private async enrichWithDevice(user: User): Promise<UserWithDevice> {
    const device = await deviceRepository.findByUserId(user.id);
    const { passwordHash, ...userWithoutPassword } = user as any;
    return {
      ...userWithoutPassword,
      device: device ? {
        id: device.id,
        deviceId: device.deviceId,
        isActive: device.isActive,
        registeredAt: device.registeredAt,
        lastSeenAt: device.lastSeenAt,
      } : null
    };
  }
}

export const userService = new UserService();
export default UserService;
