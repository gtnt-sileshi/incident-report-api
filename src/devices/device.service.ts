import { eq } from 'drizzle-orm';
import { deviceRepository } from './device.repository';
import { AppError } from '../middleware/errorHandler';
import { Device, NewDevice } from '../db/schema';
import { getDb } from '../db/index';
import { users } from '../db/schema';
import { auditLogRepository } from '../audit/audit-log.repository';

export interface RegisterDeviceData {
  deviceId: string;
  userId?: string;
  deviceName?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  installationId?: string;
  publicKey?: string;
  isActive?: boolean;
}

export interface DeviceWithUser {
  id: string;
  deviceId: string;
  userId: string | null;
  isActive: boolean;
  registeredAt: Date;
  lastSeenAt: Date | null;
  deviceName?: string | null;
  model?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  installationId?: string | null;
  isApproved: boolean;
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
      deviceName: data.deviceName ?? null,
      model: data.model ?? null,
      osVersion: data.osVersion ?? null,
      appVersion: data.appVersion ?? null,
      installationId: data.installationId ?? null,
      publicKey: data.publicKey ?? null,
      isActive: data.isActive ?? true,
    };

    const device = await deviceRepository.register(newDevice);

    await auditLogRepository.append({
      actorUserId: data.userId || 'SYSTEM',
      actorRole: 'DEVICE_MANAGER',
      actionType: 'DEVICE_REGISTERED',
      deviceId: device.deviceId,
      details: `Terminal registered: ${device.model || 'Unknown Model'} (ID: ${device.deviceId})`,
    } as any);

    return device;
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

    await auditLogRepository.append({
      actorUserId: deactivated.userId || 'SYSTEM',
      actorRole: 'SECURITY_ADMIN',
      actionType: 'DEVICE_DEACTIVATED',
      deviceId: deactivated.deviceId,
      details: `Terminal access revoked for ID: ${deactivated.deviceId}`,
    } as any);

    return deactivated;
  }

  async toggleDeviceStatus(id: string): Promise<Device> {
    const device = await deviceRepository.findById(id);
    if (!device) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${id} not found`);
    }

    const updated = await deviceRepository.update(id, { isActive: !device.isActive });
    if (!updated) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${id} not found`);
    }

    await auditLogRepository.append({
      actorUserId: updated.userId || 'SYSTEM',
      actorRole: 'SECURITY_ADMIN',
      actionType: updated.isActive ? 'DEVICE_ACTIVATED' : 'DEVICE_DEACTIVATED',
      deviceId: updated.deviceId,
      details: `Terminal access ${updated.isActive ? 'restored' : 'revoked'} for ID: ${updated.deviceId}`,
    } as any);

    return updated;
  }

  async listDevices(includeInactive = true): Promise<DeviceWithUser[]> {
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
          deviceName: device.deviceName,
          model: device.model,
          osVersion: device.osVersion,
          appVersion: device.appVersion,
          installationId: device.installationId,
          isApproved: device.isApproved,
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
      deviceName: device.deviceName,
      model: device.model,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      installationId: device.installationId,
      isApproved: device.isApproved,
      user,
    };
  }
}

export const deviceService = new DeviceService();
export default DeviceService;
