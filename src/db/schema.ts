import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  integer,
  bigserial,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Exam Periods ────────────────────────────────────────────────────────────

export const examPeriods = pgTable('exam_periods', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:      varchar('name', { length: 255 }).notNull().unique(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate:   timestamp('end_date', { withTimezone: true }).notNull(),
  isActive:  boolean('is_active').notNull().default(false),
});

// ─── Exam Structure (Regions, Zones, Woredas) ────────────────────────────────

export const regions = pgTable('regions', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:      varchar('name', { length: 255 }).notNull().unique(),
  code:      varchar('code', { length: 50 }).unique(),
  isActive:  boolean('is_active').notNull().default(true),
});

export const zones = pgTable('zones', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  regionId:  uuid('region_id').notNull().references(() => regions.id),
  name:      varchar('name', { length: 255 }).notNull(),
  code:      varchar('code', { length: 50 }),
});

export const woredas = pgTable('woredas', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  zoneId:    uuid('zone_id').notNull().references(() => zones.id),
  name:      varchar('name', { length: 255 }).notNull(),
  code:      varchar('code', { length: 50 }),
});

// ─── Clusters ────────────────────────────────────────────────────────────────

export const powerClusters = pgTable('power_clusters', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:          varchar('name', { length: 255 }).notNull(),
  code:          varchar('code', { length: 50 }).unique(),
  contactPerson: varchar('contact_person', { length: 255 }),
  contactPhone:  varchar('contact_phone', { length: 50 }),
});

export const internetClusters = pgTable('internet_clusters', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:          varchar('name', { length: 255 }).notNull(),
  code:          varchar('code', { length: 50 }).unique(),
  contactPerson: varchar('contact_person', { length: 255 }),
  contactPhone:  varchar('contact_phone', { length: 50 }),
});

// ─── Exam Centers & Rooms ────────────────────────────────────────────────────

export const examCenters = pgTable('exam_centers', {
  id:                uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  woredaId:          uuid('woreda_id').notNull().references(() => woredas.id),
  powerClusterId:    uuid('power_cluster_id').references(() => powerClusters.id),
  internetClusterId: uuid('internet_cluster_id').references(() => internetClusters.id),
  name:              varchar('name', { length: 255 }).notNull(),
  code:              varchar('code', { length: 50 }).unique(),
  contactPerson:     varchar('contact_person', { length: 255 }),
  isActive:          boolean('is_active').notNull().default(true),
});

export const examRooms = pgTable('exam_rooms', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  examCenterId: uuid('exam_center_id').notNull().references(() => examCenters.id),
  name:         varchar('name', { length: 255 }).notNull(),
  capacity:     integer('capacity'),
  isActive:     boolean('is_active').notNull().default(true),
});

// ─── Users & Roles ───────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:                uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:              varchar('name', { length: 255 }).notNull(),
  email:             varchar('email', { length: 255 }).unique(),
  phoneNumber:       varchar('phone_number', { length: 30 }),
  passwordHash:      varchar('password_hash', { length: 255 }),
  role:              varchar('role', { length: 50 }).notNull(), // Invigilator, Site supervisor, etc.
  isActive:          boolean('is_active').notNull().default(true),
  // Scope bindings for users (Attribute-Based Access Control)
  regionId:          uuid('region_id').references(() => regions.id),
  examCenterId:      uuid('exam_center_id').references(() => examCenters.id),
  examRoomId:        uuid('exam_room_id').references(() => examRooms.id),
  powerClusterId:    uuid('power_cluster_id').references(() => powerClusters.id),
  internetClusterId: uuid('internet_cluster_id').references(() => internetClusters.id),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Devices ─────────────────────────────────────────────────────────────────

export const devices = pgTable('devices', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  deviceId:       varchar('device_id', { length: 255 }).notNull().unique(),
  userId:         uuid('user_id').unique().references(() => users.id),
  deviceName:     varchar('device_name', { length: 255 }),
  model:          varchar('model', { length: 255 }), // FR-005
  osVersion:      varchar('os_version', { length: 50 }), // FR-005
  appVersion:     varchar('app_version', { length: 50 }), // FR-005
  installationId: varchar('installation_id', { length: 255 }), // FR-005
  publicKey:      text('public_key'), // FR-005: For secure device binding
  isApproved:     boolean('is_approved').notNull().default(false), // FR-006: Device Approval
  isActive:       boolean('is_active').notNull().default(true),
  registeredAt:   timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }),
});

// ─── Incident Types & Categories ─────────────────────────────────────────────

export const issueCategories = pgTable('issue_categories', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:        varchar('name', { length: 255 }).notNull().unique(), // System, Power, Internet, etc.
});

export const incidentTypes = pgTable('incident_types', {
  id:                   uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  categoryId:           uuid('category_id').notNull().references(() => issueCategories.id),
  name:                 varchar('name', { length: 255 }).notNull().unique(),
  defaultPriority:      varchar('default_priority', { length: 20 }).notNull(),
  description:          text('description'),
  requiresAttachment:   boolean('requires_attachment').notNull().default(false),
  requiresExplanation:  boolean('requires_explanation').notNull().default(false),
  slaResponseMinutes:   integer('sla_response_minutes'),
  slaResolutionMinutes: integer('sla_resolution_minutes'),
  isActive:             boolean('is_active').notNull().default(true),
});

