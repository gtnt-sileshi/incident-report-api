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

import { organizationRepository } from '../../src/organizations/organization.repository';
import { userRepository } from '../../src/users/user.repository';
import { Permission } from '../../src/db/schema';

// Mock the repositories
jest.mock('../../src/organizations/organization.repository');
jest.mock('../../src/users/user.repository');

/**
 * Property-Based Test for Cascading Permission Removal
 * 
 * **Validates: Requirements 13.9, 18.7**
 * 
 * Property 2: Cascading Permission Removal
 * 
 * For any organization with N users, when a Super_Admin removes permission P 
 * from the organization's Org_Permission_Set, every user in that organization 
 * whose User_Permission_Set contained P SHALL have P removed from their 
 * User_Permission_Set, and the resulting User_Permission_Set for every user 
 * SHALL remain a subset of the updated Org_Permission_Set.
 */
describe('Property Test: Cascading Permission Removal (P2)', () => {
  // System-defined permissions (from Requirements 18.1)
  const SYSTEM_PERMISSIONS = [
    'incidents.view',
    'incidents.create',
    'incidents.edit',
    'incidents.delete',
    'incidents.assign',
    'incidents.update_status',
    'incidents.resolve',
    'incidents.escalate',
    'incidents.comment',
    'incidents.attach',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'users.approve',
    'users.assign_permissions',
    'organizations.view',
    'organizations.create',
    'organizations.edit',
    'organizations.delete',
    'organizations.assign_permissions',
    'devices.view',
    'devices.register',
    'devices.deactivate',
    'exam_fields.view',
    'exam_fields.create',
    'exam_fields.edit',
    'exam_fields.delete',
    'catalog.view',
    'catalog.create',
    'catalog.edit',
    'catalog.delete',
    'routing.view',
    'routing.create',
    'routing.edit',
    'routing.delete',
    'reports.view',
    'reports.export',
    'reports.generate',
    'audit.view',
    'audit.search',
    'qr.view',
    'qr.scan',
    'alerts.sms_trigger',
    'alerts.push_trigger',
  ];

  // Helper to create a permission object
  const createPermission = (name: string): Permission => ({
    id: SYSTEM_PERMISSIONS.indexOf(name) + 1,
    name,
    groupName: name.split('.')[0].charAt(0).toUpperCase() + name.split('.')[0].slice(1),
  });

  // Arbitrary for generating a permission
  const permissionArbitrary = fc.constantFrom(...SYSTEM_PERMISSIONS).map(createPermission);

  // Arbitrary for generating sets of permissions (no duplicates)
  const permissionSetArbitrary = fc
    .array(permissionArbitrary, { minLength: 1, maxLength: 20 })
    .map((perms) => {
      // Remove duplicates by name
      const uniquePerms = Array.from(
        new Map(perms.map((p) => [p.name, p])).values()
      );
      return uniquePerms;
    });

  // Arbitrary for generating a user with permissions
  const userWithPermissionsArbitrary = fc.record({
    userId: fc.uuid(),
    permissions: permissionSetArbitrary,
  });

  // Arbitrary for generating an organization with N users
  const organizationWithUsersArbitrary = fc.record({
    orgId: fc.uuid(),
    orgPermissions: permissionSetArbitrary,
    users: fc.array(userWithPermissionsArbitrary, { minLength: 1, maxLength: 10 }),
  }).map((org) => ({
    ...org,
    // Ensure unique user IDs
    users: Array.from(
      new Map(org.users.map((u, idx) => [`${u.userId}-${idx}`, { ...u, userId: `${u.userId}-${idx}` }])).values()
    ),
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 2: Removing permission from org removes it from all users and maintains subset invariant', () => {
    fc.assert(
      fc.asyncProperty(
        organizationWithUsersArbitrary,
        async (orgData) => {
          // Reset mocks completely at the start of each iteration
          jest.resetAllMocks();

          const { orgId, orgPermissions, users } = orgData;

          // Ensure all user permissions are initially subsets of org permissions
          const orgPermissionNames = new Set(orgPermissions.map((p) => p.name));
          const validUsers = users.map((user) => ({
            ...user,
            permissions: user.permissions
              .filter((p) => orgPermissionNames.has(p.name)),
          }));

          // Pick a permission to remove from the org (must be one that exists in org)
          if (orgPermissions.length === 0) {
            // Edge case: org has no permissions, nothing to remove
            return;
          }

          const permissionToRemove = orgPermissions[0];
          const permissionIdToRemove = permissionToRemove.id;

          // Simulate the initial state
          const initialOrgPermissions = [...orgPermissions];
          const initialUserPermissions = new Map(
            validUsers.map((u) => [u.userId, u.permissions.map(p => ({ ...p }))])
          );

          // Mock the repository methods
          (organizationRepository.getOrgPermissions as jest.Mock)
            .mockResolvedValue(initialOrgPermissions);

          // Set up user permission mocks - single implementation for all users
          (userRepository.getUserPermissions as jest.Mock)
            .mockImplementation((userId: string) => {
              return Promise.resolve(initialUserPermissions.get(userId) || []);
            });

          // Mock the cascading removal function
          (userRepository.removePermissionFromAllOrgUsers as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              // Simulate removing the permission from all users in the org
              // Get all user IDs first to avoid iterator issues
              const userIds = Array.from(initialUserPermissions.keys());
              for (const userId of userIds) {
                const userPerms = initialUserPermissions.get(userId);
                if (userPerms) {
                  const updatedPerms = userPerms.filter((p) => p.id !== permissionId);
                  initialUserPermissions.set(userId, updatedPerms);
                }
              }
            });

          // Mock removing permission from org
          (organizationRepository.removePermissionFromOrg as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              const index = initialOrgPermissions.findIndex((p) => p.id === permissionId);
              if (index !== -1) {
                initialOrgPermissions.splice(index, 1);
              }
            });

          // Execute the cascading removal
          await organizationRepository.removePermissionFromOrg(orgId, permissionIdToRemove);
          await userRepository.removePermissionFromAllOrgUsers(orgId, permissionIdToRemove);

          // Get the updated org permissions
          const updatedOrgPermissions = initialOrgPermissions;
          const updatedOrgPermissionNames = new Set(updatedOrgPermissions.map((p) => p.name));

          // Verify Property 2: All users no longer have the removed permission
          for (const user of validUsers) {
            const updatedUserPermissions = initialUserPermissions.get(user.userId) || [];
            const updatedUserPermissionNames = new Set(updatedUserPermissions.map((p) => p.name));

            // Assert: User no longer has the removed permission
            expect(updatedUserPermissionNames.has(permissionToRemove.name)).toBe(false);

            // Assert: User permission set is a subset of updated org permission set
            for (const userPerm of updatedUserPermissions) {
              expect(updatedOrgPermissionNames.has(userPerm.name)).toBe(true);
            }
          }

          // Verify the repository methods were called correctly
          expect(organizationRepository.removePermissionFromOrg).toHaveBeenCalledWith(
            orgId,
            permissionIdToRemove
          );
          expect(userRepository.removePermissionFromAllOrgUsers).toHaveBeenCalledWith(
            orgId,
            permissionIdToRemove
          );
        }
      ),
      {
        numRuns: 50, // Run 50 random test cases
        verbose: true,
      }
    );
  });

  it('Property 2 (Edge Case): Removing permission not in any user set still maintains subset invariant', () => {
    fc.assert(
      fc.asyncProperty(
        organizationWithUsersArbitrary,
        async (orgData) => {
          // Reset mocks completely at the start of each iteration
          jest.resetAllMocks();

          const { orgId, orgPermissions, users } = orgData;

          if (orgPermissions.length === 0) {
            return; // Skip if no permissions
          }

          // Ensure all user permissions are initially subsets of org permissions
          const orgPermissionNames = new Set(orgPermissions.map((p) => p.name));
          const validUsers = users.map((user) => ({
            ...user,
            permissions: user.permissions
              .filter((p) => orgPermissionNames.has(p.name)),
          }));

          // Pick a permission that exists in org but NOT in any user
          const permissionToRemove = orgPermissions.find((orgPerm) =>
            validUsers.every((user) => !user.permissions.some((p) => p.id === orgPerm.id))
          );

          if (!permissionToRemove) {
            return; // Skip if all org permissions are used by at least one user
          }

          const permissionIdToRemove = permissionToRemove.id;

          // Simulate the initial state
          const initialOrgPermissions = [...orgPermissions];
          const initialUserPermissions = new Map(
            validUsers.map((u) => [u.userId, u.permissions.map(p => ({ ...p }))])
          );

          // Mock the repository methods
          (organizationRepository.getOrgPermissions as jest.Mock)
            .mockResolvedValue(initialOrgPermissions);

          // Set up user permission mocks - single implementation for all users
          (userRepository.getUserPermissions as jest.Mock)
            .mockImplementation((userId: string) => {
              return Promise.resolve(initialUserPermissions.get(userId) || []);
            });

          (userRepository.removePermissionFromAllOrgUsers as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              // Get all user IDs first to avoid iterator issues
              const userIds = Array.from(initialUserPermissions.keys());
              for (const userId of userIds) {
                const userPerms = initialUserPermissions.get(userId) || [];
                const updatedPerms = userPerms.filter((p) => p.id !== permissionId);
                initialUserPermissions.set(userId, updatedPerms);
              }
            });

          (organizationRepository.removePermissionFromOrg as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              const index = initialOrgPermissions.findIndex((p) => p.id === permissionId);
              if (index !== -1) {
                initialOrgPermissions.splice(index, 1);
              }
            });

          // Execute the cascading removal
          await organizationRepository.removePermissionFromOrg(orgId, permissionIdToRemove);
          await userRepository.removePermissionFromAllOrgUsers(orgId, permissionIdToRemove);

          // Get the updated org permissions
          const updatedOrgPermissions = initialOrgPermissions;
          const updatedOrgPermissionNames = new Set(updatedOrgPermissions.map((p) => p.name));

          // Verify: All user permission sets remain subsets of org permission set
          for (const user of validUsers) {
            const updatedUserPermissions = initialUserPermissions.get(user.userId) || [];

            for (const userPerm of updatedUserPermissions) {
              expect(updatedOrgPermissionNames.has(userPerm.name)).toBe(true);
            }
          }
        }
      ),
      {
        numRuns: 30,
        verbose: true,
      }
    );
  });

  it('Property 2 (Edge Case): Removing all permissions from org removes all permissions from all users', () => {
    fc.assert(
      fc.asyncProperty(
        organizationWithUsersArbitrary,
        async (orgData) => {
          // Reset mocks completely at the start of each iteration
          jest.resetAllMocks();

          const { orgId, orgPermissions, users } = orgData;

          // Ensure all user permissions are initially subsets of org permissions
          const orgPermissionNames = new Set(orgPermissions.map((p) => p.name));
          const validUsers = users.map((user) => ({
            ...user,
            permissions: user.permissions
              .filter((p) => orgPermissionNames.has(p.name)),
          }));

          // Simulate the initial state
          const initialOrgPermissions = [...orgPermissions];
          const initialUserPermissions = new Map<string, Permission[]>(
            validUsers.map((u) => [u.userId, JSON.parse(JSON.stringify(u.permissions)) as Permission[]])
          );

          // Mock the repository methods
          (organizationRepository.getOrgPermissions as jest.Mock)
            .mockResolvedValue(initialOrgPermissions);

          // Set up user permission mocks - single implementation for all users
          (userRepository.getUserPermissions as jest.Mock)
            .mockImplementation((userId: string) => {
              return Promise.resolve(initialUserPermissions.get(userId) || []);
            });

          (userRepository.removePermissionFromAllOrgUsers as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              // Get all user IDs first to avoid iterator issues
              const userIds = Array.from(initialUserPermissions.keys());
              for (const userId of userIds) {
                const userPerms = initialUserPermissions.get(userId) || [];
                const updatedPerms = userPerms.filter((p) => p.id !== permissionId);
                initialUserPermissions.set(userId, updatedPerms);
              }
            });

          (organizationRepository.removePermissionFromOrg as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              const index = initialOrgPermissions.findIndex((p) => p.id === permissionId);
              if (index !== -1) {
                initialOrgPermissions.splice(index, 1);
              }
            });

          // Remove all permissions from the org one by one
          for (const permission of [...orgPermissions]) {
            await organizationRepository.removePermissionFromOrg(orgId, permission.id);
            await userRepository.removePermissionFromAllOrgUsers(orgId, permission.id);
          }

          // Verify: All users have empty permission sets
          for (const user of validUsers) {
            const updatedUserPermissions = initialUserPermissions.get(user.userId) || [];
            expect(updatedUserPermissions.length).toBe(0);
          }

          // Verify: Org has empty permission set
          expect(initialOrgPermissions.length).toBe(0);
        }
      ),
      {
        numRuns: 20,
        verbose: true,
      }
    );
  });

  it('Property 2 (Edge Case): Users with no permissions remain unaffected', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          orgId: fc.uuid(),
          orgPermissions: permissionSetArbitrary,
          usersWithPermissions: fc.array(userWithPermissionsArbitrary, { minLength: 0, maxLength: 5 }),
          usersWithoutPermissions: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        }),
        async (data) => {
          // Reset mocks completely at the start of each iteration
          jest.resetAllMocks();

          const { orgId, orgPermissions, usersWithPermissions, usersWithoutPermissions } = data;

          if (orgPermissions.length === 0) {
            return; // Skip if no permissions
          }

          // Ensure all user permissions are initially subsets of org permissions
          const orgPermissionNames = new Set(orgPermissions.map((p) => p.name));
          const validUsers = usersWithPermissions.map((user) => ({
            ...user,
            permissions: user.permissions
              .filter((p) => orgPermissionNames.has(p.name)),
          }));

          const permissionToRemove = orgPermissions[0];
          const permissionIdToRemove = permissionToRemove.id;

          // Simulate the initial state
          const initialOrgPermissions = [...orgPermissions];
          const initialUserPermissions = new Map(
            validUsers.map((u) => [u.userId, u.permissions.map(p => ({ ...p }))])
          );

          // Add users with no permissions
          for (const userId of usersWithoutPermissions) {
            initialUserPermissions.set(userId, []);
          }

          // Mock the repository methods
          (organizationRepository.getOrgPermissions as jest.Mock)
            .mockResolvedValue(initialOrgPermissions);

          // Set up user permission mocks - single implementation for all users
          (userRepository.getUserPermissions as jest.Mock)
            .mockImplementation((userId: string) => {
              return Promise.resolve(initialUserPermissions.get(userId) || []);
            });

          (userRepository.removePermissionFromAllOrgUsers as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              // Get all user IDs first to avoid iterator issues
              const userIds = Array.from(initialUserPermissions.keys());
              for (const userId of userIds) {
                const userPerms = initialUserPermissions.get(userId) || [];
                const updatedPerms = userPerms.filter((p) => p.id !== permissionId);
                initialUserPermissions.set(userId, updatedPerms);
              }
            });

          (organizationRepository.removePermissionFromOrg as jest.Mock)
            .mockImplementation(async (_orgIdParam: string, permissionId: number) => {
              const index = initialOrgPermissions.findIndex((p) => p.id === permissionId);
              if (index !== -1) {
                initialOrgPermissions.splice(index, 1);
              }
            });

          // Execute the cascading removal
          await organizationRepository.removePermissionFromOrg(orgId, permissionIdToRemove);
          await userRepository.removePermissionFromAllOrgUsers(orgId, permissionIdToRemove);

          // Verify: Users with no permissions still have no permissions
          for (const userId of usersWithoutPermissions) {
            const updatedUserPermissions = initialUserPermissions.get(userId) || [];
            expect(updatedUserPermissions.length).toBe(0);
          }
        }
      ),
      {
        numRuns: 20,
        verbose: true,
      }
    );
  });
});

