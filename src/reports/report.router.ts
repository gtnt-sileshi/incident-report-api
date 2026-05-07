import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  generateReport,
  generatePostCycleSummary,
  exportReport,
  exportPostCycleSummary,
  getDashboardStats,
} from './report.controller';

const router = Router();

// All report routes require authentication
router.use(authenticate);

router.get('/dashboard-stats', getDashboardStats);

/**
 * GET /api/reports/generate
 * Generate an incident report with aggregated metrics
 * Requirements: 11.1, 11.3, 11.5
 */
router.get('/generate', requirePermission('reports.view'), generateReport);

/**
 * GET /api/reports/post-cycle-summary
 * Generate a post-exam-cycle summary report
 * Requirements: 11.5
 */
router.get(
  '/post-cycle-summary',
  requirePermission('reports.view'),
  generatePostCycleSummary,
);

/**
 * GET /api/reports/export/:format
 * Export a report in PDF or XLSX format
 * Requirements: 11.2, 11.3, 11.4
 */
router.get('/export/:format', requirePermission('reports.export'), exportReport);

/**
 * GET /api/reports/export-post-cycle/:format
 * Export a post-cycle summary in PDF or XLSX format
 * Requirements: 11.2, 11.4, 11.5
 */
router.get(
  '/export-post-cycle/:format',
  requirePermission('reports.export'),
  exportPostCycleSummary,
);

export default router;
