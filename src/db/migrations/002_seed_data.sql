-- Migration 002: Seed Data
-- Inserts initial permissions, incident types, and organizations.
-- Uses ON CONFLICT DO NOTHING for idempotency (safe to re-run).

-- ============================================================
-- Permissions (~35 granular permissions across 11 groups)
-- ============================================================

-- Incidents group
INSERT INTO permissions (name, group_name) VALUES
    ('incidents.view',          'Incidents'),
    ('incidents.create',        'Incidents'),
    ('incidents.edit',          'Incidents'),
    ('incidents.delete',        'Incidents'),
    ('incidents.assign',        'Incidents'),
    ('incidents.update_status', 'Incidents'),
    ('incidents.resolve',       'Incidents'),
    ('incidents.escalate',      'Incidents'),
    ('incidents.comment',       'Incidents'),
    ('incidents.attach',        'Incidents')
ON CONFLICT (name) DO NOTHING;

-- Users group
INSERT INTO permissions (name, group_name) VALUES
    ('users.view',               'Users'),
    ('users.create',             'Users'),
    ('users.edit',               'Users'),
    ('users.delete',             'Users'),
    ('users.approve',            'Users'),
    ('users.assign_permissions', 'Users')
ON CONFLICT (name) DO NOTHING;

-- Organizations group
INSERT INTO permissions (name, group_name) VALUES
    ('organizations.view',               'Organizations'),
    ('organizations.create',             'Organizations'),
    ('organizations.edit',               'Organizations'),
    ('organizations.delete',             'Organizations'),
    ('organizations.assign_permissions', 'Organizations')
ON CONFLICT (name) DO NOTHING;

-- Devices group
INSERT INTO permissions (name, group_name) VALUES
    ('devices.view',       'Devices'),
    ('devices.register',   'Devices'),
    ('devices.deactivate', 'Devices')
ON CONFLICT (name) DO NOTHING;

-- Exam Fields group
INSERT INTO permissions (name, group_name) VALUES
    ('exam_fields.view',   'Exam Fields'),
    ('exam_fields.create', 'Exam Fields'),
    ('exam_fields.edit',   'Exam Fields'),
    ('exam_fields.delete', 'Exam Fields')
ON CONFLICT (name) DO NOTHING;

-- Incident Types (Catalog) group
INSERT INTO permissions (name, group_name) VALUES
    ('catalog.view',   'Incident Types'),
    ('catalog.create', 'Incident Types'),
    ('catalog.edit',   'Incident Types'),
    ('catalog.delete', 'Incident Types')
ON CONFLICT (name) DO NOTHING;

-- Routing Rules group
INSERT INTO permissions (name, group_name) VALUES
    ('routing.view',   'Routing Rules'),
    ('routing.create', 'Routing Rules'),
    ('routing.edit',   'Routing Rules'),
    ('routing.delete', 'Routing Rules')
ON CONFLICT (name) DO NOTHING;

-- Reports group
INSERT INTO permissions (name, group_name) VALUES
    ('reports.view',     'Reports'),
    ('reports.export',   'Reports'),
    ('reports.generate', 'Reports')
ON CONFLICT (name) DO NOTHING;

-- Audit Log group
INSERT INTO permissions (name, group_name) VALUES
    ('audit.view',   'Audit Log'),
    ('audit.search', 'Audit Log')
ON CONFLICT (name) DO NOTHING;

-- QR & Identity group
INSERT INTO permissions (name, group_name) VALUES
    ('qr.view', 'QR & Identity'),
    ('qr.scan', 'QR & Identity')
ON CONFLICT (name) DO NOTHING;

-- Notifications & Alerts group
INSERT INTO permissions (name, group_name) VALUES
    ('alerts.sms_trigger',  'Notifications & Alerts'),
    ('alerts.push_trigger', 'Notifications & Alerts')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Incident Types (8 seed types with default priorities)
-- ============================================================

INSERT INTO incident_types (id, name, default_priority) VALUES
    (gen_random_uuid(), 'Students Access Management Issue', 'Medium'),
    (gen_random_uuid(), 'Access Management Issue',          'Medium'),
    (gen_random_uuid(), 'Power Failure',                    'High'),
    (gen_random_uuid(), 'Network Outage',                   'High'),
    (gen_random_uuid(), 'Security Incident',                'High'),
    (gen_random_uuid(), 'Exam-System Crash',                'High'),
    (gen_random_uuid(), 'Wellness Incident',                'Medium'),
    (gen_random_uuid(), 'Other',                            'Low')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Organizations (6 initial organizations)
-- ============================================================

INSERT INTO organizations (id, name, type) VALUES
    (gen_random_uuid(), 'ITDB',                          'government'),
    (gen_random_uuid(), 'Ministry of Education',         'government'),
    (gen_random_uuid(), 'Addis Ababa Education Bureau',  'government'),
    (gen_random_uuid(), 'Ethio Telecom',                 'telecom'),
    (gen_random_uuid(), 'ELPA',                          'utility'),
    (gen_random_uuid(), 'Security Police',               'security')
ON CONFLICT (name) DO NOTHING;
