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
  async createUser(data: CreateUserData): Promise<User> {
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
      actorUserId: user.id,
      actorRole: user.role,
      actionType: 'USER_CREATED',
      details: `User ${user.name} was registered with role ${user.role}`,
    } as any);

    return user;

    return user;
  }

  async updateUser(id: string, data: UpdateUserData): Promise<User> {
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
      actorUserId: id,
      actorRole: updated.role,
      actionType: 'USER_UPDATED',
      details: `User profile modified. Fields: ${Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined).join(', ')}`,
    } as any);

    // Device update via profile is now optional/removed as binding is handled on login.

    return updated;
  }

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

    await jwtService.revokeUserSessions(id);

    if (user.role === 'it_rep') {
      await qrCredentialRepository.invalidateByUserId(id);
    }

    await auditLogRepository.append({
      actorUserId: id,
      actorRole: user.role,
      actionType: 'USER_DEACTIVATED',
      details: `User account suspended`,
    } as any);

    return deactivated;
  }

  async getUser(id: string): Promise<UserWithDevice> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', `User ${id} not found`);
    }
    return this.attachDevice(user);
  }

  async listUsersByRegion(regionId: string): Promise<UserWithDevice[]> {
    const userList = await userRepository.findAll(regionId, false);
    return Promise.all(userList.map((u) => this.attachDevice(u)));
  }

  async listUsers(requestingUser: JwtPayload): Promise<UserWithDevice[]> {
    let userList: User[];
    if (requestingUser.role === 'super_admin' || requestingUser.role === 'national_command') {
      userList = await userRepository.findAll(undefined, false);
    } else {
      userList = await userRepository.findAll(requestingUser.regionId, false);
    }
    return Promise.all(userList.map((u) => this.attachDevice(u)));
  }

  private async attachDevice(user: User): Promise<UserWithDevice> {
    const device = await deviceRepository.findByUserId(user.id);
    const { passwordHash: _omit, ...safeUser } = user;
    return {
      ...safeUser,
      device: device
        ? {
            id: device.id,
            deviceId: device.deviceId,
            isActive: device.isActive,
            registeredAt: device.registeredAt,
            lastSeenAt: device.lastSeenAt,
          }
        : null,
    };
  }
}

export const userService = new UserService();
export default UserService;
