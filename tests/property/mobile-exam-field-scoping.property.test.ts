import * as fc from 'fast-check';

// Mock the config module before any imports that depend on it
jest.mock('../../src/config', () => ({
  config: {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
    JWT_EXPIRES_IN: '8h',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
    FCM_SERVER_KEY: 'test-fcm-server-key',
    SMS_GATEWAY_URL: 'https://test-sms-gateway.com',
    SMS_GATEWAY_API_KEY: 'test-sms-api-key',
    SMS_GATEWAY_SENDER_ID: 'TEST',
    ATTACHMENT_STORAGE_PATH: './test-attachments',
    MAX_FILE_SIZE_MB: 50,
    QR_PRIVATE_KEY_PATH: './test-ec-private.pem',
    QR_PUBLIC_KEY_PATH: './test-ec-public.pem',
    ESCALATION_HIGH_PRIORITY_MINUTES: 30,
    ESCALATION_MEDIUM_PRIORITY_MINUTES: 90,
    LOG_LEVEL: 'error',
  },
}));

// Mock the database connection
jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// Mock repositories
jest.mock('../../src/catalog/incident-type.repository');
jest.mock('../../src/devices/exam-center-assignment.repository');
jest.mock('../../src/devices/exam-field.repository');
jest.mock('../../src/notifications/notification.repository');
jest.mock('../../src/incidents/incident.repository');
jest.mock('../../src/audit/audit-log.repository');
jest.mock('../../src/organizations/organization.repository');
jest.mock('../../src/routing/routing-rule.service');
jest.mock('../../src/users/user.repository');
jest.mock('../../src/push/push-notification.service');
jest.mock('../../src/websocket/websocket-publisher.service');

import { syncService } from '../../src/sync/sync.service';
import { incidentService } from '../../src/incidents/incident.service';
import { incidentTypeRepository } from '../../src/catalog/incident-type.repository';
import { examCenterAssignmentRepository } from '../../src/devices/exam-center-assignment.repository';
import { examFieldRepository } from '../../src/devices/exam-field.repository';
import { notificationRepository } from '../../src/notifications/notification.repository';
import { incidentRepository } from '../../src/incidents/incident.repository';
import { organizationRepository } from '../../src/organizations/organization.repository';
import { routingRuleService } from '../../src/routing/routing-rule.service';
import {
  IncidentType,
  ExamField,
  ExamCenterAssignment,
  Organization,
  Incident,
} from '../../src/db/schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a mock IncidentType object.
 */
