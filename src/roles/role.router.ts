import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  setRolePermissions,
  getUserRoles,
  setUserRoles,
} from './role.controller';

const router = Router();

// ─── Role CRUD ────────────────────────────────────────────────────────────────

router.get('/roles', authenticate, requirePermission('roles.view'), listRoles);
router.post('/roles', authenticate, requirePermission('roles.create'), createRole);
router.patch('/roles/:id', authenticate, requirePermission('roles.edit'), updateRole);
router.delete('/roles/:id', authenticate, requirePermission('roles.delete'), deleteRole);

// ─── Role-Permission management ───────────────────────────────────────────────

router.get('/roles/:id/permissions', authenticate, requirePermission('roles.view'), getRolePermissions);
router.put('/roles/:id/permissions', authenticate, requirePermission('roles.edit'), setRolePermissions);

// ─── User-Role management ─────────────────────────────────────────────────────

router.get('/users/:id/roles', authenticate, requirePermission('users.view'), getUserRoles);
router.put('/users/:id/roles', authenticate, requirePermission('users.assign_permissions'), setUserRoles);

export default router;
