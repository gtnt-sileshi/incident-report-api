-- Migration 006: QR & Identity
-- Adds permissions for identity scanning and viewing.
-- Assigns these permissions to security-related roles.

-- 1. Add new permissions
INSERT INTO permissions (name, group_name) VALUES
    ('identity.view', 'Identity'),
    ('identity.scan', 'Identity')
ON CONFLICT (name) DO NOTHING;

-- 2. Assign to super_admin (all permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'super_admin'
  AND p.name IN ('identity.view', 'identity.scan')
ON CONFLICT DO NOTHING;

-- 3. Assign to police_liaison (view and scan)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'police_liaison'
  AND p.name IN ('identity.view', 'identity.scan')
ON CONFLICT DO NOTHING;

-- 4. Assign to national_command (view and scan)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'national_command'
  AND p.name IN ('identity.view', 'identity.scan')
ON CONFLICT DO NOTHING;

-- 5. Assign to regional_dispatcher (view)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'regional_dispatcher'
  AND p.name IN ('identity.view')
ON CONFLICT DO NOTHING;
