import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index';
import { incidents, Incident, NewIncident } from '../db/schema';

export interface IncidentFilters {
  status?: string;
  priority?: string;
  examFieldId?: string;
  incidentTypeId?: string;
  assignedOrgId?: string;
  assignedUserId?: string;
  reportedByUserId?: string;
  localId?: string;
}

export class IncidentRepository {
  private get db() {
    return getDb();
  }

  async findAll(filters?: IncidentFilters): Promise<Incident[]> {
    if (!filters || Object.keys(filters).length === 0) {
      return this.db.select().from(incidents);
    }

    const conditions = [];

    if (filters.status) {
      conditions.push(eq(incidents.status, filters.status));
    }
    if (filters.priority) {
      conditions.push(eq(incidents.priority, filters.priority));
    }
    if (filters.examFieldId) {
      conditions.push(eq(incidents.examFieldId, filters.examFieldId));
    }
    if (filters.incidentTypeId) {
      conditions.push(eq(incidents.incidentTypeId, filters.incidentTypeId));
    }
    if (filters.assignedOrgId) {
      conditions.push(eq(incidents.assignedOrgId, filters.assignedOrgId));
    }
    if (filters.assignedUserId) {
      conditions.push(eq(incidents.assignedUserId, filters.assignedUserId));
    }
    if (filters.reportedByUserId) {
      conditions.push(eq(incidents.reportedByUserId, filters.reportedByUserId));
    }
    if (filters.localId) {
      conditions.push(eq(incidents.localId, filters.localId));
    }

    if (conditions.length === 0) {
      return this.db.select().from(incidents);
    }
    if (conditions.length === 1) {
      return this.db.select().from(incidents).where(conditions[0]);
    }
    return this.db.select().from(incidents).where(and(...conditions));
  }

  async findById(id: string): Promise<Incident | null> {
    const rows = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByLocalId(localId: string): Promise<Incident | null> {
    const rows = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.localId, localId))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewIncident): Promise<Incident> {
    const rows = await this.db
      .insert(incidents)
      .values(data)
      .returning();
    return rows[0];
  }

  async updateStatus(id: string, status: string, updatedAt?: Date): Promise<Incident | null> {
    const rows = await this.db
      .update(incidents)
      .set({ status, updatedAt: updatedAt ?? new Date() })
      .where(eq(incidents.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async updateAssignment(
    id: string,
    assignedOrgId: string | null,
    assignedUserId: string | null,
  ): Promise<Incident | null> {
    const rows = await this.db
      .update(incidents)
      .set({ assignedOrgId, assignedUserId, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async resolve(id: string, resolutionSummary: string): Promise<Incident | null> {
    const rows = await this.db
      .update(incidents)
      .set({
        status: 'Resolved',
        resolutionSummary,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, id))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Returns incidents where status = 'In-Progress' and the elapsed time since
   * creation exceeds the threshold defined for their priority.
   *
   * @param priorityMinutesMap - e.g. { High: 30, Medium: 90 }
   */
  async findInProgressBeyondThreshold(
    priorityMinutesMap: Record<string, number>,
  ): Promise<Incident[]> {
    const entries = Object.entries(priorityMinutesMap);
    if (entries.length === 0) return [];

    // Build a CASE expression: CASE priority WHEN 'High' THEN 30 WHEN 'Medium' THEN 90 END
    const caseExpr = entries
      .map(([priority, minutes]) => `WHEN '${priority}' THEN ${minutes}`)
      .join(' ');

    const rows = await this.db
      .select()
      .from(incidents)
      .where(
        sql`${incidents.status} = 'In-Progress'
          AND EXTRACT(EPOCH FROM (NOW() - ${incidents.createdAt})) / 60
            > CASE ${incidents.priority} ${sql.raw(caseExpr)} END`,
      );

    return rows;
  }
}

export const incidentRepository = new IncidentRepository();
export default IncidentRepository;
