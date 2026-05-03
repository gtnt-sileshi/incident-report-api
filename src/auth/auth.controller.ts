import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { userRepository } from '../users/user.repository';
import { organizationRepository } from '../organizations/organization.repository';
import { deviceRepository } from '../devices/device.repository';
import { jwtService } from './jwt.service';
import { deviceService } from './device.service';
import { AppError } from '../middleware/errorHandler';

// ─── Validation schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

    // 1. Find user by email
    const user = await userRepository.findByEmail(body.email);

    // 2. Not found or inactive → generic credentials error (no enumeration)
    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // 3. Compare password — passwordHash must exist
    if (!user.passwordHash) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const passwordMatch = await bcrypt.compare(body.password, user.passwordHash);

    // 4. Mismatch → same generic error
    if (!passwordMatch) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // 5. Issue JWT
    const token = jwtService.issueToken({
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      orgId: user.orgId,
      type: 'user',
    });

    // 6. Clear any existing revocation entry so the new token is accepted
    await jwtService.clearRevocation(user.id);

    // 6. Fetch org name + effective permissions in parallel (no Redis check needed here)
    const [org, userPerms, orgPerms] = await Promise.all([
      organizationRepository.findById(user.orgId),
      userRepository.getUserPermissions(user.id),
      organizationRepository.getOrgPermissions(user.orgId),
    ]);

    const orgPermNames = new Set(orgPerms.map((p) => p.name));
    const effectivePermissions = userPerms
      .map((p) => p.name)
      .filter((name) => orgPermNames.has(name));

    // 7. Return token + full user profile + effective permissions
    res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        orgName: org?.name ?? '',
        permissions: effectivePermissions,
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

    // 1. Verify device exists and is active
    const device = await deviceService.verifyDevice(body.deviceId);

    // 2. Find user by ID — must be active and role='it_rep'
    const user = await userRepository.findById(body.userId);
    if (!user || !user.isActive || user.role !== 'it_rep') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'User not found or not authorized');
    }

    // 3. Device must be registered to this user
    if (device.userId !== body.userId) {
      throw new AppError(403, 'DEVICE_NOT_AUTHORIZED', 'This device is not registered to the specified user');
    }

    // 4. Update device lastSeenAt
    await deviceRepository.updateLastSeen(device.id);

    // 5. Issue device JWT
    const token = deviceService.issueDeviceToken(device, user);

    // 6. Return token + device + user info
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
        orgId: user.orgId,
      },
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
    // req.user is guaranteed by the authenticate middleware
    const userId = req.user!.sub;
    await jwtService.revokeUserSessions(userId);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}
