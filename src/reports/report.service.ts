import { getDb } from '../db/index';
import { incidents, incidentTypes, examCenters, regions } from '../db/schema';
import { eq, and, gte, lte, sql, isNotNull } from 'drizzle-orm';

/**
 * Report filters for generating incident reports
 */
export interface ReportFilters {
  examCycle?: string;
  startDate?: Date;
  endDate?: Date;
  regionId?: string;
  examCenterId?: string;
  incidentTypeId?: string;
  assignedUserId?: string;
}

/**
 * Aggregated incident metrics per type and region
 */
export interface IncidentMetrics {
  incidentTypeId: string;
  incidentTypeName: string;
  regionId: string | null;
  regionName: string | null;
  totalIncidents: number;
  resolvedIncidents: number;
  avgTimeToResolveMinutes: number | null;
  resolvedWithinThreshold: number;
  percentResolvedWithinThreshold: number;
}

/**
 * Disruption metrics per exam center
 */
export interface DisruptionMetrics {
  examCenterId: string | null;
  examCenterName: string;
  totalIncidents: number;
  avgDisruptionMinutes: number | null;
  highPriorityCount: number;
}

/**
 * Post-cycle summary data
 */
export interface PostCycleSummary {
  avgResolutionTimeMinutes: number | null;
  incidentsPerCenter: Array<{
    examCenterId: string | null;
    examCenterName: string;
    incidentCount: number;
  }>;
  recurringProblems: Array<{
    incidentTypeId: string;
    incidentTypeName: string;
    examCenterId: string | null;
    examCenterName: string;
    frequency: number;
  }>;
}

/**
 * Complete report data structure
 */
export interface ReportData {
  generatedAt: Date;
  filters: ReportFilters;
  metrics: IncidentMetrics[];
  disruption: DisruptionMetrics[];
  summary: {
    totalIncidents: number;
    resolvedIncidents: number;
    avgResolutionTimeMinutes: number | null;
    highPriorityCount: number;
  };
}

export class ReportService {
  private get db() {
    return getDb();
  }

  async generateIncidentReport(filters: ReportFilters = {}): Promise<ReportData> {
    const [metrics, disruption, summary] = await Promise.all([
      this.getIncidentMetrics(filters),
      this.getDisruptionMetrics(filters),
      this.getSummaryMetrics(filters),
    ]);

    return {
      generatedAt: new Date(),
      filters,
      metrics,
      disruption,
      summary,
    };
  }

  async generatePostCycleSummary(filters: ReportFilters = {}): Promise<PostCycleSummary> {
    const [avgResolutionTime, incidentsPerCenter, recurringProblems] = await Promise.all([
      this.getAvgResolutionTime(filters),
      this.getIncidentsPerCenter(filters),
      this.getRecurringProblems(filters),
    ]);

    return {
      avgResolutionTimeMinutes: avgResolutionTime,
      incidentsPerCenter,
      recurringProblems,
    };
  }

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [summary, regionsCount, recent] = await Promise.all([
      this.db
        .select({
          total: sql<number>`COUNT(${incidents.id})::int`,
          reported: sql<number>`COUNT(CASE WHEN ${incidents.status} = 'Reported' THEN 1 END)::int`,
          inProgress: sql<number>`COUNT(CASE WHEN ${incidents.status} = 'In-Progress' THEN 1 END)::int`,
          resolvedToday: sql<number>`COUNT(CASE WHEN ${incidents.status} = 'Resolved' AND ${incidents.resolvedAt} >= ${today.toISOString()} THEN 1 END)::int`,
        })
        .from(incidents),
      
      this.db
        .select({
          name: regions.name,
          count: sql<number>`COUNT(${incidents.id})::int`,
        })
        .from(incidents)
        .leftJoin(regions, eq(incidents.regionId, regions.id))
        .groupBy(regions.name)
        .orderBy(sql`COUNT(${incidents.id}) DESC`),

      this.db
        .select({
          id: incidents.id,
          priority: incidents.priority,
          status: incidents.status,
          createdAt: incidents.createdAt,
          type: incidentTypes.name,
          location: examCenters.name,
        })
        .from(incidents)
        .leftJoin(incidentTypes, eq(incidents.incidentTypeId, incidentTypes.id))
        .leftJoin(examCenters, eq(incidents.examCenterId, examCenters.id))
        .where(sql`${incidents.priority} IN ('High', 'Critical')`)
        .orderBy(sql`${incidents.createdAt} DESC`)
        .limit(5),
    ]);

