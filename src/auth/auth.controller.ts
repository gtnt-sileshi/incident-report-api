import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { userRepository } from '../users/user.repository';
import { deviceRepository } from '../devices/device.repository';
import { jwtService } from './jwt.service';
import { deviceService } from './device.service';
import { AppError } from '../middleware/errorHandler';
import { roleRepository } from '../roles/role.repository';
import { permissionService } from '../roles/permission.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email:      z.string().email(),
  password:   z.string().min(1),
  // Optional device fields — sent by mobile app, ignored by web clients
  deviceId:   z.string().max(256).optional(),
  deviceName: z.string().max(255).optional(),
  model:      z.string().max(255).optional(),
  osVersion:  z.string().max(50).optional(),
  appVersion: z.string().max(50).optional(),
});

const deviceVerifySchema = z.object({
  deviceId: z.string().min(1),
  userId: z.string().uuid(),
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = loginSchema.parse(req.body);

    const user = await userRepository.findByEmail(body.email);

    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const passwordMatch = await bcrypt.compare(body.password, user.passwordHash);

    if (!passwordMatch) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // ── Device binding check (mobile clients only) ──────────────────────────
    if (body.deviceId) {
      const deviceId = body.deviceId;
      let device = await deviceRepository.findByDeviceId(deviceId);

      const existingUserDevice = await deviceRepository.findByUserId(user.id);

      if (!device) {
        if (existingUserDevice) {
          // User is already bound to a different device
          throw new AppError(403, 'DEVICE_MISMATCH', 'This account is locked to a different device. Please contact support to reset your device binding.');
        }

        // No device bound to user, and this device ID is new to the system
        // Register and AUTO-APPROVE as the primary device for this user
        device = await deviceRepository.register({
          deviceId,
          userId:     user.id,
          deviceName: body.deviceName ?? 'Mobile Terminal',
          model:      body.model      ?? 'Unknown',
          osVersion:  body.osVersion  ?? 'Unknown',
          appVersion: body.appVersion ?? '1.0.0',
          isApproved: true, // Auto-approve the first binding
          isActive:   true,
        });
      } else {
        // Device exists in system
        if (device.userId && device.userId !== user.id) {
          throw new AppError(403, 'DEVICE_ALREADY_BOUND', 'This device is already registered to another user.');
        }

        if (!device.userId) {
          // Device exists but unassigned? (Shouldn't happen with auto-binding, but handle it)
          if (existingUserDevice) {
             throw new AppError(403, 'DEVICE_MISMATCH', 'Your account is already bound to another device.');
          }
          await deviceRepository.update(device.id, { userId: user.id, isApproved: true });
        } else if (device.userId === user.id) {
          // Correct binding
          if (!device.isApproved) {
            await deviceRepository.update(device.id, { isApproved: true });
          }
        }
      }

      if (!device.isActive) {
        throw new AppError(403, 'DEVICE_REVOKED', 'This device has been revoked. Access denied.');
      }

      // Update last seen timestamp
      await deviceRepository.updateLastSeen(device.id);
    }
    // ────────────────────────────────────────────────────────────────────────

    const userRoles       = await roleRepository.getRolesForUser(user.id);
    const permissions     = await permissionService.resolvePermissions(user.id);
    const primaryRoleName = userRoles[0]?.name ?? user.role;

    const token = jwtService.issueToken({
      sub: user.id,
      email: user.email ?? '',
      role: primaryRoleName,
      roles: userRoles.map((r) => r.name),
      permissions,
      regionId: user.regionId ?? undefined,
      examCenterId: user.examCenterId ?? undefined,
      examRoomId: user.examRoomId ?? undefined,
      powerClusterId: user.powerClusterId ?? undefined,
      internetClusterId: user.internetClusterId ?? undefined,
      type: 'user',
    });

    await jwtService.clearRevocation(user.id);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: primaryRoleName,
        roles: userRoles.map((r) => r.name),
        permissions,
        regionId: user.regionId,
        examCenterId: user.examCenterId,
        examRoomId: user.examRoomId,
        powerClusterId: user.powerClusterId,
        internetClusterId: user.internetClusterId,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/device-verify ────────────────────────────────────────────

export async function deviceVerify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = deviceVerifySchema.parse(req.body);

    const device = await deviceService.verifyDevice(body.deviceId);

    const user = await userRepository.findById(body.userId);
    if (!user || !user.isActive || user.role !== 'it_rep') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'User not found or not authorized');
    }

    if (device.userId !== body.userId) {
      throw new AppError(403, 'DEVICE_NOT_AUTHORIZED', 'This device is not registered to the specified user');
    }

    await deviceRepository.updateLastSeen(device.id);

    const token = deviceService.issueDeviceToken(device, user);

    res.status(200).json({
      token,
      device: {
        id: device.id,
        deviceId: device.deviceId,
      },
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        regionId: user.regionId,
        examCenterId: user.examCenterId,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/auth/device-status ─────────────────────────────────────────────

export async function deviceStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const device = await deviceRepository.findByUserId(userId);

    if (!device) {
      res.status(200).json({ deviceId: null, isApproved: false, isActive: false });
      return;
    }

    res.status(200).json({
      deviceId:   device.deviceId,
      isApproved: device.isApproved,
      isActive:   device.isActive,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.sub;
    await jwtService.revokeUserSessions(userId);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}
