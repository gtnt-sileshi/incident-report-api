import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  users,
  User,
  NewUser,
} from '../db/schema';

export class UserRepository {
  private get db() {
    return getDb();
  }

  async findAll(regionId?: string, includeInactive = false): Promise<User[]> {
    const conditions = [];

    if (regionId) {
      conditions.push(eq(users.regionId, regionId));
    }
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }

    if (conditions.length === 0) {
      return this.db.select().from(users);
    }
    if (conditions.length === 1) {
      return this.db.select().from(users).where(conditions[0]);
    }
    return this.db.select().from(users).where(and(...conditions));
  }

  async findAllByRole(role: string, includeInactive = false): Promise<User[]> {
    const conditions = [eq(users.role, role)];
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }
    return this.db.select().from(users).where(and(...conditions));
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values(data)
      .returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | null> {
    const rows = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async deactivate(id: string): Promise<User | null> {
    const rows = await this.db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }
}

export const userRepository = new UserRepository();
export default UserRepository;
