-- Migration 001: Initial Schema
-- Creates all 18 tables in dependency order (referenced tables before referencing tables)

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Organizations
CREATE TABLE organizations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL UNIQUE,
    type          VARCHAR(100) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Permissions (system-defined, seed data, not user-editable)
-- ~35 granular permissions across 11 groups (group_name is for UI grouping only)
CREATE TABLE permissions (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    group_name VARCHAR(100) NOT NULL
);

-- 3. Org-level permission grants
CREATE TABLE org_permissions (
    org_id         UUID NOT NULL REFERENCES organizations(id),
    permission_id  INT  NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (org_id, permission_id)
);

-- 4. Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    password_hash   VARCHAR(255),
    role            VARCHAR(50) NOT NULL,  -- 'super_admin','org_admin','bureau_staff','it_rep','moe','aa_edu','external'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    phone_number    VARCHAR(30),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. User-level permission grants
CREATE TABLE user_permissions (
    user_id        UUID NOT NULL REFERENCES users(id),
    permission_id  INT  NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (user_id, permission_id)
);

-- 6. Devices (IT Representatives)
CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       VARCHAR(255) NOT NULL UNIQUE,  -- hardware identifier
    user_id         UUID UNIQUE REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ
);

-- 7. Exam Fields
CREATE TABLE exam_fields (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name      VARCHAR(255) NOT NULL UNIQUE,
    location  VARCHAR(500),
    latitude  DECIMAL(9,6),
    longitude DECIMAL(9,6),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 8. Exam Center Assignments
CREATE TABLE exam_center_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    exam_field_id UUID NOT NULL REFERENCES exam_fields(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, exam_field_id)
);

-- 9. Incident Type Catalog
CREATE TABLE incident_types (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(255) NOT NULL UNIQUE,
    default_priority VARCHAR(10) NOT NULL CHECK (default_priority IN ('Low','Medium','High')),
    description      TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Routing Rules
CREATE TABLE routing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_type_id    UUID NOT NULL REFERENCES incident_types(id),
    target_org_id       UUID REFERENCES organizations(id),
    target_user_id      UUID REFERENCES users(id),
    auto_assign         BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (target_org_id IS NOT NULL OR target_user_id IS NOT NULL)
);

-- 11. Incidents
CREATE TABLE incidents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_field_id       UUID NOT NULL REFERENCES exam_fields(id),
    incident_type_id    UUID NOT NULL REFERENCES incident_types(id),
    reported_by_user_id UUID NOT NULL REFERENCES users(id),
    device_id           UUID REFERENCES devices(id),
    priority            VARCHAR(10) NOT NULL CHECK (priority IN ('Low','Medium','High')),
    status              VARCHAR(20) NOT NULL DEFAULT 'Reported'
                            CHECK (status IN ('Reported','Assigned','In-Progress','Resolved')),
    description         TEXT,
    assigned_org_id     UUID REFERENCES organizations(id),
    assigned_user_id    UUID REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    resolution_summary  TEXT,
    local_id            VARCHAR(255),  -- mobile-generated ID for dedup
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_status       ON incidents(status);
CREATE INDEX idx_incidents_priority     ON incidents(priority);
CREATE INDEX idx_incidents_exam_field   ON incidents(exam_field_id);
CREATE INDEX idx_incidents_assigned_org ON incidents(assigned_org_id);
CREATE INDEX idx_incidents_created_at   ON incidents(created_at);

-- 12. Attachments
CREATE TABLE attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id  UUID NOT NULL REFERENCES incidents(id),
    file_path    VARCHAR(500) NOT NULL,
    file_type    VARCHAR(50),  -- 'photo', 'video', 'document'
    file_size    BIGINT,
    uploaded_by  UUID NOT NULL REFERENCES users(id),
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Comments
CREATE TABLE comments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id  UUID NOT NULL REFERENCES incidents(id),
    author_id    UUID NOT NULL REFERENCES users(id),
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Audit Log (append-only)
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    incident_id     UUID REFERENCES incidents(id),
    actor_user_id   UUID NOT NULL REFERENCES users(id),
    actor_role      VARCHAR(50) NOT NULL,
    actor_org_id    UUID NOT NULL REFERENCES organizations(id),
    device_id       VARCHAR(255),
    action_type     VARCHAR(100) NOT NULL,
    field_changed   VARCHAR(100),
    previous_value  TEXT,
    new_value       TEXT,
    routing_rule_id UUID REFERENCES routing_rules(id),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_incident   ON audit_log(incident_id);
CREATE INDEX idx_audit_actor      ON audit_log(actor_user_id);
CREATE INDEX idx_audit_occurred   ON audit_log(occurred_at);
CREATE INDEX idx_audit_action     ON audit_log(action_type);

-- Prevent UPDATE and DELETE on audit_log (append-only enforcement)
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- 15. QR Credentials
CREATE TABLE qr_credentials (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id),
    payload        TEXT NOT NULL,       -- base64-encoded signed payload
    signature      TEXT NOT NULL,       -- ECDSA signature (hex)
    is_valid       BOOLEAN NOT NULL DEFAULT TRUE,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ
);

-- 16. Notifications
CREATE TABLE notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id),
    incident_id  UUID REFERENCES incidents(id),
    message      TEXT NOT NULL,
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. SMS Log
CREATE TABLE sms_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id     UUID REFERENCES incidents(id),
    recipient_phone VARCHAR(30) NOT NULL,
    message_body    TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending','sent','failed'
    attempt_count   INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Push Tokens (FCM for Flutter mobile, Web Push subscriptions for browser)
CREATE TABLE push_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    token_type    VARCHAR(20) NOT NULL CHECK (token_type IN ('fcm', 'web_push')),
    token         TEXT NOT NULL,          -- FCM registration token or Web Push subscription JSON
    device_id     VARCHAR(255),           -- hardware device ID for mobile tokens
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ,
    UNIQUE (user_id, token_type, device_id)
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);
