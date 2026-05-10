-- Migration 004: Gap Remediation
-- Adds routing_rules, tracking_number_sequences tables and new permissions

-- 1. Create routing_rules table
CREATE TABLE IF NOT EXISTS routing_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_type_id UUID REFERENCES incident_types(id),
    exam_field_id    UUID REFERENCES exam_centers(id),
    target_user_id   UUID REFERENCES users(id),
    auto_assign      BOOLEAN NOT NULL DEFAULT FALSE,
    priority         INTEGER NOT NULL DEFAULT 100,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (target_user_id IS NOT NULL)
);

-- 2. Create tracking_number_sequences table
CREATE TABLE IF NOT EXISTS tracking_number_sequences (
    region_id UUID    NOT NULL REFERENCES regions(id),
    year      INTEGER NOT NULL,
    last_seq  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (region_id, year)
);

-- 3. Insert new permissions
INSERT INTO permissions (name, group_name) VALUES
    ('locations.view',               'Locations'),
    ('locations.manage',             'Locations'),
    ('exam_periods.manage',          'Exam Periods'),
    ('incidents.confirm_resolution', 'Incidents')
ON CONFLICT (name) DO NOTHING;
