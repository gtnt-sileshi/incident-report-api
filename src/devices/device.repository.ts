import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/index';
import { devices, Device, NewDevice } from '../db/schema';

export class DeviceRepository {
  private get db() {
    return getDb();
  }

  async findAll(includeInactive = false): Promise<Device[]> {
    if (includeInactive) {
      return this.db.select().from(devices);
    }
    return this.db
      .select()
      .from(devices)
      .where(eq(devices.isActive, true));
  }

  async findById(id: string): Promise<Device | null> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByDeviceId(deviceId: string): Promise<Device | null> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(eq(devices.deviceId, deviceId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<Device | null> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(eq(devices.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async register(data: NewDevice): Promise<Device> {
    const rows = await this.db
      .insert(devices)
      .values(data)
      .returning();
    return rows[0];
  }

  async deactivate(id: string): Promise<Device | null> {
    const rows = await this.db
      .update(devices)
      .set({ isActive: false })
      .where(eq(devices.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async update(id: string, data: Partial<NewDevice>): Promise<Device | null> {
    const rows = await this.db
      .update(devices)
      .set(data)
      .where(eq(devices.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.db
      .update(devices)
      .set({ lastSeenAt: sql`NOW()` })
      .where(eq(devices.id, id));
  }
}

export const deviceRepository = new DeviceRepository();
export default DeviceRepository;
