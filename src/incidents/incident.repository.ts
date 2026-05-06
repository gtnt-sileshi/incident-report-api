import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  incidents,
  examCenters,
  examRooms,
  incidentTypes,
  regions,
  users,
  Incident,
  NewIncident,
} from '../db/schema';

export interface IncidentFilters {
  status?: string;
  priority?: string;
  regionId?: string;
  examCenterId?: string;
  examRoomId?: string;
  incidentTypeId?: string;
  assignedUserId?: string;
  reportedByUserId?: string;
  localId?: string;
}

export interface IncidentWithRelations extends Incident {
  regionName: string | null;
  examCenterName: string | null;
  examRoomName: string | null;
  incidentTypeName: string | null;
  reportedByName: string | null;
  assignedUserName: string | null;
}

export class IncidentRepository {
  private get db() {
    return getDb();
  }

  private buildConditions(filters?: IncidentFilters): ReturnType<typeof eq>[] {
    const conditions: ReturnType<typeof eq>[] = [];
    if (!filters) return conditions;

    if (filters.status)          conditions.push(eq(incidents.status, filters.status));
    if (filters.priority)        conditions.push(eq(incidents.priority, filters.priority));
    if (filters.regionId)        conditions.push(eq(incidents.regionId, filters.regionId));
    if (filters.examCenterId)    conditions.push(eq(incidents.examCenterId, filters.examCenterId));
    if (filters.examRoomId)      conditions.push(eq(incidents.examRoomId, filters.examRoomId));
    if (filters.incidentTypeId)  conditions.push(eq(incidents.incidentTypeId, filters.incidentTypeId));
    if (filters.assignedUserId)  conditions.push(eq(incidents.assignedUserId, filters.assignedUserId));
    if (filters.reportedByUserId) conditions.push(eq(incidents.reportedByUserId, filters.reportedByUserId));
    if (filters.localId)         conditions.push(eq(incidents.localId, filters.localId));

    return conditions;
  }

  private async enrich(incident: Incident): Promise<IncidentWithRelations> {
    const db = this.db;

    const [region, examCenter, examRoom, incidentType, reporter, assignedUser] = await Promise.all([
      incident.regionId
        ? db.select({ name: regions.name }).from(regions).where(eq(regions.id, incident.regionId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.examCenterId
        ? db.select({ name: examCenters.name }).from(examCenters).where(eq(examCenters.id, incident.examCenterId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.examRoomId
        ? db.select({ name: examRooms.name }).from(examRooms).where(eq(examRooms.id, incident.examRoomId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.incidentTypeId
        ? db.select({ name: incidentTypes.name }).from(incidentTypes).where(eq(incidentTypes.id, incident.incidentTypeId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.reportedByUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, incident.reportedByUserId)).limit(1).then(r => r[0] ?? null)
        : null,
      incident.assignedUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, incident.assignedUserId)).limit(1).then(r => r[0] ?? null)
        : null,
    ]);

    return {
      ...incident,
      regionName:       region?.name ?? null,
      examCenterName:   examCenter?.name ?? null,
      examRoomName:     examRoom?.name ?? null,
      incidentTypeName: incidentType?.name ?? null,
      reportedByName:   reporter?.name ?? null,
      assignedUserName: assignedUser?.name ?? null,
    };
  }

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
    assignedUserId: string | null,
  ): Promise<IncidentWithRelations | null> {
    const rows = await this.db
      .update(incidents)
      .set({ assignedUserId, updatedAt: new Date() })
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
