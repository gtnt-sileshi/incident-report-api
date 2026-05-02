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

// Mock the repository
jest.mock('../../src/catalog/incident-type.repository');

import { incidentTypeRepository } from '../../src/catalog/incident-type.repository';
import { incidentTypeService } from '../../src/catalog/incident-type.service';
import { IncidentType } from '../../src/db/schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a mock IncidentType object from partial data.
 */
function makeIncidentType(
  id: string,
  name: string,
  isActive: boolean,
): IncidentType {
  return {
    id,
    name,
    defaultPriority: 'Medium',
    description: null,
    isActive,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

// ─── P14: Inactive Incident Types Excluded from Mobile Catalog ───────────────

/**
 * Property-Based Test for Inactive Incident Types Excluded from Mobile Catalog
 *
 * **Validates: Requirements 19.5, 19.6**
 *
 * Property 14: Inactive Incident Types Excluded from Mobile Catalog
 *
 * For any incident type with is_active = false, the mobile sync endpoint SHALL
 * not include that type in the catalog response. For any incident type with
 * is_active = true, it SHALL appear in the catalog response. The mobile catalog
 * at any point in time SHALL contain exactly the set of active incident types.
 */
describe('Property Test: Inactive Incident Types Excluded from Mobile Catalog (P14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Arbitrary: generate a catalog state with mixed active/inactive types
  const catalogStateArbitrary = fc
    .array(
      fc.record({
        id: fc.uuid(),
        isActive: fc.boolean(),
        nameSuffix: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { minLength: 0, maxLength: 20 },
    )
    .map((entries) => {
      // Ensure unique IDs and names
      const seen = new Set<string>();
      return entries
        .filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        })
        .map((e, idx) => makeIncidentType(e.id, `Type-${idx}-${e.nameSuffix}`, e.isActive));
    });

  it('Property 14: listIncidentTypes(false) returns exactly the active set', async () => {
    await fc.assert(
      fc.asyncProperty(catalogStateArbitrary, async (allTypes) => {
        const activeTypes = allTypes.filter((t) => t.isActive);
        const inactiveTypes = allTypes.filter((t) => !t.isActive);

        // Mock: findAll(false) returns only active types
        (incidentTypeRepository.findAll as jest.Mock).mockImplementation(
          async (includeInactive: boolean) => {
            if (includeInactive) return allTypes;
            return activeTypes;
          },
        );

        // Mock: countReferences returns 0 for all (not relevant for listing)
        (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
          incidents: 0,
          routingRules: 0,
        });

        // Act: list active only
        const result = await incidentTypeService.listIncidentTypes(false);

        // Assert: result contains exactly the active types
        const resultIds = new Set(result.map((t) => t.id));
        const activeIds = new Set(activeTypes.map((t) => t.id));
        const inactiveIds = new Set(inactiveTypes.map((t) => t.id));

        // Every active type must appear
        for (const id of activeIds) {
          expect(resultIds.has(id)).toBe(true);
        }

        // No inactive type must appear
        for (const id of inactiveIds) {
          expect(resultIds.has(id)).toBe(false);
        }

        // Sizes must match
        expect(result.length).toBe(activeTypes.length);
      }),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 14: listIncidentTypes(true) returns all types (active + inactive)', async () => {
    await fc.assert(
      fc.asyncProperty(catalogStateArbitrary, async (allTypes) => {
        const activeTypes = allTypes.filter((t) => t.isActive);

        // Mock: findAll(true) returns all types
        (incidentTypeRepository.findAll as jest.Mock).mockImplementation(
          async (includeInactive: boolean) => {
            if (includeInactive) return allTypes;
            return activeTypes;
          },
        );

        // Mock: countReferences returns 0 for all
        (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
          incidents: 0,
          routingRules: 0,
        });

        // Act: list all including inactive
        const result = await incidentTypeService.listIncidentTypes(true);

        // Assert: result contains all types
        const resultIds = new Set(result.map((t) => t.id));
        const allIds = new Set(allTypes.map((t) => t.id));

        expect(result.length).toBe(allTypes.length);
        for (const id of allIds) {
          expect(resultIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 14 (edge case): Empty catalog returns empty list for both active-only and all', async () => {
    (incidentTypeRepository.findAll as jest.Mock).mockResolvedValue([]);
    (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
      incidents: 0,
      routingRules: 0,
    });

    const activeOnly = await incidentTypeService.listIncidentTypes(false);
    const all = await incidentTypeService.listIncidentTypes(true);

    expect(activeOnly).toEqual([]);
    expect(all).toEqual([]);
  });

  it('Property 14 (edge case): All-inactive catalog returns empty list for active-only', async () => {
    const allInactive = [
      makeIncidentType('id-1', 'Type A', false),
      makeIncidentType('id-2', 'Type B', false),
      makeIncidentType('id-3', 'Type C', false),
    ];

    (incidentTypeRepository.findAll as jest.Mock).mockImplementation(
      async (includeInactive: boolean) => {
        if (includeInactive) return allInactive;
        return [];
      },
    );
    (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
      incidents: 0,
      routingRules: 0,
    });

    const activeOnly = await incidentTypeService.listIncidentTypes(false);
    const all = await incidentTypeService.listIncidentTypes(true);

    expect(activeOnly).toHaveLength(0);
    expect(all).toHaveLength(3);
  });

  it('Property 14 (edge case): All-active catalog returns all types for active-only', async () => {
    const allActive = [
      makeIncidentType('id-1', 'Type A', true),
      makeIncidentType('id-2', 'Type B', true),
    ];

    (incidentTypeRepository.findAll as jest.Mock).mockImplementation(
      async (includeInactive: boolean) => {
        if (includeInactive) return allActive;
        return allActive;
      },
    );
    (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
      incidents: 0,
      routingRules: 0,
    });

    const activeOnly = await incidentTypeService.listIncidentTypes(false);
    expect(activeOnly).toHaveLength(2);
    expect(activeOnly.every((t) => t.isActive)).toBe(true);
  });
});

// ─── P15: Incident Type Deletion Referential Integrity ───────────────────────

/**
 * Property-Based Test for Incident Type Deletion Referential Integrity
 *
 * **Validates: Requirements 19.7**
 *
 * Property 15: Incident Type Deletion Referential Integrity
 *
 * For any incident type that is referenced by at least one existing Routing_Rule
 * or at least one historical incident, any attempt to delete that incident type
 * SHALL be rejected with a 409 validation error listing the conflicting references.
 * The incident type SHALL remain in the catalog until all references are removed
 * or the type is set to inactive instead.
 */
describe('Property Test: Incident Type Deletion Referential Integrity (P15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Arbitrary: generate an incident type with varying reference counts
  const incidentTypeWithRefsArbitrary = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    routingRuleCount: fc.integer({ min: 0, max: 5 }),
    incidentCount: fc.integer({ min: 0, max: 10 }),
  });

  it('Property 15: Deletion is rejected (409) iff references > 0', async () => {
    await fc.assert(
      fc.asyncProperty(incidentTypeWithRefsArbitrary, async (data) => {
        const { id, name, routingRuleCount, incidentCount } = data;
        const hasReferences = routingRuleCount > 0 || incidentCount > 0;

        const mockType = makeIncidentType(id, name, true);

        // Reset mocks for each iteration
        jest.clearAllMocks();

        // Mock: findById returns the type
        (incidentTypeRepository.findById as jest.Mock).mockResolvedValue(mockType);

        // Mock: countReferences returns the generated counts
        (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
          incidents: incidentCount,
          routingRules: routingRuleCount,
        });

        // Mock: setActive (only called when no references)
        (incidentTypeRepository.setActive as jest.Mock).mockResolvedValue({
          ...mockType,
          isActive: false,
        });

        if (hasReferences) {
          // Assert: deletion is rejected with 409
          await expect(incidentTypeService.softDeleteIncidentType(id)).rejects.toMatchObject({
            statusCode: 409,
            code: 'INCIDENT_TYPE_HAS_REFERENCES',
          });

          // Assert: setActive was NOT called (type remains in catalog)
          expect(incidentTypeRepository.setActive).not.toHaveBeenCalled();
        } else {
          // Assert: deletion succeeds (soft delete)
          const result = await incidentTypeService.softDeleteIncidentType(id);
          expect(result.isActive).toBe(false);

          // Assert: setActive was called with false
          expect(incidentTypeRepository.setActive).toHaveBeenCalledWith(id, false);
        }
      }),
      { numRuns: 200, verbose: true },
    );
  });

  it('Property 15: Rejection includes conflict details with counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          routingRuleCount: fc.integer({ min: 1, max: 5 }),
          incidentCount: fc.integer({ min: 0, max: 10 }),
        }),
        async (data) => {
          const { id, name, routingRuleCount, incidentCount } = data;
          const mockType = makeIncidentType(id, name, true);

          (incidentTypeRepository.findById as jest.Mock).mockResolvedValue(mockType);
          (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
            incidents: incidentCount,
            routingRules: routingRuleCount,
          });

          let caughtError: unknown;
          try {
            await incidentTypeService.softDeleteIncidentType(id);
          } catch (err) {
            caughtError = err;
          }

          expect(caughtError).toBeDefined();
          const error = caughtError as { statusCode: number; code: string; details: unknown };
          expect(error.statusCode).toBe(409);
          expect(error.code).toBe('INCIDENT_TYPE_HAS_REFERENCES');
          expect(error.details).toMatchObject({
            routingRuleCount: routingRuleCount,
            incidentCount: incidentCount,
          });
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 15: Deletion succeeds iff both routing rules and incidents are 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async (data) => {
          const { id, name } = data;
          const mockType = makeIncidentType(id, name, true);

          (incidentTypeRepository.findById as jest.Mock).mockResolvedValue(mockType);
          (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
            incidents: 0,
            routingRules: 0,
          });
          (incidentTypeRepository.setActive as jest.Mock).mockResolvedValue({
            ...mockType,
            isActive: false,
          });

          const result = await incidentTypeService.softDeleteIncidentType(id);

          // Assert: soft delete succeeded
          expect(result.isActive).toBe(false);
          expect(incidentTypeRepository.setActive).toHaveBeenCalledWith(id, false);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 15 (edge case): Deletion of non-existent type returns 404', async () => {
    (incidentTypeRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      incidentTypeService.softDeleteIncidentType('non-existent-id'),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'INCIDENT_TYPE_NOT_FOUND',
    });

    // countReferences should not be called if type doesn't exist
    expect(incidentTypeRepository.countReferences).not.toHaveBeenCalled();
  });

  it('Property 15 (edge case): Only routing rule references block deletion', async () => {
    const id = 'type-with-routing-rules-only';
    const mockType = makeIncidentType(id, 'Network Issue', true);

    (incidentTypeRepository.findById as jest.Mock).mockResolvedValue(mockType);
    (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
      incidents: 0,
      routingRules: 3,
    });

    await expect(incidentTypeService.softDeleteIncidentType(id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INCIDENT_TYPE_HAS_REFERENCES',
    });
  });

  it('Property 15 (edge case): Only incident references block deletion', async () => {
    const id = 'type-with-incidents-only';
    const mockType = makeIncidentType(id, 'Power Outage', true);

    (incidentTypeRepository.findById as jest.Mock).mockResolvedValue(mockType);
    (incidentTypeRepository.countReferences as jest.Mock).mockResolvedValue({
      incidents: 5,
      routingRules: 0,
    });

    await expect(incidentTypeService.softDeleteIncidentType(id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INCIDENT_TYPE_HAS_REFERENCES',
    });
  });
});