// ─── Incidents (Issues) ──────────────────────────────────────────────────────

export const incidents = pgTable('incidents', {
  id:                uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  trackingNumber:    varchar('tracking_number', { length: 50 }).unique(), // NEIMS-2026-AA-000001
  incidentTypeId:    uuid('incident_type_id').notNull().references(() => incidentTypes.id),
  regionId:          uuid('region_id').references(() => regions.id),
  examCenterId:      uuid('exam_center_id').references(() => examCenters.id),
  examRoomId:        uuid('exam_room_id').references(() => examRooms.id),
  reportedByUserId:  uuid('reported_by_user_id').notNull().references(() => users.id),
  deviceId:          uuid('device_id').references(() => devices.id),
  priority:          varchar('priority', { length: 20 }).notNull(),
  status:            varchar('status', { length: 30 }).notNull().default('Reported'),
  description:       text('description'),
  assignedUserId:    uuid('assigned_user_id').references(() => users.id),
  resolvedAt:        timestamp('resolved_at', { withTimezone: true }),
  resolutionSummary: text('resolution_summary'),
  reopenCount:       integer('reopen_count').notNull().default(0),
  localId:           varchar('local_id', { length: 255 }), // For offline sync
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Incident Status History ─────────────────────────────────────────────────

export const incidentStatusHistory = pgTable('incident_status_history', {
  id:              uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId:      uuid('incident_id').notNull().references(() => incidents.id),
  status:          varchar('status', { length: 30 }).notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => users.id),
  comment:         text('comment'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Attachments ─────────────────────────────────────────────────────────────

export const attachments = pgTable('attachments', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId: uuid('incident_id').notNull().references(() => incidents.id),
  filePath:   varchar('file_path', { length: 500 }).notNull(),
  fileType:   varchar('file_type', { length: 50 }),
  fileSize:   bigserial('file_size', { mode: 'number' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Comments ────────────────────────────────────────────────────────────────

export const comments = pgTable('comments', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentId: uuid('incident_id').notNull().references(() => incidents.id),
  authorId:   uuid('author_id').notNull().references(() => users.id),
  body:       text('body').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id:            bigserial('id', { mode: 'number' }).primaryKey(),
  incidentId:    uuid('incident_id').references(() => incidents.id),
  actorUserId:   uuid('actor_user_id').notNull().references(() => users.id),
  actorRole:     varchar('actor_role', { length: 50 }).notNull(),
  deviceId:      varchar('device_id', { length: 255 }),
  actionType:    varchar('action_type', { length: 100 }).notNull(),
  fieldChanged:  varchar('field_changed', { length: 100 }),
  previousValue: text('previous_value'),
  newValue:      text('new_value'),
  details:       text('details'), // New field for descriptive text
  occurredAt:    timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Utility Tables (Notifications, QR, SMS, Push Tokens) ────────────────────

export const notifications = pgTable('notifications', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:     uuid('user_id').notNull().references(() => users.id),
  incidentId: uuid('incident_id').references(() => incidents.id),
  message:    text('message').notNull(),
  isRead:     boolean('is_read').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qrCredentials = pgTable('qr_credentials', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:         uuid('user_id').notNull().references(() => users.id),
  payload:        text('payload').notNull(),
  signature:      text('signature').notNull(),
  isValid:        boolean('is_valid').notNull().default(true),
  issuedAt:       timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  invalidatedAt:  timestamp('invalidated_at', { withTimezone: true }),
});

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

// ─── Routing Rules ───────────────────────────────────────────────────────────

export const routingRules = pgTable('routing_rules', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  incidentTypeId: uuid('incident_type_id').references(() => incidentTypes.id),
  examFieldId:    uuid('exam_field_id').references(() => examCenters.id),
  targetUserId:   uuid('target_user_id').references(() => users.id),
  autoAssign:     boolean('auto_assign').notNull().default(false),
  priority:       integer('priority').notNull().default(100),
  isActive:       boolean('is_active').notNull().default(true),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Tracking Number Sequences ───────────────────────────────────────────────

export const trackingNumberSequences = pgTable('tracking_number_sequences', {
  regionId: uuid('region_id').notNull().references(() => regions.id),
  year:     integer('year').notNull(),
  lastSeq:  integer('last_seq').notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.regionId, t.year] }),
}));

// ─── Permissions ─────────────────────────────────────────────────────────────

export const permissions = pgTable('permissions', {
  id:        integer('id').primaryKey(),
  name:      varchar('name', { length: 100 }).notNull().unique(),
  groupName: varchar('group_name', { length: 100 }).notNull(),
});

// ─── Dynamic Roles ───────────────────────────────────────────────────────────

export const roles = pgTable('roles', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:        varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  isSystem:    boolean('is_system').notNull().default(false),
  isActive:    boolean('is_active').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable('role_permissions', {
  roleId:       uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: integer('permission_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
}));

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.roleId] }),
}));

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  region:          one(regions, { fields: [users.regionId], references: [regions.id] }),
  examCenter:      one(examCenters, { fields: [users.examCenterId], references: [examCenters.id] }),
  examRoom:        one(examRooms, { fields: [users.examRoomId], references: [examRooms.id] }),
  device:          one(devices, { fields: [users.id], references: [devices.userId] }),
  incidents:       many(incidents),
  notifications:   many(notifications),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  incidentType: one(incidentTypes, { fields: [incidents.incidentTypeId], references: [incidentTypes.id] }),
  reporter:     one(users,         { fields: [incidents.reportedByUserId], references: [users.id] }),
  assignedUser: one(users,         { fields: [incidents.assignedUserId], references: [users.id] }),
  examCenter:   one(examCenters,   { fields: [incidents.examCenterId], references: [examCenters.id] }),
  examRoom:     one(examRooms,     { fields: [incidents.examRoomId], references: [examRooms.id] }),
  region:       one(regions,       { fields: [incidents.regionId], references: [regions.id] }),
  attachments:  many(attachments),
  comments:     many(comments),
  auditLog:     many(auditLog),
  statusHistory:many(incidentStatusHistory),
  notifications:many(notifications),
}));

