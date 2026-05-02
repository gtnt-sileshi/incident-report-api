/**
 * Unit tests for ReportService
 * Tests report generation and aggregation logic
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

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { reportService } from '../../../src/reports/report.service';
import { getDb } from '../../../src/db';
import {
  incidents,
  incidentTypes,
  examFields,
  organizations,
  users,
} from '../../../src/db/schema';
import { sql } from 'drizzle-orm';

describe('ReportService', () => {
  let db: ReturnType<typeof getDb>;
  let testOrgId: string;
  let testUserId: string;
  let testExamFieldId: string;
  let testIncidentTypeId: string;

  beforeAll(async () => {
    db = getDb();

    // Clean up test data
    await db.delete(incidents);
    await db.delete(users);
    await db.delete(examFields);
    await db.delete(incidentTypes);
    await db.delete(organizations);

    // Create test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Test Org Report',
        type: 'test',
        isActive: true,
      })
      .returning();
    testOrgId = org.id;

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        orgId: testOrgId,
        name: 'Test User',
        email: 'test@example.com',
        role: 'bureau_staff',
        isActive: true,
      })
      .returning();
    testUserId = user.id;

    // Create test exam field
    const [field] = await db
      .insert(examFields)
      .values({
        name: 'Test Field',
        location: 'Test Location',
        isActive: true,
      })
      .returning();
    testExamFieldId = field.id;

    // Create test incident type
    const [type] = await db
      .insert(incidentTypes)
      .values({
        name: 'Test Type',
        defaultPriority: 'High',
        isActive: true,
      })
      .returning();
    testIncidentTypeId = type.id;
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(incidents);
    await db.delete(users);
    await db.delete(examFields);
    await db.delete(incidentTypes);
    await db.delete(organizations);
  });

  describe('generateIncidentReport', () => {
    it('generates a report with summary metrics', async () => {
      // Create test incidents
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:20:00Z'), // 20 minutes
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'Medium',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'), // 60 minutes
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'In-Progress',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T12:00:00Z'),
        },
      ]);

      const report = await reportService.generateIncidentReport({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(report).toBeDefined();
      expect(report.summary.totalIncidents).toBe(3);
      expect(report.summary.resolvedIncidents).toBe(2);
      expect(report.summary.highPriorityCount).toBe(2);
      expect(report.summary.avgResolutionTimeMinutes).toBeGreaterThan(0);

      // Clean up
      await db.delete(incidents);
    });

    it('calculates metrics per incident type and organization', async () => {
      // Create test incidents
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:25:00Z'), // 25 minutes (within threshold)
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'), // 60 minutes (beyond threshold)
        },
      ]);

      const report = await reportService.generateIncidentReport({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(report.metrics.length).toBeGreaterThan(0);
      const metric = report.metrics[0];
      expect(metric.incidentTypeId).toBe(testIncidentTypeId);
      expect(metric.totalIncidents).toBe(2);
      expect(metric.resolvedIncidents).toBe(2);
      expect(metric.resolvedWithinThreshold).toBe(1); // Only first one within 30 min threshold
      expect(metric.percentResolvedWithinThreshold).toBe(50);

      // Clean up
      await db.delete(incidents);
    });

    it('calculates disruption metrics per exam field', async () => {
      // Create test incidents
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:30:00Z'), // 30 minutes
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'), // 60 minutes
        },
      ]);

      const report = await reportService.generateIncidentReport({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(report.disruption.length).toBeGreaterThan(0);
      const disruption = report.disruption[0];
      expect(disruption.examFieldId).toBe(testExamFieldId);
      expect(disruption.totalIncidents).toBe(2);
      expect(disruption.highPriorityCount).toBe(2);
      expect(disruption.avgDisruptionMinutes).toBeCloseTo(45, 0); // Average of 30 and 60

      // Clean up
      await db.delete(incidents);
    });

    it('filters by exam field', async () => {
      // Create another exam field
      const [field2] = await db
        .insert(examFields)
        .values({
          name: 'Test Field 2',
          location: 'Test Location 2',
          isActive: true,
        })
        .returning();

      // Create incidents in both fields
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:30:00Z'),
        },
        {
          examFieldId: field2.id,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'),
        },
      ]);

      const report = await reportService.generateIncidentReport({
        examFieldId: testExamFieldId,
      });

      expect(report.summary.totalIncidents).toBe(1);

      // Clean up
      await db.delete(incidents);
      await db.delete(examFields).where(sql`${examFields.id} = ${field2.id}`);
    });
  });

  describe('generatePostCycleSummary', () => {
    it('calculates average resolution time', async () => {
      // Create test incidents
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:30:00Z'), // 30 minutes
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'Medium',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:30:00Z'), // 90 minutes
        },
      ]);

      const summary = await reportService.generatePostCycleSummary({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(summary.avgResolutionTimeMinutes).toBeCloseTo(60, 0); // Average of 30 and 90

      // Clean up
      await db.delete(incidents);
    });

    it('counts incidents per field', async () => {
      // Create test incidents
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:30:00Z'),
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'Medium',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'),
        },
      ]);

      const summary = await reportService.generatePostCycleSummary({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(summary.incidentsPerField.length).toBeGreaterThan(0);
      const fieldSummary = summary.incidentsPerField[0];
      expect(fieldSummary.examFieldId).toBe(testExamFieldId);
      expect(fieldSummary.incidentCount).toBe(2);

      // Clean up
      await db.delete(incidents);
    });

    it('identifies recurring problems (frequency >= 3)', async () => {
      // Create 3 incidents of the same type in the same field
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:30:00Z'),
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T11:30:00Z'),
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T12:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:30:00Z'),
        },
      ]);

      const summary = await reportService.generatePostCycleSummary({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(summary.recurringProblems.length).toBeGreaterThan(0);
      const problem = summary.recurringProblems[0];
      expect(problem.incidentTypeId).toBe(testIncidentTypeId);
      expect(problem.examFieldId).toBe(testExamFieldId);
      expect(problem.frequency).toBe(3);

      // Clean up
      await db.delete(incidents);
    });

    it('does not include problems with frequency < 3', async () => {
      // Create only 2 incidents
      await db.insert(incidents).values([
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T10:30:00Z'),
        },
        {
          examFieldId: testExamFieldId,
          incidentTypeId: testIncidentTypeId,
          reportedByUserId: testUserId,
          priority: 'High',
          status: 'Resolved',
          assignedOrgId: testOrgId,
          createdAt: new Date('2024-01-01T11:00:00Z'),
          resolvedAt: new Date('2024-01-01T11:30:00Z'),
        },
      ]);

      const summary = await reportService.generatePostCycleSummary({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-02T00:00:00Z'),
      });

      expect(summary.recurringProblems.length).toBe(0);

      // Clean up
      await db.delete(incidents);
    });
  });
});