function makeIncidentType(id: string, name: string): IncidentType {
  return {
    id,
    name,
    defaultPriority: 'Medium',
    description: null,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

/**
 * Build a mock ExamField object.
 */
function makeExamField(id: string, name: string): ExamField {
  return {
    id,
    name,
    location: `Location ${name}`,
    latitude: '9.030000',
    longitude: '38.740000',
    isActive: true,
  };
}

/**
 * Build a mock ExamCenterAssignment object.
 */
function makeAssignment(userId: string, examFieldId: string): ExamCenterAssignment {
  return {
    id: `assign-${userId}-${examFieldId}`,
    userId,
    examFieldId,
    assignedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

/**
 * Build a mock Organization object.
 */
function makeOrganization(id: string, name: string): Organization {
  return {
    id,
    name,
    type: 'government',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

/**
 * Build a mock Incident object.
 */
function makeIncident(
  id: string,
  examFieldId: string,
  reportedByUserId: string,
): Incident {
  return {
    id,
    examFieldId,
    incidentTypeId: 'type-1',
    reportedByUserId,
    deviceId: null,
    priority: 'Medium',
    status: 'Reported',
    description: 'Test incident',
    assignedOrgId: 'itdb-org-id',
    assignedUserId: null,
    resolvedAt: null,
    resolutionSummary: null,
    localId: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

// ─── P9: Mobile Exam Field Scoping ────────────────────────────────────────────

/**
 * Property-Based Test for Mobile Exam Field Scoping
 *
 * **Validates: Requirements 3.3, 3.5**
 *
 * Property 9: Mobile Exam Field Scoping
 *
 * For any registered device with exam center assignment A, the sync endpoint
 * SHALL return exactly the exam fields in A — no more, no fewer. Any incident
 * submission referencing an exam field not in A SHALL be rejected by the server.
 */
describe('Property Test: Mobile Exam Field Scoping (P9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Arbitrary: generate a random device assignment scenario
  const deviceAssignmentArbitrary = fc.record({
    userId: fc.uuid(),
    // Generate 1-5 assigned exam fields
    assignedFieldIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }).map((ids) => {
      // Ensure unique IDs
      return Array.from(new Set(ids));
    }),
    // Generate 1-3 unassigned exam fields (not in the assignment)
    unassignedFieldIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }).map((ids) => {
      return Array.from(new Set(ids));
    }),
  }).filter((data) => {
    // Ensure no overlap between assigned and unassigned fields
    const assignedSet = new Set(data.assignedFieldIds);
    return data.unassignedFieldIds.every((id) => !assignedSet.has(id));
  });

  it('Property 9: Sync endpoint returns exactly the assigned exam fields', async () => {
    await fc.assert(
      fc.asyncProperty(deviceAssignmentArbitrary, async (data) => {
        const { userId, assignedFieldIds, unassignedFieldIds } = data;

        // Build mock assignments
        const assignments = assignedFieldIds.map((fieldId) =>
          makeAssignment(userId, fieldId),
        );

        // Build mock exam fields (both assigned and unassigned)
        const allFieldIds = [...assignedFieldIds, ...unassignedFieldIds];
        const allFields = allFieldIds.map((fieldId, idx) =>
          makeExamField(fieldId, `Field-${idx}`),
        );

        // Mock: incident types (not relevant for this property)
        const mockIncidentTypes: IncidentType[] = [
          makeIncidentType('type-1', 'Power Failure'),
        ];

        // Setup mocks
        (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue(mockIncidentTypes);
        (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue(assignments);

        // Mock examFieldRepository.findById to return the correct field
        (examFieldRepository.findById as jest.Mock).mockImplementation(async (id: string) => {
          return allFields.find((f) => f.id === id) ?? null;
        });

        (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

        // Act: call sync endpoint
        const syncData = await syncService.getMobileSyncData(userId);

        // Assert: sync returns exactly the assigned fields
        const returnedFieldIds = new Set(syncData.examFields.map((f) => f.id));
        const assignedSet = new Set(assignedFieldIds);
        const unassignedSet = new Set(unassignedFieldIds);

        // Every assigned field must be returned
        for (const fieldId of assignedSet) {
          expect(returnedFieldIds.has(fieldId)).toBe(true);
        }

        // No unassigned field must be returned
        for (const fieldId of unassignedSet) {
          expect(returnedFieldIds.has(fieldId)).toBe(false);
        }

        // Size must match exactly
        expect(syncData.examFields.length).toBe(assignedFieldIds.length);
      }),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 9: Incident submission for assigned field succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(deviceAssignmentArbitrary, async (data) => {
        const { userId, assignedFieldIds } = data;

        // Pick a random assigned field
        const assignedFieldId = assignedFieldIds[0];

        // Build mock assignments
        const assignments = assignedFieldIds.map((fieldId) =>
          makeAssignment(userId, fieldId),
        );

        // Mock ITDB org
        const itdbOrg = makeOrganization('itdb-org-id', 'ITDB');

        // Setup mocks
        (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue(assignments);
        (organizationRepository.findByName as jest.Mock).mockResolvedValue(itdbOrg);
        (routingRuleService.evaluateRule as jest.Mock).mockResolvedValue(null);
        (incidentRepository.create as jest.Mock).mockImplementation(async (data) => {
          return makeIncident('incident-1', data.examFieldId, data.reportedByUserId);
        });

        // Act: submit incident for assigned field
        const incident = await incidentService.createIncident(
          {
            examFieldId: assignedFieldId,
            incidentTypeId: 'type-1',
            priority: 'Medium',
            description: 'Test incident',
          },
          {
            sub: userId,
            role: 'it_rep',
            orgId: itdbOrg.id,
          },
        );

        // Assert: incident was created successfully
        expect(incident).toBeDefined();
        expect(incident.examFieldId).toBe(assignedFieldId);
        expect(incidentRepository.create).toHaveBeenCalled();
      }),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 9: Incident submission for unassigned field is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(deviceAssignmentArbitrary, async (data) => {
        const { userId, assignedFieldIds, unassignedFieldIds } = data;

        // Pick a random unassigned field
        const unassignedFieldId = unassignedFieldIds[0];

        // Build mock assignments
        const assignments = assignedFieldIds.map((fieldId) =>
          makeAssignment(userId, fieldId),
        );

        // Mock ITDB org
        const itdbOrg = makeOrganization('itdb-org-id', 'ITDB');

        // Setup mocks
        (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue(assignments);
        (organizationRepository.findByName as jest.Mock).mockResolvedValue(itdbOrg);

        // Act & Assert: submission for unassigned field is rejected
        await expect(
          incidentService.createIncident(
            {
              examFieldId: unassignedFieldId,
              incidentTypeId: 'type-1',
              priority: 'Medium',
              description: 'Test incident',
            },
            {
              sub: userId,
              role: 'it_rep',
              orgId: itdbOrg.id,
            },
          ),
        ).rejects.toMatchObject({
          statusCode: 403,
          code: 'EXAM_FIELD_NOT_ASSIGNED',
        });

        // Assert: incident was NOT created
        expect(incidentRepository.create).not.toHaveBeenCalled();
      }),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 9 (edge case): Empty assignment returns empty exam fields', async () => {
    const userId = 'user-no-assignments';

    (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue([]);
    (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([]);
    (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

    const syncData = await syncService.getMobileSyncData(userId);

    expect(syncData.examFields).toEqual([]);
    expect(examFieldRepository.findById).not.toHaveBeenCalled();
  });

  it('Property 9 (edge case): Single assignment returns single exam field', async () => {
    const userId = 'user-single-assignment';
    const fieldId = 'field-1';

    const assignment = makeAssignment(userId, fieldId);
    const field = makeExamField(fieldId, 'Field A');

    (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue([]);
    (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([assignment]);
    (examFieldRepository.findById as jest.Mock).mockResolvedValue(field);
    (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

    const syncData = await syncService.getMobileSyncData(userId);

    expect(syncData.examFields).toEqual([field]);
    expect(syncData.examFields).toHaveLength(1);
  });

  it('Property 9 (edge case): Incident submission with no assignments is always rejected', async () => {
    const userId = 'user-no-assignments';
    const fieldId = 'any-field';

    const itdbOrg = makeOrganization('itdb-org-id', 'ITDB');

    (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue([]);
    (organizationRepository.findByName as jest.Mock).mockResolvedValue(itdbOrg);

    await expect(
      incidentService.createIncident(
        {
          examFieldId: fieldId,
          incidentTypeId: 'type-1',
          priority: 'Medium',
          description: 'Test incident',
        },
        {
          sub: userId,
          role: 'it_rep',
          orgId: itdbOrg.id,
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'EXAM_FIELD_NOT_ASSIGNED',
    });

    expect(incidentRepository.create).not.toHaveBeenCalled();
  });

  it('Property 9: Multiple assignments return all assigned fields in any order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          assignedFieldIds: fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }).map((ids) => {
            return Array.from(new Set(ids));
          }),
        }),
        async (data) => {
          const { userId, assignedFieldIds } = data;

          const assignments = assignedFieldIds.map((fieldId) =>
            makeAssignment(userId, fieldId),
          );

          const fields = assignedFieldIds.map((fieldId, idx) =>
            makeExamField(fieldId, `Field-${idx}`),
          );

          (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue([]);
          (examCenterAssignmentRepository.findByUser as jest.Mock).mockResolvedValue(assignments);
          (examFieldRepository.findById as jest.Mock).mockImplementation(async (id: string) => {
            return fields.find((f) => f.id === id) ?? null;
          });
          (notificationRepository.findUnreadByUser as jest.Mock).mockResolvedValue([]);

          const syncData = await syncService.getMobileSyncData(userId);

          // Assert: all assigned fields are returned
          const returnedFieldIds = new Set(syncData.examFields.map((f) => f.id));
          const assignedSet = new Set(assignedFieldIds);

          expect(syncData.examFields.length).toBe(assignedFieldIds.length);
          for (const fieldId of assignedSet) {
            expect(returnedFieldIds.has(fieldId)).toBe(true);
          }
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});
