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
  examFieldId: z.string().uuid().optional(),
  incidentTypeId: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(),
});

/**
 * Generates an incident report with aggregated metrics.
 * 
 * GET /api/reports/generate
 * Query params: examCycle, startDate, endDate, examFieldId, incidentTypeId, orgId
 * 
 * Requirements: 11.1, 11.3, 11.5
 */
export async function generateReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Validate query parameters
    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    // Build filters
    const filters: ReportFilters = {};

    if (parsed.data.examCycle) {
      filters.examCycle = parsed.data.examCycle;
    }

    if (parsed.data.startDate) {
      filters.startDate = new Date(parsed.data.startDate);
    }

    if (parsed.data.endDate) {
      filters.endDate = new Date(parsed.data.endDate);
    }

    if (parsed.data.examFieldId) {
      filters.examFieldId = parsed.data.examFieldId;
    }

    if (parsed.data.incidentTypeId) {
      filters.incidentTypeId = parsed.data.incidentTypeId;
    }

    if (parsed.data.orgId) {
      filters.orgId = parsed.data.orgId;
    }

    // Generate report
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
 * 
 * GET /api/reports/post-cycle-summary
 * Query params: examCycle, startDate, endDate
 * 
 * Requirements: 11.5
 */
export async function generatePostCycleSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Validate query parameters
    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    // Build filters
    const filters: ReportFilters = {};

    if (parsed.data.examCycle) {
      filters.examCycle = parsed.data.examCycle;
    }

    if (parsed.data.startDate) {
      filters.startDate = new Date(parsed.data.startDate);
    }

    if (parsed.data.endDate) {
      filters.endDate = new Date(parsed.data.endDate);
    }

    // Generate summary
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
 * Exports a report in the specified format (pdf or xlsx).
 * 
 * GET /api/reports/export/:format
 * Query params: same as generateReport
 * Path param: format (pdf | xlsx)
 * 
 * Requirements: 11.2, 11.3, 11.4
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

    // Validate query parameters
    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    // Build filters
    const filters: ReportFilters = {};

    if (parsed.data.examCycle) {
      filters.examCycle = parsed.data.examCycle;
    }

    if (parsed.data.startDate) {
      filters.startDate = new Date(parsed.data.startDate);
    }

    if (parsed.data.endDate) {
      filters.endDate = new Date(parsed.data.endDate);
    }

    if (parsed.data.examFieldId) {
      filters.examFieldId = parsed.data.examFieldId;
    }

    if (parsed.data.incidentTypeId) {
      filters.incidentTypeId = parsed.data.incidentTypeId;
    }

    if (parsed.data.orgId) {
      filters.orgId = parsed.data.orgId;
    }

    // Generate report data
    const reportData = await reportService.generateIncidentReport(filters);

    // Export to requested format
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

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Exports a post-cycle summary in the specified format (pdf or xlsx).
 * 
 * GET /api/reports/export-post-cycle/:format
 * Query params: examCycle, startDate, endDate
 * Path param: format (pdf | xlsx)
 * 
 * Requirements: 11.2, 11.4, 11.5
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

    // Validate query parameters
    const parsed = ReportFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FILTERS', 'Invalid report filters', parsed.error.errors);
    }

    // Build filters
    const filters: ReportFilters = {};

    if (parsed.data.examCycle) {
      filters.examCycle = parsed.data.examCycle;
    }

    if (parsed.data.startDate) {
      filters.startDate = new Date(parsed.data.startDate);
    }

    if (parsed.data.endDate) {
      filters.endDate = new Date(parsed.data.endDate);
    }

    // Generate summary
    const summary = await reportService.generatePostCycleSummary(filters);

    // Export to requested format
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

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}
