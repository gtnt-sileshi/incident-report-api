import { Response } from 'express';
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

import { requirePermission } from '../../src/middleware/permission';
import { userRepository } from '../../src/users/user.repository';
import { organizationRepository } from '../../src/organizations/organization.repository';

// Mock the repositories
jest.mock('../../src/users/user.repository');
jest.mock('../../src/organizations/organization.repository');

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

/**
 * Property-Based Test for Read-Only Observer Enforcement
 * 
 * **Validates: Requirements 1.4, 10.1**
 * 
 * Property 6: Read-Only Observer Enforcement
 * 
 * For any user with role MoE or AA_Education_Bureau, any attempt to create, 
 * update, assign, or delete an incident SHALL be denied with a 403 response, 
 * regardless of what permissions are configured in their User_Permission_Set.
 */
describe('Property Test: Read-Only Observer Enforcement (P6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Define write operations that should be blocked for observer roles
  const writeOperations = [
    'incidents.create',
    'incidents.edit', 
    'incidents.delete',
    'incidents.assign',
    'incidents.update_status',
    'incidents.resolve',
    'incidents.escalate',
    'incidents.comment',
    'incidents.attach',
    'users.create',
    'users.edit',
    'users.delete',
    'users.approve',
    'users.assign_permissions',
    'organizations.create',
    'organizations.edit',
    'organizations.delete',
    'organizations.assign_permissions',
    'devices.register',
    'devices.deactivate',
    'exam_fields.create',
    'exam_fields.edit',
    'exam_fields.delete',
    'catalog.create',
    'catalog.edit',
    'catalog.delete',
    'routing.create',
    'routing.edit',
    'routing.delete',
    'alerts.sms_trigger',
    'alerts.push_trigger'
  ];

  const observerRoles = ['moe', 'aa_education_bureau'];

  const observerRoleArbitrary = fc.constantFrom(...observerRoles);
  const writeOperationArbitrary = fc.constantFrom(...writeOperations);
  const permissionSetArbitrary = fc.array(
    fc.constantFrom(...SYSTEM_PERMISSIONS).map((name) => ({
      id: SYSTEM_PERMISSIONS.indexOf(name) + 1,
      name,
      groupName: name.split('.')[0].charAt(0).toUpperCase() + name.split('.')[0].slice(1),
    })),
    { minLength: 1, maxLength: 20 }
  ).map((perms) => {
    const uniquePerms = Array.from(
      new Map(perms.map((p) => [p.name, p])).values()
    );
    return uniquePerms;
  });

  it('Property 6: Observer roles are denied all write operations regardless of permissions', () => {
    fc.assert(
      fc.asyncProperty(
        observerRoleArbitrary,
        writeOperationArbitrary,
        permissionSetArbitrary,
        permissionSetArbitrary,
        async (role, writeOperation, userPermissions, orgPermissions) => {
          jest.clearAllMocks();

          const userId = `user-${Math.random().toString(36).substring(7)}`;
          const orgId = `org-${Math.random().toString(36).substring(7)}`;

          // Mock user and org permissions - even if they contain the write permission
          (userRepository.getUserPermissions as jest.Mock).mockResolvedValue([...userPermissions]);
          (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue([...orgPermissions]);

          // Create mock request with observer role
          const mockReq = {
            user: {
              sub: userId,
              email: `${userId}@example.com`,
              role: role,
              orgId: orgId,
              type: 'user' as const
            }
          } as any;

          const mockRes = {} as Response;
          const mockNext = jest.fn();

          // Create the permission middleware for the write operation
          const middleware = requirePermission(writeOperation);

          // Execute the middleware
          await middleware(mockReq, mockRes, mockNext);

          // For observer roles (MoE, AA_Education_Bureau), ALL write operations should be denied
          // regardless of what permissions they have configured
          expect(mockNext).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 403,
              code: 'FORBIDDEN'
            })
          );
        }
      ),
      {
        numRuns: 20,
        verbose: true,
      }
    );
  });
});