    return {
      summary: summary[0] ?? { total: 0, reported: 0, inProgress: 0, resolvedToday: 0 },
      regions: regionsCount,
      recentIncidents: recent,
    };
  }

  private async getIncidentMetrics(filters: ReportFilters): Promise<IncidentMetrics[]> {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        incidentTypeId: incidents.incidentTypeId,
        incidentTypeName: incidentTypes.name,
        regionId: incidents.regionId,
        regionName: regions.name,
        totalIncidents: sql<number>`COUNT(${incidents.id})::int`,
        resolvedIncidents: sql<number>`COUNT(CASE WHEN ${incidents.status} = 'Resolved' THEN 1 END)::int`,
        avgTimeToResolveMinutes: sql<number | null>`
          AVG(
            CASE 
              WHEN ${incidents.resolvedAt} IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (${incidents.resolvedAt} - ${incidents.createdAt})) / 60
            END
          )
        `,
        resolvedWithinThreshold: sql<number>`
          COUNT(
            CASE 
              WHEN ${incidents.resolvedAt} IS NOT NULL 
                AND EXTRACT(EPOCH FROM (${incidents.resolvedAt} - ${incidents.createdAt})) / 60 <= 
                  CASE ${incidents.priority}
                    WHEN 'High' THEN 30
                    WHEN 'Medium' THEN 90
                    WHEN 'Low' THEN 180
                  END
              THEN 1
            END
          )::int
        `,
      })
      .from(incidents)
      .leftJoin(incidentTypes, eq(incidents.incidentTypeId, incidentTypes.id))
      .leftJoin(regions, eq(incidents.regionId, regions.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        incidents.incidentTypeId,
        incidentTypes.name,
        incidents.regionId,
        regions.name,
      );

    return results.map((row) => ({
      incidentTypeId: row.incidentTypeId,
      incidentTypeName: row.incidentTypeName ?? 'Unknown',
      regionId: row.regionId,
      regionName: row.regionName,
      totalIncidents: row.totalIncidents,
      resolvedIncidents: row.resolvedIncidents,
      avgTimeToResolveMinutes: row.avgTimeToResolveMinutes,
      resolvedWithinThreshold: row.resolvedWithinThreshold,
      percentResolvedWithinThreshold:
        row.resolvedIncidents > 0
          ? Math.round((row.resolvedWithinThreshold / row.resolvedIncidents) * 100)
          : 0,
    }));
  }

  private async getDisruptionMetrics(filters: ReportFilters): Promise<DisruptionMetrics[]> {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        examCenterId: incidents.examCenterId,
        examCenterName: examCenters.name,
        totalIncidents: sql<number>`COUNT(${incidents.id})::int`,
        avgDisruptionMinutes: sql<number | null>`
          AVG(
            CASE 
              WHEN ${incidents.resolvedAt} IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (${incidents.resolvedAt} - ${incidents.createdAt})) / 60
              ELSE EXTRACT(EPOCH FROM (NOW() - ${incidents.createdAt})) / 60
            END
          )
        `,
        highPriorityCount: sql<number>`COUNT(CASE WHEN ${incidents.priority} = 'High' THEN 1 END)::int`,
      })
      .from(incidents)
      .leftJoin(examCenters, eq(incidents.examCenterId, examCenters.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(incidents.examCenterId, examCenters.name);

    return results.map((row) => ({
      examCenterId: row.examCenterId,
      examCenterName: row.examCenterName ?? 'Unknown',
      totalIncidents: row.totalIncidents,
      avgDisruptionMinutes: row.avgDisruptionMinutes,
      highPriorityCount: row.highPriorityCount,
    }));
  }

  private async getSummaryMetrics(filters: ReportFilters) {
    const conditions = this.buildWhereConditions(filters);

    const result = await this.db
      .select({
        totalIncidents: sql<number>`COUNT(${incidents.id})::int`,
        resolvedIncidents: sql<number>`COUNT(CASE WHEN ${incidents.status} = 'Resolved' THEN 1 END)::int`,
        avgResolutionTimeMinutes: sql<number | null>`
          AVG(
            CASE 
              WHEN ${incidents.resolvedAt} IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (${incidents.resolvedAt} - ${incidents.createdAt})) / 60
            END
          )
        `,
        highPriorityCount: sql<number>`COUNT(CASE WHEN ${incidents.priority} = 'High' THEN 1 END)::int`,
      })
      .from(incidents)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0] ?? {
      totalIncidents: 0,
      resolvedIncidents: 0,
      avgResolutionTimeMinutes: null,
      highPriorityCount: 0,
    };
  }

  private async getAvgResolutionTime(filters: ReportFilters): Promise<number | null> {
    const conditions = this.buildWhereConditions(filters);
    conditions.push(isNotNull(incidents.resolvedAt));

    const result = await this.db
      .select({
        avgMinutes: sql<number | null>`
          AVG(EXTRACT(EPOCH FROM (${incidents.resolvedAt} - ${incidents.createdAt})) / 60)
        `,
      })
      .from(incidents)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0]?.avgMinutes ?? null;
  }

  private async getIncidentsPerCenter(filters: ReportFilters) {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        examCenterId: incidents.examCenterId,
        examCenterName: examCenters.name,
        incidentCount: sql<number>`COUNT(${incidents.id})::int`,
      })
      .from(incidents)
      .leftJoin(examCenters, eq(incidents.examCenterId, examCenters.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(incidents.examCenterId, examCenters.name)
      .orderBy(sql`COUNT(${incidents.id}) DESC`);

    return results.map((row) => ({
      examCenterId: row.examCenterId,
      examCenterName: row.examCenterName ?? 'Unknown',
      incidentCount: row.incidentCount,
    }));
  }

  private async getRecurringProblems(filters: ReportFilters) {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        incidentTypeId: incidents.incidentTypeId,
        incidentTypeName: incidentTypes.name,
        examCenterId: incidents.examCenterId,
        examCenterName: examCenters.name,
        frequency: sql<number>`COUNT(${incidents.id})::int`,
      })
      .from(incidents)
      .leftJoin(incidentTypes, eq(incidents.incidentTypeId, incidentTypes.id))
      .leftJoin(examCenters, eq(incidents.examCenterId, examCenters.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        incidents.incidentTypeId,
        incidentTypes.name,
        incidents.examCenterId,
        examCenters.name,
      )
      .having(sql`COUNT(${incidents.id}) >= 3`)
      .orderBy(sql`COUNT(${incidents.id}) DESC`);

    return results.map((row) => ({
      incidentTypeId: row.incidentTypeId,
      incidentTypeName: row.incidentTypeName ?? 'Unknown',
      examCenterId: row.examCenterId,
      examCenterName: row.examCenterName ?? 'Unknown',
      frequency: row.frequency,
    }));
  }

  private buildWhereConditions(filters: ReportFilters) {
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(incidents.createdAt, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(incidents.createdAt, filters.endDate));
    }

    if (filters.regionId) {
      conditions.push(eq(incidents.regionId, filters.regionId));
    }

    if (filters.examCenterId) {
      conditions.push(eq(incidents.examCenterId, filters.examCenterId));
    }

    if (filters.incidentTypeId) {
      conditions.push(eq(incidents.incidentTypeId, filters.incidentTypeId));
    }

    if (filters.assignedUserId) {
      conditions.push(eq(incidents.assignedUserId, filters.assignedUserId));
    }

    return conditions;
  }
}

export const reportService = new ReportService();
export default ReportService;