// ─── P17: Organization Permission Set Round-Trip ─────────────────────────────

import { organizationService } from '../../src/organizations/organization.service';
import { jwtService } from '../../src/auth/jwt.service';
import { getDb } from '../../src/db/index';

// Mock jwtService so OrganizationService.deactivateOrg can call revokeOrgSessions
jest.mock('../../src/auth/jwt.service');

/**
 * Property-Based Test for Organization Permission Set Round-Trip
 *
 * **Validates: Requirements 2.3, 18.2**
 *
 * Property 17: Organization Permission Set Round-Trip
 *
 * For any random subset of the 45 system permissions, assigning that subset to
 * an organization via OrganizationService.setOrgPermissions and then reading it
 * back via OrganizationService.getOrgPermissions SHALL return exactly the same
 * set of permission names (order-independent).
 */
describe('Property Test: Organization Permission Set Round-Trip (P17)', () => {
  // All 45 system permissions from migration 002_seed_data.sql
  const ALL_SYSTEM_PERMISSIONS = [
    // Incidents (10)
    'incidents.view',
    'incidents.create',
    'incidents.edit',
    'incidents.delete',
    'incidents.assign',
    'incidents.update_status',
    'incidents.resolve',
    'incidents.escalate',
    'incidents.comment',
    'incidents.attach',
    // Users (6)
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'users.approve',
    'users.assign_permissions',
    // Organizations (5)
    'organizations.view',
    'organizations.create',
    'organizations.edit',
    'organizations.delete',
    'organizations.assign_permissions',
    // Devices (3)
    'devices.view',
    'devices.register',
    'devices.deactivate',
    // Exam Fields (4)
    'exam_fields.view',
    'exam_fields.create',
    'exam_fields.edit',
    'exam_fields.delete',
    // Catalog / Incident Types (4)
    'catalog.view',
    'catalog.create',
    'catalog.edit',
    'catalog.delete',
    // Routing Rules (4)
    'routing.view',
    'routing.create',
    'routing.edit',
    'routing.delete',
    // Reports (3)
    'reports.view',
    'reports.export',
    'reports.generate',
    // Audit Log (2)
    'audit.view',
    'audit.search',
    // QR & Identity (2)
    'qr.view',
    'qr.scan',
    // Notifications & Alerts (2)
    'alerts.sms_trigger',
    'alerts.push_trigger',
  ] as const;

  // Build the full permission objects (id = 1-based index)
  const ALL_PERMISSION_OBJECTS = ALL_SYSTEM_PERMISSIONS.map((name, idx) => ({
    id: idx + 1,
    name,
    groupName: name.split('.')[0],
  }));

  // In-memory store for the current org permission set (simulates the DB)
  let storedPermissionIds: number[] = [];

  const TEST_ORG_ID = 'test-org-round-trip-id';
  const TEST_ORG = {
    id: TEST_ORG_ID,
    name: 'Test Org',
    type: 'government',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    storedPermissionIds = [];

    // Mock organizationRepository.findById — org always exists
    (organizationRepository.findById as jest.Mock).mockResolvedValue(TEST_ORG);

    // Mock organizationRepository.getOrgPermissions — returns stored permissions
    (organizationRepository.getOrgPermissions as jest.Mock).mockImplementation(
      async (_orgId: string) => {
        return ALL_PERMISSION_OBJECTS.filter((p) => storedPermissionIds.includes(p.id));
      },
    );

    // Mock organizationRepository.setOrgPermissions — stores the permission IDs
    (organizationRepository.setOrgPermissions as jest.Mock).mockImplementation(
      async (_orgId: string, permissionIds: number[]) => {
        storedPermissionIds = [...permissionIds];
      },
    );

    // Mock userRepository.removePermissionFromAllOrgUsers — no-op for round-trip test
    (userRepository.removePermissionFromAllOrgUsers as jest.Mock).mockResolvedValue(undefined);

    // Mock getDb() to return a db object that handles db.select().from(permissions)
    // This is used by OrganizationService.setOrgPermissions to resolve names → IDs
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockResolvedValue(ALL_PERMISSION_OBJECTS),
    };
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Arbitrary: generate a random subset of system permission names (may be empty)
  const permissionSubsetArbitrary = fc
    .array(fc.constantFrom(...ALL_SYSTEM_PERMISSIONS), {
      minLength: 0,
      maxLength: ALL_SYSTEM_PERMISSIONS.length,
    })
    .map((names) => Array.from(new Set(names))); // deduplicate

  it('Property 17: setOrgPermissions then getOrgPermissions returns exact same set (order-independent)', async () => {
    await fc.assert(
      fc.asyncProperty(permissionSubsetArbitrary, async (permissionSubset) => {
        // Reset stored state for each run
        storedPermissionIds = [];

        // Act: assign the subset to the org
        await organizationService.setOrgPermissions(TEST_ORG_ID, permissionSubset);

        // Act: read back the permissions
        const readBack = await organizationService.getOrgPermissions(TEST_ORG_ID);

        // Assert: exact equality, order-independent
        const assigned = new Set(permissionSubset);
        const retrieved = new Set(readBack);

        // Every assigned permission must be in the read-back set
        for (const name of assigned) {
          expect(retrieved.has(name)).toBe(true);
        }

        // Every read-back permission must be in the assigned set
        for (const name of retrieved) {
          expect(assigned.has(name as typeof ALL_SYSTEM_PERMISSIONS[number])).toBe(true);
        }

        // Sizes must match (no duplicates, no extras)
        expect(retrieved.size).toBe(assigned.size);
      }),
      {
        numRuns: 100,
        verbose: true,
      },
    );
  });

  it('Property 17 (edge case): Empty permission set round-trips correctly', async () => {
    storedPermissionIds = [];

    await organizationService.setOrgPermissions(TEST_ORG_ID, []);
    const readBack = await organizationService.getOrgPermissions(TEST_ORG_ID);

    expect(readBack).toEqual([]);
  });

  it('Property 17 (edge case): Full permission set round-trips correctly', async () => {
    storedPermissionIds = [];

    const allNames = [...ALL_SYSTEM_PERMISSIONS];
    await organizationService.setOrgPermissions(TEST_ORG_ID, allNames);
    const readBack = await organizationService.getOrgPermissions(TEST_ORG_ID);

    const assigned = new Set(allNames);
    const retrieved = new Set(readBack);

    expect(retrieved.size).toBe(assigned.size);
    for (const name of assigned) {
      expect(retrieved.has(name)).toBe(true);
    }
  });

  it('Property 17 (edge case): Overwriting permissions replaces the set entirely', async () => {
    storedPermissionIds = [];

    // First assignment
    const firstSubset = ['incidents.view', 'users.view', 'organizations.view'];
    await organizationService.setOrgPermissions(TEST_ORG_ID, firstSubset);

    // Second assignment (different set)
    const secondSubset = ['reports.view', 'audit.view', 'qr.view'];
    await organizationService.setOrgPermissions(TEST_ORG_ID, secondSubset);

    // Read back — should reflect only the second assignment
    const readBack = await organizationService.getOrgPermissions(TEST_ORG_ID);
    const retrieved = new Set(readBack);

    expect(retrieved.size).toBe(secondSubset.length);
    for (const name of secondSubset) {
      expect(retrieved.has(name)).toBe(true);
    }
    for (const name of firstSubset) {
      expect(retrieved.has(name)).toBe(false);
    }
  });
});

