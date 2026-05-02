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
jest.mock('../../src/routing/routing-rule.repository');

import { routingRuleRepository } from '../../src/routing/routing-rule.repository';
import { routingRuleService } from '../../src/routing/routing-rule.service';
import { RoutingRule } from '../../src/db/schema';

/**
 * Property-Based Test for Routing Rule Pre-Population (P18)
 *
 * **Validates: Requirements 17.2**
 *
 * Property 18: Routing Rule Pre-Population
 *
 * For any incident type T that has an active Routing_Rule mapping it to a
 * target Assigned_Body B, evaluateRule(T) SHALL return that rule.
 * If no active routing rule exists for T, evaluateRule(T) SHALL return null.
 */
describe('Property Test: Routing Rule Pre-Population (P18)', () => {
  // Helper to build a RoutingRule object
  const makeRule = (
    id: string,
    incidentTypeId: string,
    targetOrgId: string | null,
    targetUserId: string | null,
    autoAssign: boolean,
    isActive: boolean,
  ): RoutingRule => ({
    id,
    incidentTypeId,
    targetOrgId,
    targetUserId,
    autoAssign,
    isActive,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 18: evaluateRule returns the active rule when one exists for the incident type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // incidentTypeId
        async (incidentTypeId) => {
          // Generate a rule for this incident type
          const rule = makeRule(
            'rule-id-' + incidentTypeId,
            incidentTypeId,
            'org-id-' + incidentTypeId,
            null,
            false,
            true,
          );

          // Mock the repository to return this rule
          (routingRuleRepository.findByIncidentType as jest.Mock).mockResolvedValue(rule);

          // Act
          const result = await routingRuleService.evaluateRule(incidentTypeId);

          // Assert: the rule is returned
          expect(result).not.toBeNull();
          expect(result!.id).toBe(rule.id);
          expect(result!.incidentTypeId).toBe(incidentTypeId);

          // Assert: repository was called with the correct incidentTypeId
          expect(routingRuleRepository.findByIncidentType).toHaveBeenCalledWith(incidentTypeId);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 18: evaluateRule returns null when no active rule exists for the incident type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // incidentTypeId with no rule
        async (incidentTypeId) => {
          // Mock the repository to return null (no rule for this type)
          (routingRuleRepository.findByIncidentType as jest.Mock).mockResolvedValue(null);

          // Act
          const result = await routingRuleService.evaluateRule(incidentTypeId);

          // Assert: null is returned
          expect(result).toBeNull();

          // Assert: repository was called with the correct incidentTypeId
          expect(routingRuleRepository.findByIncidentType).toHaveBeenCalledWith(incidentTypeId);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });

  it('Property 18: evaluateRule returns the rule iff an active rule exists — mixed scenario', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a set of incident type IDs, some with rules and some without
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }).chain((incidentTypeIds) => {
          // Deduplicate
          const uniqueIds = Array.from(new Set(incidentTypeIds));
          if (uniqueIds.length < 2) {
            // Ensure at least 2 unique IDs
            return fc.constant({
              withRule: [uniqueIds[0] ?? 'type-a'],
              withoutRule: ['type-b'],
            });
          }
          // Split into two halves: first half gets rules, second half does not
          const mid = Math.floor(uniqueIds.length / 2);
          return fc.constant({
            withRule: uniqueIds.slice(0, mid),
            withoutRule: uniqueIds.slice(mid),
          });
        }),
        async ({ withRule, withoutRule }) => {
          // Build a map of incidentTypeId → rule for types that have rules
          const ruleMap = new Map<string, RoutingRule>();
          for (const typeId of withRule) {
            ruleMap.set(
              typeId,
              makeRule('rule-' + typeId, typeId, 'org-' + typeId, null, false, true),
            );
          }

          // Mock the repository: return rule if it exists, null otherwise
          (routingRuleRepository.findByIncidentType as jest.Mock).mockImplementation(
            async (incidentTypeId: string) => ruleMap.get(incidentTypeId) ?? null,
          );

          // Assert: types with rules return the correct rule
          for (const typeId of withRule) {
            const result = await routingRuleService.evaluateRule(typeId);
            expect(result).not.toBeNull();
            expect(result!.incidentTypeId).toBe(typeId);
          }

          // Assert: types without rules return null
          for (const typeId of withoutRule) {
            const result = await routingRuleService.evaluateRule(typeId);
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 18 (edge case): evaluateRule with targetUserId-only rule returns the rule', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // incidentTypeId
        fc.uuid(), // targetUserId
        async (incidentTypeId, targetUserId) => {
          const rule = makeRule(
            'rule-user-' + incidentTypeId,
            incidentTypeId,
            null,
            targetUserId,
            true,
            true,
          );

          (routingRuleRepository.findByIncidentType as jest.Mock).mockResolvedValue(rule);

          const result = await routingRuleService.evaluateRule(incidentTypeId);

          expect(result).not.toBeNull();
          expect(result!.targetUserId).toBe(targetUserId);
          expect(result!.targetOrgId).toBeNull();
          expect(result!.autoAssign).toBe(true);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  it('Property 18 (edge case): evaluateRule with both targetOrgId and targetUserId returns the rule', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // incidentTypeId
        fc.uuid(), // targetOrgId
        fc.uuid(), // targetUserId
        async (incidentTypeId, targetOrgId, targetUserId) => {
          const rule = makeRule(
            'rule-both-' + incidentTypeId,
            incidentTypeId,
            targetOrgId,
            targetUserId,
            false,
            true,
          );

          (routingRuleRepository.findByIncidentType as jest.Mock).mockResolvedValue(rule);

          const result = await routingRuleService.evaluateRule(incidentTypeId);

          expect(result).not.toBeNull();
          expect(result!.targetOrgId).toBe(targetOrgId);
          expect(result!.targetUserId).toBe(targetUserId);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });
});
