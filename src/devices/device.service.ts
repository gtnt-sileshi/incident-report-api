import { eq } from 'drizzle-orm';
import { deviceRepository } from './device.repository';
import { AppError } from '../middleware/errorHandler';
import { Device, NewDevice } from '../db/schema';
import { getDb } from '../db/index';
import { users } from '../db/schema';

export interface RegisterDeviceData {
  deviceId: string;
  userId?: string;
  isActive?: boolean;
}

export interface DeviceWithUser {
  id: string;
  deviceId: string;
  userId: string | null;
  isActive: boolean;
  registeredAt: Date;
  lastSeenAt: Date | null;
  user?: {
    id: string;
    name: string;
    email: string | null;
    role: string;
  } | null;
}

export class DeviceService {
  private get db() {
    return getDb();
  }

  async registerDevice(data: RegisterDeviceData): Promise<Device> {
    const existing = await deviceRepository.findByDeviceId(data.deviceId);
    if (existing) {
      throw new AppError(
        409,
        'DEVICE_ID_CONFLICT',
        `Device_ID "${data.deviceId}" is already registered`,
      );
    }

    if (data.userId) {
      const existingForUser = await deviceRepository.findByUserId(data.userId);
      if (existingForUser) {
        throw new AppError(
          409,
          'USER_DEVICE_CONFLICT',
          `User ${data.userId} already has a registered device`,
        );
      }
    }

    const newDevice: NewDevice = {
      deviceId: data.deviceId,
      userId: data.userId ?? null,
      isActive: data.isActive ?? true,
    };

    return deviceRepository.register(newDevice);
  }

  async deactivateDevice(id: string): Promise<Device> {
    const device = await deviceRepository.findById(id);
    if (!device) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${id} not found`);
    }

    if (!device.isActive) {
      throw new AppError(409, 'DEVICE_ALREADY_INACTIVE', `Device ${id} is already inactive`);
    }

    const deactivated = await deviceRepository.deactivate(id);
    if (!deactivated) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${id} not found`);
    }

    return deactivated;
  }

  async listDevices(includeInactive = false): Promise<DeviceWithUser[]> {
    const allDevices = await deviceRepository.findAll(includeInactive);

    const enriched = await Promise.all(
      allDevices.map(async (device) => {
        let user: DeviceWithUser['user'] = null;

        if (device.userId) {
          const userRows = await this.db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
            })
            .from(users)
            .where(eq(users.id, device.userId))
            .limit(1);

          user = userRows[0] ?? null;
        }

        return {
          id: device.id,
          deviceId: device.deviceId,
          userId: device.userId,
          isActive: device.isActive,
          registeredAt: device.registeredAt,
          lastSeenAt: device.lastSeenAt,
          user,
        };
      }),
    );

    return enriched;
  }

  async getDevice(id: string): Promise<DeviceWithUser> {
    const device = await deviceRepository.findById(id);
    if (!device) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${id} not found`);
    }

    let user: DeviceWithUser['user'] = null;

    if (device.userId) {
      const userRows = await this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, device.userId))
        .limit(1);

      user = userRows[0] ?? null;
    }

    return {
      id: device.id,
      deviceId: device.deviceId,
      userId: device.userId,
      isActive: device.isActive,
      registeredAt: device.registeredAt,
      lastSeenAt: device.lastSeenAt,
      user,
    };
  }
}

export const deviceService = new DeviceService();
export default DeviceService;
