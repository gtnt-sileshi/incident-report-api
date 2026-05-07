import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportService, ReportFilters } from './report.service';
import { exportService } from './export.service';
import { AppError } from '../middleware/errorHandler';

/**
 * Query schema for report generation filters
 */
const ReportFiltersSchema = z.object({
  examCycle: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  regionId: z.string().uuid().optional(),
  examCenterId: z.string().uuid().optional(),
  incidentTypeId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
});

/**
 * Generates an incident report with aggregated metrics.
 */
export async function generateReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    const filters: ReportFilters = {};

    if (parsed.data.examCycle) filters.examCycle = parsed.data.examCycle;
    if (parsed.data.startDate) filters.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate) filters.endDate = new Date(parsed.data.endDate);
    if (parsed.data.regionId) filters.regionId = parsed.data.regionId;
    if (parsed.data.examCenterId) filters.examCenterId = parsed.data.examCenterId;
    if (parsed.data.incidentTypeId) filters.incidentTypeId = parsed.data.incidentTypeId;
    if (parsed.data.assignedUserId) filters.assignedUserId = parsed.data.assignedUserId;

    const reportData = await reportService.generateIncidentReport(filters);

    res.json({
      success: true,
      data: reportData,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Generates a post-exam-cycle summary report.
 */
export async function generatePostCycleSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    const filters: ReportFilters = {};

    if (parsed.data.examCycle) filters.examCycle = parsed.data.examCycle;
    if (parsed.data.startDate) filters.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate) filters.endDate = new Date(parsed.data.endDate);

    const summary = await reportService.generatePostCycleSummary(filters);

    res.json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Gets overview stats for the dashboard home page.
 */
export async function getDashboardStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await reportService.getDashboardStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Exports a report in the specified format (pdf or xlsx).
 */
export async function exportReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const format = req.params.format?.toLowerCase();

    if (format !== 'pdf' && format !== 'xlsx') {
      throw new AppError(400, 'INVALID_FORMAT', 'Format must be either "pdf" or "xlsx"');
    }

    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    const filters: ReportFilters = {};

    if (parsed.data.examCycle) filters.examCycle = parsed.data.examCycle;
    if (parsed.data.startDate) filters.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate) filters.endDate = new Date(parsed.data.endDate);
    if (parsed.data.regionId) filters.regionId = parsed.data.regionId;
    if (parsed.data.examCenterId) filters.examCenterId = parsed.data.examCenterId;
    if (parsed.data.incidentTypeId) filters.incidentTypeId = parsed.data.incidentTypeId;
    if (parsed.data.assignedUserId) filters.assignedUserId = parsed.data.assignedUserId;

    const reportData = await reportService.generateIncidentReport(filters);

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'pdf') {
      buffer = await exportService.exportPDF(reportData);
      contentType = 'application/pdf';
      filename = `incident-report-${Date.now()}.pdf`;
    } else {
      buffer = await exportService.exportXLSX(reportData);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `incident-report-${Date.now()}.xlsx`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Exports a post-cycle summary in the specified format (pdf or xlsx).
 */
export async function exportPostCycleSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const format = req.params.format?.toLowerCase();

    if (format !== 'pdf' && format !== 'xlsx') {
      throw new AppError(400, 'INVALID_FORMAT', 'Format must be either "pdf" or "xlsx"');
    }

    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    const filters: ReportFilters = {};

    if (parsed.data.examCycle) filters.examCycle = parsed.data.examCycle;
    if (parsed.data.startDate) filters.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate) filters.endDate = new Date(parsed.data.endDate);

    const summary = await reportService.generatePostCycleSummary(filters);

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'pdf') {
      buffer = await exportService.exportPostCycleSummaryPDF(summary);
      contentType = 'application/pdf';
      filename = `post-cycle-summary-${Date.now()}.pdf`;
    } else {
      buffer = await exportService.exportPostCycleSummaryXLSX(summary);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `post-cycle-summary-${Date.now()}.xlsx`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}
