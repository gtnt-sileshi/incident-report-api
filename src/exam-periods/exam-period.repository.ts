import { eq } from 'drizzle-orm';
import { getDb, withTransaction } from '../db';
import { examPeriods, NewExamPeriod } from '../db/schema';

export const examPeriodRepository = {
  async findAll() {
    const db = getDb();
    return db.select().from(examPeriods);
  },

  async findById(id: string) {
    const db = getDb();
    const [period] = await db.select().from(examPeriods).where(eq(examPeriods.id, id));
    return period ?? null;
  },

  async findActive() {
    const db = getDb();
    const [period] = await db.select().from(examPeriods).where(eq(examPeriods.isActive, true));
    return period ?? null;
  },

  async create(data: NewExamPeriod) {
    const db = getDb();
    const [period] = await db.insert(examPeriods).values(data).returning();
    return period;
  },

  async update(id: string, data: Partial<NewExamPeriod>) {
    const db = getDb();
    const [period] = await db
      .update(examPeriods)
      .set(data)
      .where(eq(examPeriods.id, id))
      .returning();
    return period ?? null;
  },

  async delete(id: string) {
    const db = getDb();
    await db.delete(examPeriods).where(eq(examPeriods.id, id));
  },

  /**
   * Activates a single exam period within a transaction:
   * 1. Set all exam periods isActive = false
   * 2. Set the target exam period isActive = true
   */
  async activate(id: string) {
    return withTransaction(async (client) => {
      await client.query('UPDATE exam_periods SET is_active = false');
      const result = await client.query<{
        id: string;
        name: string;
        start_date: Date;
        end_date: Date;
        is_active: boolean;
      }>(
        'UPDATE exam_periods SET is_active = true WHERE id = $1 RETURNING *',
        [id],
      );
      return result.rows[0] ?? null;
    });
  },

  async deactivate(id: string) {
    const db = getDb();
    const [period] = await db
      .update(examPeriods)
      .set({ isActive: false })
      .where(eq(examPeriods.id, id))
      .returning();
    return period ?? null;
  },
};
