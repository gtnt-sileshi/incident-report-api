import { Request, Response } from 'express';

// Mock the config module before any imports that depend on it
jest.mock('../../../src/config', () => ({
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
jest.mock('../../../src/db/index', () => ({
  getDb: jest.fn(),
}));

import { requirePermission } from '../../../src/middleware/permission';
import { userRepository } from '../../../src/users/user.repository';
import { organizationRepository } from '../../../src/organizations/organization.repository';

// Mock the repositories
jest.mock('../../../src/users/user.repository');
jest.mock('../../../src/organizations/organization.repository');

describe('Read-Only Observer Enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should deny write operations for MoE users regardless of permissions', async () => {
    // Mock user and org permissions that include the write permission
    (userRepository.getUserPermissions as jest.Mock).mockResolvedValue([
      { id: 2, name: 'incidents.create', groupName: 'Incidents' }
    ]);
    (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue([
      { id: 2, name: 'incidents.create', groupName: 'Incidents' }
    ]);

    const mockReq = {
      user: {
        sub: 'user-123',
        email: 'moe@example.com',
        role: 'moe',
        orgId: 'org-123',
        type: 'user' as const
      }
    } as Request;

    const mockRes = {} as Response;
    const mockNext = jest.fn();

    const middleware = requirePermission('incidents.create');
    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Read-only access: moe users cannot perform write operations'
      })
    );
  });

  it('should deny write operations for AA_Education_Bureau users regardless of permissions', async () => {
    // Mock user and org permissions that include the write permission
    (userRepository.getUserPermissions as jest.Mock).mockResolvedValue([
      { id: 5, name: 'incidents.assign', groupName: 'Incidents' }
    ]);
    (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue([
      { id: 5, name: 'incidents.assign', groupName: 'Incidents' }
    ]);

    const mockReq = {
      user: {
        sub: 'user-456',
        email: 'aa_edu@example.com',
        role: 'aa_education_bureau',
        orgId: 'org-456',
        type: 'user' as const
      }
    } as Request;

    const mockRes = {} as Response;
    const mockNext = jest.fn();

    const middleware = requirePermission('incidents.assign');
    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Read-only access: aa_education_bureau users cannot perform write operations'
      })
    );
  });

  it('should allow read operations for observer roles', async () => {
    // Mock user and org permissions that include the read permission
    (userRepository.getUserPermissions as jest.Mock).mockResolvedValue([
      { id: 1, name: 'incidents.view', groupName: 'Incidents' }
    ]);
    (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue([
      { id: 1, name: 'incidents.view', groupName: 'Incidents' }
    ]);

    const mockReq = {
      user: {
        sub: 'user-789',
        email: 'moe@example.com',
        role: 'moe',
        orgId: 'org-789',
        type: 'user' as const
      }
    } as Request;

    const mockRes = {} as Response;
    const mockNext = jest.fn();

    const middleware = requirePermission('incidents.view');
    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(); // Should be called without error
  });

  it('should allow write operations for non-observer roles with proper permissions', async () => {
    // Mock user and org permissions that include the write permission
    (userRepository.getUserPermissions as jest.Mock).mockResolvedValue([
      { id: 2, name: 'incidents.create', groupName: 'Incidents' }
    ]);
    (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue([
      { id: 2, name: 'incidents.create', groupName: 'Incidents' }
    ]);

    const mockReq = {
      user: {
        sub: 'user-999',
        email: 'bureau@example.com',
        role: 'bureau_staff',
        orgId: 'org-999',
        type: 'user' as const
      }
    } as Request;

    const mockRes = {} as Response;
    const mockNext = jest.fn();

    const middleware = requirePermission('incidents.create');
    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(); // Should be called without error
  });
});