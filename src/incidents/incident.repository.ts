import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  incidents,
  examFields,
  incidentTypes,
  organizations,
  users,
  Incident,
  NewIncident,
} from '../db/schema';

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

// Enriched incident with all related names resolved
export interface IncidentWithRelations extends Incident {
  examFieldName: string | null;
  incidentTypeName: string | null;
  reportedByName: string | null;
  assignedOrgName: string | null;
  assignedUserName: string | null;
}

export class IncidentRepository {
  private get db() {
    return getDb();
  }

  /**
   * Build WHERE conditions from filters.
   */
  private buildConditions(filters?: IncidentFilters): ReturnType<typeof eq>[] {
    const conditions: ReturnType<typeof eq>[] = [];
    if (!filters) return conditions;

    if (filters.status)          conditions.push(eq(incidents.status, filters.status));
    if (filters.priority)        conditions.push(eq(incidents.priority, filters.priority));
    if (filters.examFieldId)     conditions.push(eq(incidents.examFieldId, filters.examFieldId));
    if (filters.incidentTypeId)  conditions.push(eq(incidents.incidentTypeId, filters.incidentTypeId));
    if (filters.assignedOrgId)   conditions.push(eq(incidents.assignedOrgId, filters.assignedOrgId));
    if (filters.assignedUserId)  conditions.push(eq(incidents.assignedUserId, filters.assignedUserId));
    if (filters.reportedByUserId) conditions.push(eq(incidents.reportedByUserId, filters.reportedByUserId));
    if (filters.localId)         conditions.push(eq(incidents.localId, filters.localId));

    return conditions;
  }

  /**
   * Enrich a raw incident row with related names via individual lookups.
   * Using separate queries is simpler than complex LEFT JOINs with Drizzle
   * and avoids column name collisions.
   */
  private async enrich(incident: Incident): Promise<IncidentWithRelations> {
    const db = this.db;

    const [examField, incidentType, reporter, assignedOrg, assignedUser] = await Promise.all([
      incident.examFieldId
        ? db.select({ name: examFields.name }).from(examFields).where(eq(examFields.id, incident.examFieldId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.incidentTypeId
        ? db.select({ name: incidentTypes.name }).from(incidentTypes).where(eq(incidentTypes.id, incident.incidentTypeId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.reportedByUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, incident.reportedByUserId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.assignedOrgId
        ? db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, incident.assignedOrgId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.assignedUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, incident.assignedUserId)).limit(1).then(r => r[0] ?? null)
        : null,
    ]);

    return {
      ...incident,
      examFieldName:    examField?.name ?? null,
      incidentTypeName: incidentType?.name ?? null,
      reportedByName:   reporter?.name ?? null,
      assignedOrgName:  assignedOrg?.name ?? null,
      assignedUserName: assignedUser?.name ?? null,
    };
  }

  /**
   * Enrich multiple incidents in parallel (batched).
   */
  private async enrichAll(rows: Incident[]): Promise<IncidentWithRelations[]> {
    return Promise.all(rows.map((r) => this.enrich(r)));
  }

  async findAll(filters?: IncidentFilters): Promise<IncidentWithRelations[]> {
    const conditions = this.buildConditions(filters);

    let rows: Incident[];
    if (conditions.length === 0) {
      rows = await this.db.select().from(incidents);
    } else if (conditions.length === 1) {
      rows = await this.db.select().from(incidents).where(conditions[0]);
    } else {
      rows = await this.db.select().from(incidents).where(and(...conditions));
    }

    return this.enrichAll(rows);
  }

  async findById(id: string): Promise<IncidentWithRelations | null> {
    const rows = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!rows[0]) return null;
    return this.enrich(rows[0]);
  }

  async findByLocalId(localId: string): Promise<Incident | null> {
    const rows = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.localId, localId))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewIncident): Promise<IncidentWithRelations> {
    const rows = await this.db
      .insert(incidents)
      .values(data)
      .returning();
    return this.enrich(rows[0]);
  }

  async updateStatus(id: string, status: string, updatedAt?: Date): Promise<IncidentWithRelations | null> {
    const rows = await this.db
      .update(incidents)
      .set({ status, updatedAt: updatedAt ?? new Date() })
      .where(eq(incidents.id, id))
      .returning();
    if (!rows[0]) return null;
    return this.enrich(rows[0]);
  }

  async updateAssignment(
    id: string,
    assignedOrgId: string | null,
    assignedUserId: string | null,
  ): Promise<IncidentWithRelations | null> {
    const rows = await this.db
      .update(incidents)
      .set({ assignedOrgId, assignedUserId, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();
    if (!rows[0]) return null;
    return this.enrich(rows[0]);
  }

  async resolve(id: string, resolutionSummary: string): Promise<IncidentWithRelations | null> {
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
    if (!rows[0]) return null;
    return this.enrich(rows[0]);
  }

  async findInProgressBeyondThreshold(
    priorityMinutesMap: Record<string, number>,
  ): Promise<Incident[]> {
    const entries = Object.entries(priorityMinutesMap);
    if (entries.length === 0) return [];

    const caseExpr = entries
      .map(([priority, minutes]) => `WHEN '${priority}' THEN ${minutes}`)
      .join(' ');

    return this.db
      .select()
      .from(incidents)
      .where(
        sql`${incidents.status} = 'In-Progress'
          AND EXTRACT(EPOCH FROM (NOW() - ${incidents.createdAt})) / 60
            > CASE ${incidents.priority} ${sql.raw(caseExpr)} END`,
      );
  }
}

export const incidentRepository = new IncidentRepository();
export default IncidentRepository;
