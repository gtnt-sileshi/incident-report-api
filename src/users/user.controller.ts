import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { userService } from './user.service';
import { AppError } from '../middleware/errorHandler';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createUserSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['super_admin', 'org_admin', 'bureau_staff', 'it_rep', 'moe', 'aa_edu', 'external']),
  phoneNumber: z.string().max(30).optional(),
  deviceId: z.string().min(1).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['super_admin', 'org_admin', 'bureau_staff', 'it_rep', 'moe', 'aa_edu', 'external']).optional(),
  phoneNumber: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
});

const setUserPermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)),
});

// ─── GET /api/users ───────────────────────────────────────────────────────────

/**
 * Lists users scoped by the requesting user's role.
 * - Super_Admin: all users
 * - Others: own org only
 * Requirements: 13.1, 13.2, 13.6
 */
export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    // Allow filtering by orgId query param (Super_Admin only — others are already scoped)
    const orgIdFilter = req.query['orgId'] as string | undefined;

    let users;
    if (req.user.role === 'super_admin' && orgIdFilter) {
      users = await userService.listUsersByOrg(orgIdFilter);
    } else {
      users = await userService.listUsers(req.user);
    }

    res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users ──────────────────────────────────────────────────────────

/**
 * Creates a new user account.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
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

/**
 * Updates an existing user's fields.
 * Requirements: 13.1, 13.2
 */
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

/**
 * Deactivates a user account, revokes sessions, and invalidates QR credential.
 * Requirements: 13.5
 */
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

// ─── PATCH /api/users/:id/permissions ────────────────────────────────────────

/**
 * Replaces a user's permission set.
 * The new set must be a subset of the user's org's Org_Permission_Set.
 * Requirements: 13.7, 13.8
 */
export async function setUserPermissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = setUserPermissionsSchema.parse(req.body);
    await userService.setUserPermissions(id, body.permissions);
    const updatedPermissions = await userService.getUserPermissions(id);
    res.status(200).json({ permissions: updatedPermissions });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/me ────────────────────────────────────────────────────────

/**
 * Returns the current authenticated user along with their effective permissions
 * (intersection of user permissions and org permissions).
 * Requirements: 13.7, 13.8, 18.5
 */
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
    const [user, effectivePermissions] = await Promise.all([
      userService.getUser(userId),
      userService.getEffectivePermissions(userId),
    ]);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        isActive: user.isActive,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        device: user.device,
      },
      effectivePermissions,
    });
  } catch (err) {
    next(err);
  }
}
