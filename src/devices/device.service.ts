import { eq } from 'drizzle-orm';
import { deviceRepository } from './device.repository';
import { AppError } from '../middleware/errorHandler';
import { Device, NewDevice } from '../db/schema';
import { getDb } from '../db/index';
import { users, examCenterAssignments, examFields } from '../db/schema';

export interface RegisterDeviceData {
  deviceId: string;
  userId?: string;
  isActive?: boolean;
}

export interface DeviceWithAssignment {
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
  examFields?: Array<{
    id: string;
    name: string;
    location: string | null;
  }>;
}

export class DeviceService {
  private get db() {
    return getDb();
  }

  /**
   * Registers a new device, enforcing Device_ID uniqueness.
   * If a userId is provided, links the device to that user.
   * Requirements: 3.1, 13.4
   */
  async registerDevice(data: RegisterDeviceData): Promise<Device> {
    // Enforce Device_ID uniqueness
    const existing = await deviceRepository.findByDeviceId(data.deviceId);
    if (existing) {
      throw new AppError(
        409,
        'DEVICE_ID_CONFLICT',
        `Device_ID "${data.deviceId}" is already registered`,
      );
    }

    // If linking to a user, ensure the user doesn't already have a device
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

  /**
   * Deactivates a device by setting is_active = false.
   * Requirements: 3.7
   */
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

  /**
   * Lists all devices with their associated user and exam field assignment info.
   * Requirements: 3.8
   */
  async listDevices(includeInactive = false): Promise<DeviceWithAssignment[]> {
    const allDevices = await deviceRepository.findAll(includeInactive);

    // Enrich each device with user info and exam field assignments
    const enriched = await Promise.all(
      allDevices.map(async (device) => {
        let user: DeviceWithAssignment['user'] = null;
        let assignedExamFields: DeviceWithAssignment['examFields'] = [];

        if (device.userId) {
          // Fetch user info
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

          // Fetch exam field assignments for this user
          const assignmentRows = await this.db
            .select({
              id: examFields.id,
              name: examFields.name,
              location: examFields.location,
            })
            .from(examCenterAssignments)
            .innerJoin(examFields, eq(examCenterAssignments.examFieldId, examFields.id))
            .where(eq(examCenterAssignments.userId, device.userId));

          assignedExamFields = assignmentRows;
        }

        return {
          id: device.id,
          deviceId: device.deviceId,
          userId: device.userId,
          isActive: device.isActive,
          registeredAt: device.registeredAt,
          lastSeenAt: device.lastSeenAt,
          user,
          examFields: assignedExamFields,
        };
      }),
    );

    return enriched;
  }

  /**
   * Fetches a single device by its primary key UUID.
   * Requirements: 3.8
   */
  async getDevice(id: string): Promise<DeviceWithAssignment> {
    const device = await deviceRepository.findById(id);
    if (!device) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${id} not found`);
    }

    let user: DeviceWithAssignment['user'] = null;
    let assignedExamFields: DeviceWithAssignment['examFields'] = [];

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

      const assignmentRows = await this.db
        .select({
          id: examFields.id,
          name: examFields.name,
          location: examFields.location,
        })
        .from(examCenterAssignments)
        .innerJoin(examFields, eq(examCenterAssignments.examFieldId, examFields.id))
        .where(eq(examCenterAssignments.userId, device.userId));

      assignedExamFields = assignmentRows;
    }

    return {
      id: device.id,
      deviceId: device.deviceId,
      userId: device.userId,
      isActive: device.isActive,
      registeredAt: device.registeredAt,
      lastSeenAt: device.lastSeenAt,
      user,
      examFields: assignedExamFields,
    };
  }
}

export const deviceService = new DeviceService();
export default DeviceService;
