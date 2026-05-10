-- Migration 005: Dynamic Roles
-- Creates roles, role_permissions, and user_roles tables.
-- Seeds 11 system roles, assigns default permissions, migrates existing users,
-- and adds 4 new role-management permissions.

-- ============================================================
-- 1. roles table
-- ============================================================
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. role_permissions junction
-- ============================================================
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT  NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- 3. user_roles junction
-- ============================================================
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user       ON user_roles(user_id);
CREATE INDEX idx_user_roles_role       ON user_roles(role_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);

-- ============================================================
-- 4. Seed 11 system roles
-- ============================================================
INSERT INTO roles (name, description, is_system) VALUES
    ('super_admin',         'Full system access — cannot be modified',        TRUE),
    ('national_command',    'National-level incident monitoring and command', TRUE),
    ('regional_dispatcher', 'Regional incident dispatch and assignment',      TRUE),
    ('center_coordinator',  'Exam center coordination',                       TRUE),
    ('it_rep',              'Field IT representative — mobile reporting',     TRUE),
    ('invigilator',         'Exam room invigilator — incident reporting',     TRUE),
    ('moe_observer',        'Ministry of Education — read-only observer',     TRUE),
    ('aa_education_bureau', 'AA Education Bureau — read-only observer',       TRUE),
    ('police_liaison',      'Security incident liaison',                      TRUE),
    ('power_officer',       'EEU power cluster officer',                      TRUE),
    ('internet_officer',    'Ethio Telecom internet cluster officer',         TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 5. Assign default permissions to seeded roles
-- ============================================================

-- super_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- national_command: full incident + reporting + admin read access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'national_command'
  AND p.name IN (
    'incidents.view', 'incidents.create', 'incidents.assign',
    'incidents.update_status', 'incidents.resolve', 'incidents.escalate',
    'incidents.comment', 'incidents.attach', 'incidents.confirm_resolution',
    'reports.view', 'reports.export', 'reports.generate',
    'audit.view', 'audit.search',
    'users.view', 'devices.view',
    'catalog.view', 'routing.view',
    'locations.view', 'exam_periods.manage'
  )
ON CONFLICT DO NOTHING;

-- regional_dispatcher: incident management + assignment
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'regional_dispatcher'
  AND p.name IN (
    'incidents.view', 'incidents.assign', 'incidents.update_status',
    'incidents.comment', 'incidents.escalate',
    'reports.view', 'users.view', 'locations.view'
  )
ON CONFLICT DO NOTHING;

-- center_coordinator: exam center level incident management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'center_coordinator'
  AND p.name IN (
    'incidents.view', 'incidents.create', 'incidents.assign',
    'incidents.update_status', 'incidents.comment', 'incidents.attach',
    'users.view', 'locations.view'
  )
ON CONFLICT DO NOTHING;

-- it_rep: field reporting — create + attach + comment
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'it_rep'
  AND p.name IN (
    'incidents.view', 'incidents.create', 'incidents.comment', 'incidents.attach'
  )
ON CONFLICT DO NOTHING;

-- invigilator: exam room — create incidents only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'invigilator'
  AND p.name IN ('incidents.view', 'incidents.create')
ON CONFLICT DO NOTHING;

-- moe_observer: read-only observer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'moe_observer'
  AND p.name IN (
    'incidents.view', 'reports.view', 'reports.export',
    'catalog.view', 'locations.view'
  )
ON CONFLICT DO NOTHING;

-- aa_education_bureau: read-only observer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'aa_education_bureau'
  AND p.name IN (
    'incidents.view', 'reports.view', 'reports.export',
    'catalog.view', 'locations.view'
  )
ON CONFLICT DO NOTHING;

-- police_liaison: security incident view + status update
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'police_liaison'
  AND p.name IN (
    'incidents.view', 'incidents.update_status', 'incidents.comment'
  )
ON CONFLICT DO NOTHING;

-- power_officer: view incidents + comment (power-related)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'power_officer'
  AND p.name IN (
    'incidents.view', 'incidents.comment', 'incidents.update_status'
  )
ON CONFLICT DO NOTHING;

-- internet_officer: view incidents + comment (internet-related)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'internet_officer'
  AND p.name IN (
    'incidents.view', 'incidents.comment', 'incidents.update_status'
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Migrate existing users into user_roles
-- ============================================================
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = u.role
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. Add 4 new permissions for role management
-- ============================================================
INSERT INTO permissions (name, group_name) VALUES
    ('roles.view',   'Roles'),
    ('roles.create', 'Roles'),
    ('roles.edit',   'Roles'),
    ('roles.delete', 'Roles')
ON CONFLICT (name) DO NOTHING;
