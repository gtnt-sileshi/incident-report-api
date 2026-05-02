import { Device, User } from '../db/schema';
import { DeviceRepository, deviceRepository } from '../devices/device.repository';
import { AppError } from '../middleware/errorHandler';
import { jwtService } from './jwt.service';

export class DeviceService {
  constructor(private readonly deviceRepo: DeviceRepository = deviceRepository) {}

  /**
   * Looks up a device by its hardware deviceId.
   * Throws AppError(403, 'DEVICE_NOT_AUTHORIZED') if not found or not active.
   */
  async verifyDevice(deviceId: string): Promise<Device> {
    const device = await this.deviceRepo.findByDeviceId(deviceId);

    if (!device || !device.isActive) {
      throw new AppError(
        403,
        'DEVICE_NOT_AUTHORIZED',
        'This device is not authorized',
      );
    }

    return device;
  }

  /**
   * Issues a device-scoped JWT for the given device + user pair.
   */
  issueDeviceToken(device: Device, user: User): string {
    return jwtService.issueToken({
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      orgId: user.orgId,
      deviceId: device.deviceId,
      type: 'device',
    });
  }
}

export const deviceService = new DeviceService();
export default DeviceService;
