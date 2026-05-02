import { getDb } from '../db/index';
import { incidents, incidentTypes, examFields, organizations } from '../db/schema';
import { eq, and, gte, lte, sql, isNotNull } from 'drizzle-orm';

/**
 * Report filters for generating incident reports
 */
export interface ReportFilters {
  examCycle?: string;
  startDate?: Date;
  endDate?: Date;
  examFieldId?: string;
  incidentTypeId?: string;
  orgId?: string;
}

/**
 * Aggregated incident metrics per type and organization
 */
export interface IncidentMetrics {
  incidentTypeId: string;
  incidentTypeName: string;
  orgId: string | null;
  orgName: string | null;
  totalIncidents: number;
  resolvedIncidents: number;
  avgTimeToResolveMinutes: number | null;
  resolvedWithinThreshold: number;
  percentResolvedWithinThreshold: number;
}

/**
 * Disruption metrics per exam field
 */
export interface DisruptionMetrics {
  examFieldId: string;
  examFieldName: string;
  totalIncidents: number;
  avgDisruptionMinutes: number | null;
  highPriorityCount: number;
}

/**
 * Post-cycle summary data
 */
export interface PostCycleSummary {
  avgResolutionTimeMinutes: number | null;
  incidentsPerField: Array<{
    examFieldId: string;
    examFieldName: string;
    incidentCount: number;
  }>;
  recurringProblems: Array<{
    incidentTypeId: string;
    incidentTypeName: string;
    examFieldId: string;
    examFieldName: string;
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

  /**
   * Generates an incident report with aggregated metrics.
   * 
   * Aggregates:
   * - Time-to-resolve per incident type and organization
   * - Average disruption minutes per exam field
   * - Percentage of incidents resolved within threshold
   * 
   * Requirements: 11.1, 11.5
   */
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

  /**
   * Generates a post-exam-cycle summary report.
   * 
   * Includes:
   * - Average resolution time across all incidents
   * - Incidents per exam field
   * - Recurring problem areas (incident type + field combinations with high frequency)
   * 
   * Requirements: 11.5
   */
  async generatePostCycleSummary(filters: ReportFilters = {}): Promise<PostCycleSummary> {
    const [avgResolutionTime, incidentsPerField, recurringProblems] = await Promise.all([
      this.getAvgResolutionTime(filters),
      this.getIncidentsPerField(filters),
      this.getRecurringProblems(filters),
    ]);

    return {
      avgResolutionTimeMinutes: avgResolutionTime,
      incidentsPerField,
      recurringProblems,
    };
  }

  /**
   * Gets aggregated metrics per incident type and organization.
   */
  private async getIncidentMetrics(filters: ReportFilters): Promise<IncidentMetrics[]> {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        incidentTypeId: incidents.incidentTypeId,
        incidentTypeName: incidentTypes.name,
        orgId: incidents.assignedOrgId,
        orgName: organizations.name,
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
      .leftJoin(organizations, eq(incidents.assignedOrgId, organizations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        incidents.incidentTypeId,
        incidentTypes.name,
        incidents.assignedOrgId,
        organizations.name,
      );

    return results.map((row) => ({
      incidentTypeId: row.incidentTypeId,
      incidentTypeName: row.incidentTypeName ?? 'Unknown',
      orgId: row.orgId,
      orgName: row.orgName,
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

  /**
   * Gets disruption metrics per exam field.
   */
  private async getDisruptionMetrics(filters: ReportFilters): Promise<DisruptionMetrics[]> {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        examFieldId: incidents.examFieldId,
        examFieldName: examFields.name,
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
      .leftJoin(examFields, eq(incidents.examFieldId, examFields.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(incidents.examFieldId, examFields.name);

    return results.map((row) => ({
      examFieldId: row.examFieldId,
      examFieldName: row.examFieldName ?? 'Unknown',
      totalIncidents: row.totalIncidents,
      avgDisruptionMinutes: row.avgDisruptionMinutes,
      highPriorityCount: row.highPriorityCount,
    }));
  }

  /**
   * Gets overall summary metrics.
   */
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

  /**
   * Gets average resolution time across all incidents.
   */
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

  /**
   * Gets incident count per exam field.
   */
  private async getIncidentsPerField(filters: ReportFilters) {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        examFieldId: incidents.examFieldId,
        examFieldName: examFields.name,
        incidentCount: sql<number>`COUNT(${incidents.id})::int`,
      })
      .from(incidents)
      .leftJoin(examFields, eq(incidents.examFieldId, examFields.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(incidents.examFieldId, examFields.name)
      .orderBy(sql`COUNT(${incidents.id}) DESC`);

    return results.map((row) => ({
      examFieldId: row.examFieldId,
      examFieldName: row.examFieldName ?? 'Unknown',
      incidentCount: row.incidentCount,
    }));
  }

  /**
   * Identifies recurring problem areas (incident type + field combinations with frequency >= 3).
   */
  private async getRecurringProblems(filters: ReportFilters) {
    const conditions = this.buildWhereConditions(filters);

    const results = await this.db
      .select({
        incidentTypeId: incidents.incidentTypeId,
        incidentTypeName: incidentTypes.name,
        examFieldId: incidents.examFieldId,
        examFieldName: examFields.name,
        frequency: sql<number>`COUNT(${incidents.id})::int`,
      })
      .from(incidents)
      .leftJoin(incidentTypes, eq(incidents.incidentTypeId, incidentTypes.id))
      .leftJoin(examFields, eq(incidents.examFieldId, examFields.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        incidents.incidentTypeId,
        incidentTypes.name,
        incidents.examFieldId,
        examFields.name,
      )
      .having(sql`COUNT(${incidents.id}) >= 3`)
      .orderBy(sql`COUNT(${incidents.id}) DESC`);

    return results.map((row) => ({
      incidentTypeId: row.incidentTypeId,
      incidentTypeName: row.incidentTypeName ?? 'Unknown',
      examFieldId: row.examFieldId,
      examFieldName: row.examFieldName ?? 'Unknown',
      frequency: row.frequency,
    }));
  }

  /**
   * Builds WHERE conditions based on filters.
   */
  private buildWhereConditions(filters: ReportFilters) {
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(incidents.createdAt, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(incidents.createdAt, filters.endDate));
    }

    if (filters.examFieldId) {
      conditions.push(eq(incidents.examFieldId, filters.examFieldId));
    }

    if (filters.incidentTypeId) {
      conditions.push(eq(incidents.incidentTypeId, filters.incidentTypeId));
    }

    if (filters.orgId) {
      conditions.push(eq(incidents.assignedOrgId, filters.orgId));
    }

    return conditions;
  }
}

export const reportService = new ReportService();
export default ReportService;