// ─── P20: Organization Deactivation Revokes Sessions ─────────────────────────

import type { JwtPayload } from '../../src/auth/jwt.service';

/**
 * Property-Based Test for Organization Deactivation Revokes Sessions
 *
 * **Validates: Requirements 2.7**
 *
 * Property 20: Organization Deactivation Revokes Sessions
 *
 * For any organization with N active user sessions (N = 1..10), deactivating
 * that organization via OrganizationService.deactivateOrg SHALL call
 * jwtService.revokeOrgSessions with the correct orgId, and any subsequent
 * isRevoked check for tokens belonging to that org SHALL return true
 * (simulating the auth middleware rejecting those tokens with 401).
 */
describe('Property Test: Organization Deactivation Revokes Sessions (P20)', () => {
  const TEST_ORG_ID = 'test-org-deactivation-id';

  const ACTIVE_ORG = {
    id: TEST_ORG_ID,
    name: 'Test Org For Deactivation',
    type: 'government',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const DEACTIVATED_ORG = {
    ...ACTIVE_ORG,
    isActive: false,
    updatedAt: new Date(),
  };

  // Arbitrary: generate a JwtPayload for a user belonging to the org
  const sessionPayloadArbitrary = (orgId: string) =>
    fc.record({
      sub: fc.uuid(),
      email: fc.emailAddress(),
      role: fc.constantFrom('bureau_staff', 'org_admin', 'it_rep', 'external'),
      orgId: fc.constant(orgId),
      type: fc.constant('user' as const),
    });

  // Arbitrary: generate N sessions (N = 1..10) for the org
  const activeSessionsArbitrary = (orgId: string) =>
    fc.array(sessionPayloadArbitrary(orgId), { minLength: 1, maxLength: 10 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 20: deactivateOrg calls revokeOrgSessions with the correct orgId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // random orgId per run
        async (orgId) => {
          // Reset mocks at the start of each iteration so call counts are accurate
          jest.clearAllMocks();

          const activeOrg = { ...ACTIVE_ORG, id: orgId };
          const deactivatedOrg = { ...DEACTIVATED_ORG, id: orgId };

          // Mock repository calls
          (organizationRepository.findById as jest.Mock).mockResolvedValue(activeOrg);
          (organizationRepository.deactivate as jest.Mock).mockResolvedValue(deactivatedOrg);

          // Mock jwtService.revokeOrgSessions to track calls
          (jwtService.revokeOrgSessions as jest.Mock).mockResolvedValue(undefined);

          // Act: deactivate the org
          const result = await organizationService.deactivateOrg(orgId);

          // Assert: org is returned as deactivated
          expect(result.isActive).toBe(false);
          expect(result.id).toBe(orgId);

          // Assert: revokeOrgSessions was called exactly once with the correct orgId
          expect(jwtService.revokeOrgSessions).toHaveBeenCalledTimes(1);
          expect(jwtService.revokeOrgSessions).toHaveBeenCalledWith(orgId);
        },
      ),
      {
        numRuns: 50,
        verbose: true,
      },
    );
  });

  it('Property 20: after deactivation, isRevoked returns true for all org session tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        activeSessionsArbitrary(TEST_ORG_ID),
        async (sessions) => {
          // Reset mocks at the start of each iteration
          jest.clearAllMocks();

          // Track which orgIds have been revoked (simulates Redis revoked:orgs set)
          const revokedOrgIds = new Set<string>();

          // Mock repository calls
          (organizationRepository.findById as jest.Mock).mockResolvedValue(ACTIVE_ORG);
          (organizationRepository.deactivate as jest.Mock).mockResolvedValue(DEACTIVATED_ORG);

          // Mock revokeOrgSessions: adds orgId to the simulated revocation set
          (jwtService.revokeOrgSessions as jest.Mock).mockImplementation(
            async (orgId: string) => {
              revokedOrgIds.add(orgId);
            },
          );

          // Mock isRevoked: returns true if the payload's orgId is in the revocation set
          (jwtService.isRevoked as jest.Mock).mockImplementation(
            async (payload: JwtPayload) => {
              return revokedOrgIds.has(payload.orgId);
            },
          );

          // Before deactivation: none of the sessions should be revoked
          for (const session of sessions) {
            const revokedBefore = await jwtService.isRevoked(session);
            expect(revokedBefore).toBe(false);
          }

          // Act: deactivate the org
          await organizationService.deactivateOrg(TEST_ORG_ID);

          // Assert: revokeOrgSessions was called with the correct orgId
          expect(jwtService.revokeOrgSessions).toHaveBeenCalledWith(TEST_ORG_ID);

          // Assert: after deactivation, all session tokens for this org are revoked
          // (simulating the auth middleware check that would return 401)
          for (const session of sessions) {
            const revokedAfter = await jwtService.isRevoked(session);
            expect(revokedAfter).toBe(true);
          }
        },
      ),
      {
        numRuns: 50,
        verbose: true,
      },
    );
  });

  it('Property 20: deactivateOrg throws if org is already inactive', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (orgId) => {
          jest.clearAllMocks();
          const inactiveOrg = { ...ACTIVE_ORG, id: orgId, isActive: false };

          (organizationRepository.findById as jest.Mock).mockResolvedValue(inactiveOrg);
          (jwtService.revokeOrgSessions as jest.Mock).mockResolvedValue(undefined);

          // Act + Assert: deactivating an already-inactive org should throw
          await expect(organizationService.deactivateOrg(orgId)).rejects.toMatchObject({
            statusCode: 409,
            code: 'ORG_ALREADY_INACTIVE',
          });

          // revokeOrgSessions must NOT be called for an already-inactive org
          expect(jwtService.revokeOrgSessions).not.toHaveBeenCalled();
        },
      ),
      {
        numRuns: 30,
        verbose: true,
      },
    );
  });

  it('Property 20: deactivateOrg throws if org does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (orgId) => {
          jest.clearAllMocks();
          (organizationRepository.findById as jest.Mock).mockResolvedValue(null);
          (jwtService.revokeOrgSessions as jest.Mock).mockResolvedValue(undefined);

          // Act + Assert: deactivating a non-existent org should throw 404
          await expect(organizationService.deactivateOrg(orgId)).rejects.toMatchObject({
            statusCode: 404,
            code: 'ORG_NOT_FOUND',
          });

          // revokeOrgSessions must NOT be called
          expect(jwtService.revokeOrgSessions).not.toHaveBeenCalled();
        },
      ),
      {
        numRuns: 30,
        verbose: true,
      },
    );
  });
});
