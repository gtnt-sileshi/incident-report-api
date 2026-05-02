/**
 * Drizzle ORM schema — mirrors all 18 tables from migration 001.
 * Used by repositories for type-safe query building.
 * The source of truth for table structure is still the SQL migration files.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  decimal,
  integer,
  serial,
  bigserial,
  unique,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:      varchar('name', { length: 255 }).notNull().unique(),
  type:      varchar('type', { length: 100 }).notNull(),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Permissions ─────────────────────────────────────────────────────────────

export const permissions = pgTable('permissions', {
  id:        serial('id').primaryKey(),
  name:      varchar('name', { length: 100 }).notNull().unique(),
  groupName: varchar('group_name', { length: 100 }).notNull(),
});

// ─── Org Permissions ─────────────────────────────────────────────────────────

export const orgPermissions = pgTable('org_permissions', {
  orgId:        uuid('org_id').notNull().references(() => organizations.id),
  permissionId: integer('permission_id').notNull().references(() => permissions.id),
}, (t) => ({
  pk: unique().on(t.orgId, t.permissionId),
}));

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId:        uuid('org_id').notNull().references(() => organizations.id),
  name:         varchar('name', { length: 255 }).notNull(),
  email:        varchar('email', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  role:         varchar('role', { length: 50 }).notNull(),
  isActive:     boolean('is_active').notNull().default(true),
  phoneNumber:  varchar('phone_number', { length: 30 }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── User Permissions ─────────────────────────────────────────────────────────

export const userPermissions = pgTable('user_permissions', {
  userId:       uuid('user_id').notNull().references(() => users.id),
  permissionId: integer('permission_id').notNull().references(() => permissions.id),
}, (t) => ({
  pk: unique().on(t.userId, t.permissionId),
}));

// ─── Devices ─────────────────────────────────────────────────────────────────

export const devices = pgTable('devices', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  deviceId:     varchar('device_id', { length: 255 }).notNull().unique(),
  userId:       uuid('user_id').unique().references(() => users.id),
  isActive:     boolean('is_active').notNull().default(true),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }),
});

// ─── Exam Fields ─────────────────────────────────────────────────────────────

export const examFields = pgTable('exam_fields', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:      varchar('name', { length: 255 }).notNull().unique(),
  location:  varchar('location', { length: 500 }),
  latitude:  decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  isActive:  boolean('is_active').notNull().default(true),
});

// ─── Exam Center Assignments ──────────────────────────────────────────────────

export const examCenterAssignments = pgTable('exam_center_assignments', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:      uuid('user_id').notNull().references(() => users.id),
  examFieldId: uuid('exam_field_id').notNull().references(() => examFields.id),
  assignedAt:  timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.userId, t.examFieldId),
}));

// ─── Incident Types ───────────────────────────────────────────────────────────

export const incidentTypes = pgTable('incident_types', {
  id:              uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:            varchar('name', { length: 255 }).notNull().unique(),
  defaultPriority: varchar('default_priority', { length: 10 }).notNull(),
  description:     text('description'),
  isActive:        boolean('is_active').notNull().default(true),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Routing Rules ────────────────────────────────────────────────────────────

export const routingRules = pgTable('routing_rules', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentTypeId: uuid('incident_type_id').notNull().references(() => incidentTypes.id),
  targetOrgId:    uuid('target_org_id').references(() => organizations.id),
  targetUserId:   uuid('target_user_id').references(() => users.id),
  autoAssign:     boolean('auto_assign').notNull().default(false),
  isActive:       boolean('is_active').notNull().default(true),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Incidents ────────────────────────────────────────────────────────────────

export const incidents = pgTable('incidents', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  examFieldId:      uuid('exam_field_id').notNull().references(() => examFields.id),
  incidentTypeId:   uuid('incident_type_id').notNull().references(() => incidentTypes.id),
  reportedByUserId: uuid('reported_by_user_id').notNull().references(() => users.id),
  deviceId:         uuid('device_id').references(() => devices.id),
  priority:         varchar('priority', { length: 10 }).notNull(),
  status:           varchar('status', { length: 20 }).notNull().default('Reported'),
  description:      text('description'),
  assignedOrgId:    uuid('assigned_org_id').references(() => organizations.id),
  assignedUserId:   uuid('assigned_user_id').references(() => users.id),
  resolvedAt:       timestamp('resolved_at', { withTimezone: true }),
  resolutionSummary: text('resolution_summary'),
  localId:          varchar('local_id', { length: 255 }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Attachments ──────────────────────────────────────────────────────────────

export const attachments = pgTable('attachments', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId: uuid('incident_id').notNull().references(() => incidents.id),
  filePath:   varchar('file_path', { length: 500 }).notNull(),
  fileType:   varchar('file_type', { length: 50 }),
  fileSize:   bigserial('file_size', { mode: 'number' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Comments ─────────────────────────────────────────────────────────────────

export const comments = pgTable('comments', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId: uuid('incident_id').notNull().references(() => incidents.id),
  authorId:   uuid('author_id').notNull().references(() => users.id),
  body:       text('body').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id:            bigserial('id', { mode: 'number' }).primaryKey(),
  incidentId:    uuid('incident_id').references(() => incidents.id),
  actorUserId:   uuid('actor_user_id').notNull().references(() => users.id),
  actorRole:     varchar('actor_role', { length: 50 }).notNull(),
  actorOrgId:    uuid('actor_org_id').notNull().references(() => organizations.id),
  deviceId:      varchar('device_id', { length: 255 }),
  actionType:    varchar('action_type', { length: 100 }).notNull(),
  fieldChanged:  varchar('field_changed', { length: 100 }),
  previousValue: text('previous_value'),
  newValue:      text('new_value'),
  routingRuleId: uuid('routing_rule_id').references(() => routingRules.id),
  occurredAt:    timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── QR Credentials ───────────────────────────────────────────────────────────

export const qrCredentials = pgTable('qr_credentials', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:         uuid('user_id').notNull().references(() => users.id),
  payload:        text('payload').notNull(),
  signature:      text('signature').notNull(),
  isValid:        boolean('is_valid').notNull().default(true),
  issuedAt:       timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  invalidatedAt:  timestamp('invalidated_at', { withTimezone: true }),
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:     uuid('user_id').notNull().references(() => users.id),
  incidentId: uuid('incident_id').references(() => incidents.id),
  message:    text('message').notNull(),
  isRead:     boolean('is_read').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── SMS Log ──────────────────────────────────────────────────────────────────

export const smsLog = pgTable('sms_log', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId:     uuid('incident_id').references(() => incidents.id),
  recipientPhone: varchar('recipient_phone', { length: 30 }).notNull(),
  messageBody:    text('message_body').notNull(),
  status:         varchar('status', { length: 20 }).notNull().default('pending'),
  attemptCount:   integer('attempt_count').notNull().default(0),
  lastAttemptAt:  timestamp('last_attempt_at', { withTimezone: true }),
  sentAt:         timestamp('sent_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Push Tokens ──────────────────────────────────────────────────────────────

export const pushTokens = pgTable('push_tokens', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:      uuid('user_id').notNull().references(() => users.id),
  tokenType:   varchar('token_type', { length: 20 }).notNull(),
  token:       text('token').notNull(),
  deviceId:    varchar('device_id', { length: 255 }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
}, (t) => ({
  uniq: unique().on(t.userId, t.tokenType, t.deviceId),
}));

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users:          many(users),
  orgPermissions: many(orgPermissions),
  routingRules:   many(routingRules),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization:    one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  userPermissions: many(userPermissions),
  device:          one(devices, { fields: [users.id], references: [devices.userId] }),
  examAssignments: many(examCenterAssignments),
  incidents:       many(incidents),
  notifications:   many(notifications),
  qrCredentials:   many(qrCredentials),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  examField:    one(examFields,    { fields: [incidents.examFieldId],    references: [examFields.id] }),
  incidentType: one(incidentTypes, { fields: [incidents.incidentTypeId], references: [incidentTypes.id] }),
  reporter:     one(users,         { fields: [incidents.reportedByUserId], references: [users.id] }),
  assignedOrg:  one(organizations, { fields: [incidents.assignedOrgId],  references: [organizations.id] }),
  assignedUser: one(users,         { fields: [incidents.assignedUserId], references: [users.id] }),
  attachments:  many(attachments),
  comments:     many(comments),
  auditLog:     many(auditLog),
  notifications: many(notifications),
}));

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type Organization       = typeof organizations.$inferSelect;
export type NewOrganization    = typeof organizations.$inferInsert;
export type Permission         = typeof permissions.$inferSelect;
export type User               = typeof users.$inferSelect;
export type NewUser            = typeof users.$inferInsert;
export type Device             = typeof devices.$inferSelect;
export type NewDevice          = typeof devices.$inferInsert;
export type ExamField          = typeof examFields.$inferSelect;
export type NewExamField       = typeof examFields.$inferInsert;
export type IncidentType       = typeof incidentTypes.$inferSelect;
export type NewIncidentType    = typeof incidentTypes.$inferInsert;
export type RoutingRule        = typeof routingRules.$inferSelect;
export type NewRoutingRule     = typeof routingRules.$inferInsert;
export type Incident           = typeof incidents.$inferSelect;
export type NewIncident        = typeof incidents.$inferInsert;
export type Attachment         = typeof attachments.$inferSelect;
export type Comment            = typeof comments.$inferSelect;
export type NewComment         = typeof comments.$inferInsert;
export type AuditLogEntry      = typeof auditLog.$inferSelect;
export type NewAuditLogEntry   = typeof auditLog.$inferInsert;
export type QrCredential       = typeof qrCredentials.$inferSelect;
export type Notification       = typeof notifications.$inferSelect;
export type NewNotification    = typeof notifications.$inferInsert;
export type SmsLog             = typeof smsLog.$inferSelect;
export type NewSmsLog          = typeof smsLog.$inferInsert;
export type ExamCenterAssignment    = typeof examCenterAssignments.$inferSelect;
export type NewExamCenterAssignment = typeof examCenterAssignments.$inferInsert;
export type PushToken          = typeof pushTokens.$inferSelect;
export type NewPushToken       = typeof pushTokens.$inferInsert;
