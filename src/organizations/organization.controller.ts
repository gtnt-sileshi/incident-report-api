import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { organizationService } from './organization.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  isActive: z.boolean().optional().default(true),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

const setOrgPermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)),
});

// ─── GET /api/organizations ───────────────────────────────────────────────────

/**
 * Lists all organizations with their permissions.
 * Accepts optional query param `includeInactive=true` to include inactive orgs.
 * Requirements: 2.1
 */
export async function listOrgs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const includeInactive = req.query['includeInactive'] === 'true';
    const orgs = await organizationService.listOrgs(includeInactive);
    
    // Fetch permissions for each organization
    const orgsWithPermissions = await Promise.all(
      orgs.map(async (org) => {
        const permissions = await organizationService.getOrgPermissions(org.id);
        return {
          ...org,
          permissions,
        };
      }),
    );
    
    res.status(200).json({ organizations: orgsWithPermissions });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/organizations ──────────────────────────────────────────────────

/**
 * Creates a new organization.
 * Requirements: 2.2
 */
export async function createOrg(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createOrgSchema.parse(req.body);
    const org = await organizationService.createOrg(body);
    res.status(201).json({ organization: org });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/organizations/:id ────────────────────────────────────────────

/**
 * Updates an existing organization's fields.
 * Requirements: 2.2
 */
export async function updateOrg(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateOrgSchema.parse(req.body);
    const org = await organizationService.updateOrg(id, body);
    res.status(200).json({ organization: org });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/organizations/:id/deactivate ─────────────────────────────────

/**
 * Deactivates an organization and revokes all active sessions for its users.
 * Requirements: 2.7
 */
export async function deactivateOrg(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const org = await organizationService.deactivateOrg(id);
    res.status(200).json({ organization: org });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/organizations/:id/permissions ────────────────────────────────

/**
 * Replaces the organization's permission set.
 * Cascades: removes any permissions from org users that are no longer in the org set.
 * Requirements: 2.3, 13.9, 18.7
 */
export async function setOrgPermissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const body = setOrgPermissionsSchema.parse(req.body);
    await organizationService.setOrgPermissions(id, body.permissions);
    const updatedPermissions = await organizationService.getOrgPermissions(id);
    res.status(200).json({ permissions: updatedPermissions });
  } catch (err) {
    next(err);
  }
}
