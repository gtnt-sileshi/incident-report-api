-- Migration 006: Grant super_admin all permissions
-- Assigns every permission in the permissions table to the super_admin role.
-- Uses ON CONFLICT DO NOTHING so it is safe to run on databases where
-- some permissions were already assigned.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;
