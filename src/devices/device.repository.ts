import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index';
import { devices, Device, NewDevice } from '../db/schema';

export class DeviceRepository {
  private get db() {
    return getDb();
  }

  async findAll(options: { includeInactive?: boolean; limit?: number; offset?: number } = {}): Promise<{ devices: Device[]; total: number }> {
    const { includeInactive = false, limit = 10, offset = 0 } = options;
    
    const baseQuery = this.db.select().from(devices);
    const countQuery = this.db.select({ count: sql<number>`count(*)::int` }).from(devices);

    const conditions = [];
    if (!includeInactive) {
      conditions.push(eq(devices.isActive, true));
    }

    let finalQuery: any;
    let finalCountQuery: any;

    if (conditions.length === 0) {
      finalQuery = baseQuery;
      finalCountQuery = countQuery;
    } else if (conditions.length === 1) {
      finalQuery = baseQuery.where(conditions[0]);
      finalCountQuery = countQuery.where(conditions[0]);
    } else {
      finalQuery = baseQuery.where(and(...conditions));
      finalCountQuery = countQuery.where(and(...conditions));
    }

    const [rows, totalResult] = await Promise.all([
      finalQuery.limit(limit).offset(offset),
      finalCountQuery,
    ]);

    return {
      devices: rows,
      total: totalResult[0]?.count ?? 0,
    };
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

  async delete(id: string): Promise<void> {
    await this.db
      .delete(devices)
      .where(eq(devices.id, id));
  }
}

export const deviceRepository = new DeviceRepository();
export default DeviceRepository;
