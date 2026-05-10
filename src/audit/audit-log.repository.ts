import { eq, and, gte, lte, desc, count as drizzleCount } from 'drizzle-orm';
import { getDb } from '../db/index';
import { auditLog, AuditLogEntry, NewAuditLogEntry } from '../db/schema';

export interface AuditLogFilters {
  incidentId?: string;
  actorUserId?: string;
  deviceId?: string;
  actionType?: string;
  fromDate?: Date;
  toDate?: Date;
}

export class AuditLogRepository {
  private get db() {
    return getDb();
  }

  async append(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
    const rows = await this.db
      .insert(auditLog)
      .values(entry)
      .returning();
    return rows[0];
  }

  async findByIncident(incidentId: string): Promise<AuditLogEntry[]> {
    return this.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.incidentId, incidentId))
      .orderBy(desc(auditLog.occurredAt));
  }

  async count(filters: AuditLogFilters = {}): Promise<number> {
    const conditions = [];
    if (filters.incidentId)  conditions.push(eq(auditLog.incidentId, filters.incidentId));
    if (filters.actorUserId) conditions.push(eq(auditLog.actorUserId, filters.actorUserId));
    if (filters.deviceId)    conditions.push(eq(auditLog.deviceId, filters.deviceId));
    if (filters.actionType)  conditions.push(eq(auditLog.actionType, filters.actionType));
    if (filters.fromDate)    conditions.push(gte(auditLog.occurredAt, filters.fromDate));
    if (filters.toDate)      conditions.push(lte(auditLog.occurredAt, filters.toDate));

    const query = this.db.select({ count: drizzleCount() }).from(auditLog);
    const result = conditions.length === 0
      ? await query
      : conditions.length === 1
        ? await query.where(conditions[0])
        : await query.where(and(...conditions));

    return Number(result[0]?.count ?? 0);
  }

  async search(
    filters: AuditLogFilters,
    limit = 100,
    offset = 0,
  ): Promise<AuditLogEntry[]> {
    const conditions = [];

    if (filters.incidentId) {
      conditions.push(eq(auditLog.incidentId, filters.incidentId));
    }
    if (filters.actorUserId) {
      conditions.push(eq(auditLog.actorUserId, filters.actorUserId));
    }
    if (filters.deviceId) {
      conditions.push(eq(auditLog.deviceId, filters.deviceId));
    }
    if (filters.actionType) {
      conditions.push(eq(auditLog.actionType, filters.actionType));
    }
    if (filters.fromDate) {
      conditions.push(gte(auditLog.occurredAt, filters.fromDate));
    }
    if (filters.toDate) {
      conditions.push(lte(auditLog.occurredAt, filters.toDate));
    }

    const query = this.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.occurredAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length === 0) {
      return query;
    }
    if (conditions.length === 1) {
      return query.where(conditions[0]);
    }
    return query.where(and(...conditions));
  }
}

export const auditLogRepository = new AuditLogRepository();
export default AuditLogRepository;
