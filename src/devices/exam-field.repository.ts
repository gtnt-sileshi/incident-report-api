import { eq } from 'drizzle-orm';
import { getDb } from '../db/index';
import { examFields, ExamField, NewExamField } from '../db/schema';

export class ExamFieldRepository {
  private get db() {
    return getDb();
  }

  async findAll(includeInactive = false): Promise<ExamField[]> {
    if (includeInactive) {
      return this.db.select().from(examFields);
    }
    return this.db
      .select()
      .from(examFields)
      .where(eq(examFields.isActive, true));
  }

  async findById(id: string): Promise<ExamField | null> {
    const rows = await this.db
      .select()
      .from(examFields)
      .where(eq(examFields.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewExamField): Promise<ExamField> {
    const rows = await this.db
      .insert(examFields)
      .values(data)
      .returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewExamField>): Promise<ExamField | null> {
    const rows = await this.db
      .update(examFields)
      .set(data)
      .where(eq(examFields.id, id))
      .returning();
    return rows[0] ?? null;
  }
}

export const examFieldRepository = new ExamFieldRepository();
export default ExamFieldRepository;