export const examCentersRelations = relations(examCenters, ({ one, many }) => ({
  woreda:          one(woredas, { fields: [examCenters.woredaId], references: [woredas.id] }),
  powerCluster:    one(powerClusters, { fields: [examCenters.powerClusterId], references: [powerClusters.id] }),
  internetCluster: one(internetClusters, { fields: [examCenters.internetClusterId], references: [internetClusters.id] }),
  rooms:           many(examRooms),
  incidents:       many(incidents),
}));

export const examRoomsRelations = relations(examRooms, ({ one, many }) => ({
  examCenter: one(examCenters, { fields: [examRooms.examCenterId], references: [examCenters.id] }),
  incidents:  many(incidents),
}));

export type ExamPeriod       = typeof examPeriods.$inferSelect;
export type NewExamPeriod    = typeof examPeriods.$inferInsert;

export type Region           = typeof regions.$inferSelect;
export type NewRegion        = typeof regions.$inferInsert;
export type Zone             = typeof zones.$inferSelect;
export type NewZone          = typeof zones.$inferInsert;
export type Woreda           = typeof woredas.$inferSelect;
export type NewWoreda        = typeof woredas.$inferInsert;

export type PowerCluster     = typeof powerClusters.$inferSelect;
export type NewPowerCluster  = typeof powerClusters.$inferInsert;
export type InternetCluster  = typeof internetClusters.$inferSelect;
export type NewInternetCluster = typeof internetClusters.$inferInsert;

export type ExamCenter       = typeof examCenters.$inferSelect;
export type NewExamCenter    = typeof examCenters.$inferInsert;
export type ExamRoom         = typeof examRooms.$inferSelect;
export type NewExamRoom      = typeof examRooms.$inferInsert;

export type User             = typeof users.$inferSelect;
export type NewUser          = typeof users.$inferInsert;

export type Device           = typeof devices.$inferSelect;
export type NewDevice        = typeof devices.$inferInsert;

export type IssueCategory    = typeof issueCategories.$inferSelect;
export type NewIssueCategory = typeof issueCategories.$inferInsert;
export type IncidentType     = typeof incidentTypes.$inferSelect;
export type NewIncidentType  = typeof incidentTypes.$inferInsert;

export type Incident         = typeof incidents.$inferSelect;
export type NewIncident      = typeof incidents.$inferInsert;
export type IncidentStatusHistory = typeof incidentStatusHistory.$inferSelect;
export type NewIncidentStatusHistory = typeof incidentStatusHistory.$inferInsert;

export type Attachment       = typeof attachments.$inferSelect;
export type Comment          = typeof comments.$inferSelect;
export type NewComment       = typeof comments.$inferInsert;
export type AuditLogEntry    = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

export type Notification     = typeof notifications.$inferSelect;
export type NewNotification  = typeof notifications.$inferInsert;
export type QrCredential     = typeof qrCredentials.$inferSelect;
export type SmsLog           = typeof smsLog.$inferSelect;
export type NewSmsLog        = typeof smsLog.$inferInsert;
export type PushToken        = typeof pushTokens.$inferSelect;
export type NewPushToken     = typeof pushTokens.$inferInsert;

export type RoutingRule          = typeof routingRules.$inferSelect;
export type NewRoutingRule       = typeof routingRules.$inferInsert;
export type TrackingNumberSequence    = typeof trackingNumberSequences.$inferSelect;
export type NewTrackingNumberSequence = typeof trackingNumberSequences.$inferInsert;

export type Permission       = typeof permissions.$inferSelect;
export type NewPermission    = typeof permissions.$inferInsert;

export type Role             = typeof roles.$inferSelect;
export type NewRole          = typeof roles.$inferInsert;
export type RolePermission   = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
export type UserRole         = typeof userRoles.$inferSelect;
export type NewUserRole      = typeof userRoles.$inferInsert;
