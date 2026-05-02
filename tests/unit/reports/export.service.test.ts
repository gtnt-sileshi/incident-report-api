/**
 * Unit tests for ExportService
 * Tests PDF and XLSX export functionality
 */

// Set required env vars BEFORE any imports
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
process.env.VAPID_PUBLIC_KEY = 'test-vapid-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';
process.env.FCM_SERVER_KEY = 'test-fcm-server-key';
process.env.SMS_GATEWAY_URL = 'https://sms.example.com/send';
process.env.SMS_GATEWAY_API_KEY = 'test-sms-key';
process.env.QR_PRIVATE_KEY_PATH = '/tmp/qr-private.pem';
process.env.QR_PUBLIC_KEY_PATH = '/tmp/qr-public.pem';
process.env.NODE_ENV = 'test';

import { describe, it, expect } from '@jest/globals';
import { exportService } from '../../../src/reports/export.service';
import { ReportData, PostCycleSummary } from '../../../src/reports/report.service';

describe('ExportService', () => {
  const mockReportData: ReportData = {
    generatedAt: new Date('2024-01-15T10:00:00Z'),
    filters: {
      startDate: new Date('2024-01-01T00:00:00Z'),
      endDate: new Date('2024-01-31T23:59:59Z'),
    },
    metrics: [
      {
        incidentTypeId: 'type-1',
        incidentTypeName: 'Network Outage',
        orgId: 'org-1',
        orgName: 'ITDB',
        totalIncidents: 10,
        resolvedIncidents: 8,
        avgTimeToResolveMinutes: 45,
        resolvedWithinThreshold: 6,
        percentResolvedWithinThreshold: 75,
      },
      {
        incidentTypeId: 'type-2',
        incidentTypeName: 'Power Failure',
        orgId: 'org-2',
        orgName: 'ELPA',
        totalIncidents: 5,
        resolvedIncidents: 4,
        avgTimeToResolveMinutes: 60,
        resolvedWithinThreshold: 3,
        percentResolvedWithinThreshold: 75,
      },
    ],
    disruption: [
      {
        examFieldId: 'field-1',
        examFieldName: 'Field A',
        totalIncidents: 8,
        avgDisruptionMinutes: 50,
        highPriorityCount: 3,
      },
      {
        examFieldId: 'field-2',
        examFieldName: 'Field B',
        totalIncidents: 7,
        avgDisruptionMinutes: 40,
        highPriorityCount: 2,
      },
    ],
    summary: {
      totalIncidents: 15,
      resolvedIncidents: 12,
      avgResolutionTimeMinutes: 52.5,
      highPriorityCount: 5,
    },
  };

  const mockPostCycleSummary: PostCycleSummary = {
    avgResolutionTimeMinutes: 55,
    incidentsPerField: [
      {
        examFieldId: 'field-1',
        examFieldName: 'Field A',
        incidentCount: 8,
      },
      {
        examFieldId: 'field-2',
        examFieldName: 'Field B',
        incidentCount: 7,
      },
    ],
    recurringProblems: [
      {
        incidentTypeId: 'type-1',
        incidentTypeName: 'Network Outage',
        examFieldId: 'field-1',
        examFieldName: 'Field A',
        frequency: 5,
      },
    ],
  };

  describe('exportPDF', () => {
    it('generates a PDF buffer from report data', async () => {
      const buffer = await exportService.exportPDF(mockReportData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Check PDF magic number (first 4 bytes should be %PDF)
      const pdfHeader = buffer.toString('utf8', 0, 4);
      expect(pdfHeader).toBe('%PDF');
    });

    it('completes within 30 seconds for large datasets', async () => {
      // Create a larger dataset (simulating 12 months of data)
      const largeReportData: ReportData = {
        ...mockReportData,
        metrics: Array.from({ length: 100 }, (_, i) => ({
          incidentTypeId: `type-${i}`,
          incidentTypeName: `Incident Type ${i}`,
          orgId: `org-${i % 5}`,
          orgName: `Organization ${i % 5}`,
          totalIncidents: Math.floor(Math.random() * 50) + 10,
          resolvedIncidents: Math.floor(Math.random() * 40) + 5,
          avgTimeToResolveMinutes: Math.random() * 120 + 20,
          resolvedWithinThreshold: Math.floor(Math.random() * 30) + 5,
          percentResolvedWithinThreshold: Math.floor(Math.random() * 100),
        })),
        disruption: Array.from({ length: 100 }, (_, i) => ({
          examFieldId: `field-${i}`,
          examFieldName: `Exam Field ${i}`,
          totalIncidents: Math.floor(Math.random() * 30) + 5,
          avgDisruptionMinutes: Math.random() * 100 + 20,
          highPriorityCount: Math.floor(Math.random() * 10),
        })),
      };

      const startTime = Date.now();
      const buffer = await exportService.exportPDF(largeReportData);
      const duration = Date.now() - startTime;

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(30000); // Must complete within 30 seconds
    }, 35000); // Set Jest timeout to 35 seconds for this test
  });

  describe('exportXLSX', () => {
    it('generates an XLSX buffer from report data', async () => {
      const buffer = await exportService.exportXLSX(mockReportData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Check XLSX magic number (first 2 bytes should be PK for ZIP format)
      const xlsxHeader = buffer.toString('hex', 0, 2);
      expect(xlsxHeader).toBe('504b'); // PK in hex
    });

    it('completes within 30 seconds for large datasets', async () => {
      // Create a larger dataset (simulating 12 months of data)
      const largeReportData: ReportData = {
        ...mockReportData,
        metrics: Array.from({ length: 100 }, (_, i) => ({
          incidentTypeId: `type-${i}`,
          incidentTypeName: `Incident Type ${i}`,
          orgId: `org-${i % 5}`,
          orgName: `Organization ${i % 5}`,
          totalIncidents: Math.floor(Math.random() * 50) + 10,
          resolvedIncidents: Math.floor(Math.random() * 40) + 5,
          avgTimeToResolveMinutes: Math.random() * 120 + 20,
          resolvedWithinThreshold: Math.floor(Math.random() * 30) + 5,
          percentResolvedWithinThreshold: Math.floor(Math.random() * 100),
        })),
        disruption: Array.from({ length: 100 }, (_, i) => ({
          examFieldId: `field-${i}`,
          examFieldName: `Exam Field ${i}`,
          totalIncidents: Math.floor(Math.random() * 30) + 5,
          avgDisruptionMinutes: Math.random() * 100 + 20,
          highPriorityCount: Math.floor(Math.random() * 10),
        })),
      };

      const startTime = Date.now();
      const buffer = await exportService.exportXLSX(largeReportData);
      const duration = Date.now() - startTime;

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(30000); // Must complete within 30 seconds
    }, 35000); // Set Jest timeout to 35 seconds for this test
  });

  describe('exportPostCycleSummaryPDF', () => {
    it('generates a PDF buffer from post-cycle summary', async () => {
      const buffer = await exportService.exportPostCycleSummaryPDF(mockPostCycleSummary);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Check PDF magic number
      const pdfHeader = buffer.toString('utf8', 0, 4);
      expect(pdfHeader).toBe('%PDF');
    });
  });

  describe('exportPostCycleSummaryXLSX', () => {
    it('generates an XLSX buffer from post-cycle summary', async () => {
      const buffer = await exportService.exportPostCycleSummaryXLSX(mockPostCycleSummary);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Check XLSX magic number
      const xlsxHeader = buffer.toString('hex', 0, 2);
      expect(xlsxHeader).toBe('504b'); // PK in hex
    });
  });
});
