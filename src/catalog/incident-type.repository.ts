import { eq, count } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  incidentTypes,
  incidents,
  issueCategories,
  IncidentType,
  NewIncidentType,
  IssueCategory,
} from '../db/schema';

export class IncidentTypeRepository {
  private get db() {
    return getDb();
  }

  async findAll(includeInactive = false): Promise<any[]> {
    const query = this.db
      .select({
        id: incidentTypes.id,
        name: incidentTypes.name,
        description: incidentTypes.description,
        defaultPriority: incidentTypes.defaultPriority,
        isActive: incidentTypes.isActive,
        categoryId: incidentTypes.categoryId,
        categoryName: issueCategories.name,
      })
      .from(incidentTypes)
      .leftJoin(issueCategories, eq(incidentTypes.categoryId, issueCategories.id));

    if (!includeInactive) {
      return query.where(eq(incidentTypes.isActive, true));
    }
    return query;
  }

  async findById(id: string): Promise<IncidentType | null> {
    const rows = await this.db
      .select()
      .from(incidentTypes)
      .where(eq(incidentTypes.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<IncidentType | null> {
    const rows = await this.db
      .select()
      .from(incidentTypes)
      .where(eq(incidentTypes.name, name))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewIncidentType): Promise<IncidentType> {
    const rows = await this.db
      .insert(incidentTypes)
      .values(data)
      .returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewIncidentType>): Promise<IncidentType | null> {
    const rows = await this.db
      .update(incidentTypes)
      .set(data)
      .where(eq(incidentTypes.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async setActive(id: string, isActive: boolean): Promise<IncidentType | null> {
    const rows = await this.db
      .update(incidentTypes)
      .set({ isActive })
      .where(eq(incidentTypes.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async countReferences(id: string): Promise<{ incidents: number }> {
    const [incidentCount] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(incidents)
        .where(eq(incidents.incidentTypeId, id)),
    ]);

    return {
      incidents: incidentCount[0]?.value ?? 0,
    };
  }

  async listCategories(): Promise<IssueCategory[]> {
    return this.db.select().from(issueCategories).orderBy(issueCategories.name);
  }
}

export const incidentTypeRepository = new IncidentTypeRepository();
export default IncidentTypeRepository;
