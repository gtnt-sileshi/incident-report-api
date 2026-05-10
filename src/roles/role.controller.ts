import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { roleService } from './role.service';
import { roleRepository } from './role.repository';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const setPermissionsSchema = z.object({
  permissionIds: z.array(z.number().int().positive()),
});

const setUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

// ─── GET /api/roles ───────────────────────────────────────────────────────────

/**
 * Lists all roles ordered by name.
 * Requirements: 1.1
 */
export async function listRoles(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const allRoles = await roleRepository.findAll();
    res.status(200).json({ roles: allRoles });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/roles ──────────────────────────────────────────────────────────

/**
 * Creates a new role.
 * Requirements: 1.2, 1.3
 */
export async function createRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createRoleSchema.parse(req.body);
    const role = await roleService.createRole(body, req.user!);
    res.status(201).json({ role });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/roles/:id ─────────────────────────────────────────────────────

/**
 * Updates an existing role's fields.
 * Requirements: 1.4, 1.5
 */
export async function updateRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateRoleSchema.parse(req.body);
    const role = await roleService.updateRole(id, body, req.user!);
    res.status(200).json({ role });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/roles/:id ────────────────────────────────────────────────────

/**
 * Soft-deletes a role (sets isActive = false).
 * Rejects with 403 if the role is a system role.
 * Requirements: 1.6, 1.7
 */
export async function deleteRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const role = await roleService.deactivateRole(id, req.user!);
    res.status(200).json({ role });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/roles/:id/permissions ──────────────────────────────────────────

/**
 * Returns the full list of permissions currently assigned to a role.
 * Requirements: 2.1
 */
export async function getRolePermissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const perms = await roleRepository.getPermissionsForRole(id);
    res.status(200).json({ permissions: perms });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/roles/:id/permissions ──────────────────────────────────────────

/**
 * Replaces the role's entire permission set with the provided list.
 * Requirements: 2.2, 2.3, 2.4, 2.5
 */
export async function setRolePermissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { permissionIds } = setPermissionsSchema.parse(req.body);
    await roleService.setRolePermissions(id, permissionIds, req.user!);
    const perms = await roleRepository.getPermissionsForRole(id);
    res.status(200).json({ permissions: perms });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/:id/roles ─────────────────────────────────────────────────

/**
 * Returns the list of roles currently assigned to a user.
 * Requirements: 3.1
 */
export async function getUserRoles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const userRoles = await roleRepository.getRolesForUser(id);
    res.status(200).json({ roles: userRoles });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/users/:id/roles ─────────────────────────────────────────────────

/**
 * Replaces the user's entire role set with the provided list.
 * Requirements: 3.2, 3.3, 3.4, 3.5
 */
export async function setUserRoles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { roleIds } = setUserRolesSchema.parse(req.body);
    await roleService.setUserRoles(id, roleIds, req.user!);
    const userRoles = await roleRepository.getRolesForUser(id);
    res.status(200).json({ roles: userRoles });
  } catch (err) {
    next(err);
  }
}
