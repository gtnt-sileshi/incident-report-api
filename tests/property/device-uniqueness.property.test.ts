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
jest.mock('../../src/users/user.repository');
jest.mock('../../src/organizations/organization.repository');
jest.mock('../../src/devices/device.repository');
jest.mock('../../src/auth/jwt.service');
jest.mock('../../src/qr/qr-credential.repository');

import { userRepository } from '../../src/users/user.repository';
import { organizationRepository } from '../../src/organizations/organization.repository';
import { deviceRepository } from '../../src/devices/device.repository';
import { userService } from '../../src/users/user.service';
import { AppError } from '../../src/middleware/errorHandler';

/**
 * Property-Based Test for Device ID Uniqueness
 *
 * **Validates: Requirements 13.4**
 *
 * Property 12: Device ID Uniqueness
 *
 * For any attempt to register or activate a Device_ID that is already
 * associated with an active IT_Representative account, the operation SHALL
 * be rejected. At all times, each Device_ID SHALL be associated with at most
 * one active IT_Representative.
 */
describe('Property Test: Device ID Uniqueness (P12)', () => {
  // A fixed org used across all test runs
  const TEST_ORG = {
    id: 'test-org-id-device-uniqueness',
    name: 'Test Org',
    type: 'government',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Helper to build a mock User record
  const buildUser = (id: string, deviceId: string, isActive = true) => ({
    id,
    orgId: TEST_ORG.id,
    name: 'Existing IT Rep',
    email: `${id}@example.com`,
    passwordHash: '$2b$12$hashedpassword',
    role: 'it_rep',
    isActive,
    phoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceId,
  });

  // Helper to build a mock Device record
  const buildDevice = (deviceId: string, userId: string, isActive = true) => ({
    id: `device-record-${deviceId}`,
    deviceId,
    userId,
    isActive,
    registeredAt: new Date(),
    lastSeenAt: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: org always exists
    (organizationRepository.findById as jest.Mock).mockResolvedValue(TEST_ORG);

    // Default: no email conflicts
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

    // Default: user creation succeeds
    (userRepository.create as jest.Mock).mockImplementation(async (data) => ({
      id: 'new-user-id',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Default: device registration succeeds
    (deviceRepository.register as jest.Mock).mockResolvedValue({
      id: 'new-device-record-id',
      deviceId: 'some-device-id',
      userId: 'new-user-id',
      isActive: true,
      registeredAt: new Date(),
      lastSeenAt: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Arbitrary: generate a valid device ID string using alphanumeric characters
  // (avoids slow filter-based rejection)
  const deviceIdArbitrary = fc.stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split(''),
    ),
    { minLength: 4, maxLength: 32 },
  );

  // Arbitrary: generate a valid user ID (UUID-like)
  const userIdArbitrary = fc.uuid();

  it('Property 12: Creating a second IT_Rep with an already-active Device_ID is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArbitrary,
        userIdArbitrary,
        async (deviceId, existingUserId) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();

          // Org always exists
          (organizationRepository.findById as jest.Mock).mockResolvedValue(TEST_ORG);

          // No email conflict for the new user
          (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

          // Simulate: an active device already exists with this deviceId, linked to an active IT_Rep
          const existingUser = buildUser(existingUserId, deviceId, true);
          const existingDevice = buildDevice(deviceId, existingUserId, true);

          (deviceRepository.findByDeviceId as jest.Mock).mockResolvedValue(existingDevice);
          (userRepository.findById as jest.Mock).mockResolvedValue(existingUser);

          // Attempt to create a second IT_Rep with the same deviceId
          let thrownError: unknown = null;
          try {
            await userService.createUser({
              orgId: TEST_ORG.id,
              name: 'New IT Rep',
              email: 'new-it-rep@example.com',
              password: 'securepassword123',
              role: 'it_rep',
              deviceId,
            });
          } catch (err) {
            thrownError = err;
          }

          // Assert: the operation was rejected
          expect(thrownError).not.toBeNull();
          expect(thrownError).toBeInstanceOf(AppError);

          const appError = thrownError as AppError;
          expect(appError.statusCode).toBe(409);
          expect(appError.code).toBe('DEVICE_ID_CONFLICT');

          // Assert: no new user was created
          expect(userRepository.create).not.toHaveBeenCalled();
        },
      ),
      {
        numRuns: 25,
        verbose: true,
      },
    );
  });

  it('Property 12: Creating an IT_Rep with a Device_ID that has no active IT_Rep succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArbitrary,
        async (deviceId) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();

          // Org always exists
          (organizationRepository.findById as jest.Mock).mockResolvedValue(TEST_ORG);

          // No email conflict
          (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

          // No existing device with this deviceId
          (deviceRepository.findByDeviceId as jest.Mock).mockResolvedValue(null);

          // User creation succeeds
          (userRepository.create as jest.Mock).mockImplementation(async (data) => ({
            id: 'new-user-id',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

          // Device registration succeeds
          (deviceRepository.register as jest.Mock).mockResolvedValue({
            id: 'new-device-record-id',
            deviceId,
            userId: 'new-user-id',
            isActive: true,
            registeredAt: new Date(),
            lastSeenAt: null,
          });

          // Should not throw
          let thrownError: unknown = null;
          try {
            await userService.createUser({
              orgId: TEST_ORG.id,
              name: 'New IT Rep',
              email: `new-it-rep-${deviceId.slice(0, 8)}@example.com`,
              password: 'securepassword123',
              role: 'it_rep',
              deviceId,
            });
          } catch (err) {
            thrownError = err;
          }

          // Assert: no conflict error was thrown
          expect(thrownError).toBeNull();

          // Assert: user was created
          expect(userRepository.create).toHaveBeenCalledTimes(1);
        },
      ),
      {
        numRuns: 25,
        verbose: true,
      },
    );
  });

  it('Property 12: Creating an IT_Rep with a Device_ID linked to an INACTIVE IT_Rep succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArbitrary,
        userIdArbitrary,
        async (deviceId, existingUserId) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();

          // Org always exists
          (organizationRepository.findById as jest.Mock).mockResolvedValue(TEST_ORG);

          // No email conflict
          (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

          // Simulate: device exists but the linked IT_Rep is INACTIVE
          const inactiveUser = buildUser(existingUserId, deviceId, false /* isActive = false */);
          const existingDevice = buildDevice(deviceId, existingUserId, true);

          (deviceRepository.findByDeviceId as jest.Mock).mockResolvedValue(existingDevice);
          (userRepository.findById as jest.Mock).mockResolvedValue(inactiveUser);

          // User creation succeeds
          (userRepository.create as jest.Mock).mockImplementation(async (data) => ({
            id: 'new-user-id',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

          // Device registration succeeds
          (deviceRepository.register as jest.Mock).mockResolvedValue({
            id: 'new-device-record-id',
            deviceId,
            userId: 'new-user-id',
            isActive: true,
            registeredAt: new Date(),
            lastSeenAt: null,
          });

          // Should not throw a DEVICE_ID_CONFLICT error
          let thrownError: unknown = null;
          try {
            await userService.createUser({
              orgId: TEST_ORG.id,
              name: 'New IT Rep',
              email: `new-it-rep-inactive-${deviceId.slice(0, 8)}@example.com`,
              password: 'securepassword123',
              role: 'it_rep',
              deviceId,
            });
          } catch (err) {
            thrownError = err;
          }

          // Assert: no DEVICE_ID_CONFLICT was thrown
          if (thrownError !== null) {
            const appError = thrownError as AppError;
            expect(appError.code).not.toBe('DEVICE_ID_CONFLICT');
          }

          // Assert: user was created (inactive user doesn't block creation)
          expect(userRepository.create).toHaveBeenCalledTimes(1);
        },
      ),
      {
        numRuns: 20,
        verbose: true,
      },
    );
  });

  it('Property 12: Sequential registrations with distinct Device_IDs all succeed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-5 distinct device IDs using uniqueArray for efficiency
        fc.uniqueArray(deviceIdArbitrary, { minLength: 2, maxLength: 5 }),
        async (deviceIds) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();

          // Org always exists
          (organizationRepository.findById as jest.Mock).mockResolvedValue(TEST_ORG);

          // Track registered devices in-memory
          const registeredDevices = new Map<string, { deviceId: string; userId: string; isActive: boolean }>();

          // No email conflicts
          (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

          // findByDeviceId: return from in-memory map
          (deviceRepository.findByDeviceId as jest.Mock).mockImplementation(
            async (deviceId: string) => {
              const d = registeredDevices.get(deviceId);
              if (!d) return null;
              return {
                id: `device-record-${deviceId}`,
                deviceId: d.deviceId,
                userId: d.userId,
                isActive: d.isActive,
                registeredAt: new Date(),
                lastSeenAt: null,
              };
            },
          );

          // findById: return a mock active IT_Rep for any userId in registeredDevices
          (userRepository.findById as jest.Mock).mockImplementation(
            async (userId: string) => {
              const entry = [...registeredDevices.values()].find((d) => d.userId === userId);
              if (!entry) return null;
              return buildUser(userId, entry.deviceId, true);
            },
          );

          // create: simulate user creation and register device
          let userCounter = 0;
          (userRepository.create as jest.Mock).mockImplementation(async (data) => {
            const userId = `user-${userCounter++}`;
            return { id: userId, ...data, createdAt: new Date(), updatedAt: new Date() };
          });

          (deviceRepository.register as jest.Mock).mockImplementation(
            async (data: { deviceId: string; userId: string; isActive: boolean }) => {
              registeredDevices.set(data.deviceId, data);
              return {
                id: `device-record-${data.deviceId}`,
                ...data,
                registeredAt: new Date(),
                lastSeenAt: null,
              };
            },
          );

          // Register each device ID — all should succeed since they are distinct
          const errors: unknown[] = [];
          for (const deviceId of deviceIds) {
            try {
              await userService.createUser({
                orgId: TEST_ORG.id,
                name: `IT Rep for ${deviceId}`,
                email: `it-rep-${deviceId.slice(0, 8)}-${Math.random()}@example.com`,
                password: 'securepassword123',
                role: 'it_rep',
                deviceId,
              });
            } catch (err) {
              errors.push(err);
            }
          }

          // Assert: no errors for distinct device IDs
          expect(errors).toHaveLength(0);

          // Assert: each device ID maps to exactly one active IT_Rep
          for (const deviceId of deviceIds) {
            const device = registeredDevices.get(deviceId);
            expect(device).toBeDefined();
            expect(device!.isActive).toBe(true);
          }

          // Assert: all device IDs are distinct in the registry
          const registeredIds = [...registeredDevices.keys()];
          expect(new Set(registeredIds).size).toBe(registeredIds.length);
        },
      ),
      {
        numRuns: 20,
        verbose: true,
      },
    );
  }, 60000); // 60s timeout for this sequential test
});
