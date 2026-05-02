import { Request, Response, NextFunction } from 'express';

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
import { AppError } from '../../../src/middleware/errorHandler';

// Mock the repositories
jest.mock('../../../src/users/user.repository');
jest.mock('../../../src/organizations/organization.repository');

describe('requirePermission middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      user: {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'bureau_staff',
        orgId: 'org-456',
        type: 'user',
      },
    };
    mockResponse = {};
    mockNext = jest.fn();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Two-Level Permission Enforcement', () => {
    it('should allow request when permission is in both user and org sets', async () => {
      // Arrange
      const userPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
      ];
      const orgPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
        { id: 3, name: 'users.view', groupName: 'Users' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(); // Called without error
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should deny request when permission is absent from user set', async () => {
      // Arrange
      const userPermissions = [
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
      ];
      const orgPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('incidents.view');
    });

    it('should deny request when permission is absent from org set', async () => {
      // Arrange
      const userPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
      ];
      const orgPermissions = [
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('incidents.view');
    });

    it('should deny request when permission is absent from both sets', async () => {
      // Arrange
      const userPermissions = [
        { id: 2, name: 'incidents.create', groupName: 'Incidents' },
      ];
      const orgPermissions = [
        { id: 3, name: 'users.view', groupName: 'Users' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('should deny request when user has permission but org does not', async () => {
      // Arrange - User has permission, but org doesn't
      const userPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
      ];
      const orgPermissions: any[] = [];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
    });

    it('should deny request when org has permission but user does not', async () => {
      // Arrange - Org has permission, but user doesn't
      const userPermissions: any[] = [];
      const orgPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
    });
  });

  describe('Authentication Check', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange
      mockRequest.user = undefined;
      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Repository Integration', () => {
    it('should call userRepository.getUserPermissions with correct userId', async () => {
      // Arrange
      const userPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
      ];
      const orgPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(userRepository.getUserPermissions).toHaveBeenCalledWith('user-123');
    });

    it('should call organizationRepository.getOrgPermissions with correct orgId', async () => {
      // Arrange
      const userPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
      ];
      const orgPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(organizationRepository.getOrgPermissions).toHaveBeenCalledWith('org-456');
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      (userRepository.getUserPermissions as jest.Mock).mockRejectedValue(dbError);

      const middleware = requirePermission('incidents.view');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(dbError);
    });
  });

  describe('Multiple Permissions', () => {
    it('should correctly check different permission names', async () => {
      // Arrange
      const userPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
        { id: 5, name: 'users.create', groupName: 'Users' },
      ];
      const orgPermissions = [
        { id: 1, name: 'incidents.view', groupName: 'Incidents' },
        { id: 5, name: 'users.create', groupName: 'Users' },
      ];

      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      // Act & Assert - Test first permission
      const middleware1 = requirePermission('incidents.view');
      await middleware1(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith();

      // Reset mock
      jest.clearAllMocks();
      (userRepository.getUserPermissions as jest.Mock).mockResolvedValue(userPermissions);
      (organizationRepository.getOrgPermissions as jest.Mock).mockResolvedValue(orgPermissions);

      // Act & Assert - Test second permission
      const middleware2 = requirePermission('users.create');
      await middleware2(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
