import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { userService } from './user.service';
import { AppError } from '../middleware/errorHandler';
import { roleRepository } from '../roles/role.repository';
import { permissionService } from '../roles/permission.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['super_admin', 'national_command', 'regional_dispatcher', 'center_coordinator', 'site_supervisor', 'it_rep', 'invigilator', 'moe_observer', 'aa_education_bureau', 'police_liaison', 'power_officer', 'power_cluster_officer', 'internet_officer', 'internet_cluster_officer']),
  phoneNumber: z.string().max(30).optional(),
  deviceId: z.string().min(1).optional(),
  regionId: z.string().uuid().optional(),
  examCenterId: z.string().uuid().optional(),
  examRoomId: z.string().uuid().optional(),
  powerClusterId: z.string().uuid().optional(),
  internetClusterId: z.string().uuid().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['super_admin', 'national_command', 'regional_dispatcher', 'center_coordinator', 'site_supervisor', 'it_rep', 'invigilator', 'moe_observer', 'aa_education_bureau', 'police_liaison', 'power_officer', 'power_cluster_officer', 'internet_officer', 'internet_cluster_officer']).optional(),
  phoneNumber: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
  deviceId: z.string().min(1).optional(),
  regionId: z.string().uuid().optional(),
  examCenterId: z.string().uuid().optional(),
  examRoomId: z.string().uuid().optional(),
  powerClusterId: z.string().uuid().optional(),
  internetClusterId: z.string().uuid().optional(),
});

// ─── GET /api/users ───────────────────────────────────────────────────────────

export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const regionIdFilter = req.query['regionId'] as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    let result;
    if ((req.user.role === 'super_admin' || req.user.role === 'national_command') && regionIdFilter) {
      result = await userService.listUsersByRegion(regionIdFilter, limit, offset);
    } else {
      result = await userService.listUsers(req.user, limit, offset);
    }

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users ──────────────────────────────────────────────────────────

export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createUserSchema.parse(req.body);
    const user = await userService.createUser(body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────

export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateUserSchema.parse(req.body);
    const user = await userService.updateUser(id, body);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/:id/deactivate ─────────────────────────────────────────

export async function deactivateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const user = await userService.deactivateUser(id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/me ────────────────────────────────────────────────────────

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const userId = req.user.sub;
    const user = await userService.getUser(userId);

    const userRoles   = await roleRepository.getRolesForUser(userId);
    const permissions = await permissionService.resolvePermissions(userId);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roles: userRoles.map((r) => r.name),
        permissions,
        regionId: user.regionId,
        examCenterId: user.examCenterId,
        examRoomId: user.examRoomId,
        powerClusterId: user.powerClusterId,
        internetClusterId: user.internetClusterId,
        isActive: user.isActive,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        device: user.device,
      },
    });
  } catch (err) {
    next(err);
  }
}
