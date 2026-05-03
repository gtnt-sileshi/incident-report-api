
# Exam Incident Support Portal - Complete API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Authentication System](#authentication-system)
4. [Complete API Reference](#complete-api-reference)
5. [Complete Workflows](#complete-workflows)
6. [Error Handling](#error-handling)

---

## Overview

The Exam Incident Support Portal API is a RESTful API built with Express.js that manages exam incident reporting and resolution across multiple organizations in Ethiopia. The system supports:

- **Multi-tenant architecture** with organization-level isolation
- **Role-based access control (RBAC)** with granular permissions
- **Incident lifecycle management** from reporting to resolution
- **Device registration** for IT Representatives
- **QR-based identity verification**
- **Real-time notifications** via WebSocket, Push, and SMS
- **Comprehensive audit logging** for compliance

**Base URL:** `http://localhost:3000`

**API Version:** 1.0

---

## Prerequisites & Setup

### 1. System Requirements

- **Node.js**: v18+ 
- **PostgreSQL**: v14+
- **Redis**: v6+
- **Operating System**: Windows/Linux/macOS

### 2. Environment Configuration

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/exam_incident_portal

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=8h

# File Storage
ATTACHMENT_STORAGE_PATH=./uploads
MAX_FILE_SIZE_MB=50

# ECDSA Keys for QR (generate with openssl)
QR_PRIVATE_KEY_PATH=./ec-private.pem
QR_PUBLIC_KEY_PATH=./ec-public.pem

# SMS Gateway
SMS_GATEWAY_URL=https://sms-gateway.ethiotelecom.et/api/send
SMS_GATEWAY_API_KEY=your-api-key
SMS_GATEWAY_SENDER_ID=ITDB

# Escalation thresholds (minutes)
ESCALATION_HIGH_PRIORITY_MINUTES=30
ESCALATION_MEDIUM_PRIORITY_MINUTES=90
```

### 3. Database Setup

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Run migrations (creates all 18 tables)
npm run migrate

# Verify database
psql -d exam_incident_portal -c "\dt"
```

**Expected tables:**
- organizations
- permissions
- org_permissions
- users
- user_permissions
- devices
- exam_fields
- exam_center_assignments
- incident_types
- routing_rules
- incidents
- attachments
- comments
- audit_log
- qr_credentials
- notifications
- sms_log
- push_tokens

### 4. Start the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

**Server starts on:** `http://localhost:3000`

### 5. Verify Installation

```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-02T10:30:00.000Z",
  "uptime": 123.456
}
```

---

## Authentication System

### Overview

The API uses **JWT (JSON Web Tokens)** for authentication with two token types:

1. **User Tokens** - For web portal users (email/password login)
2. **Device Tokens** - For mobile IT Representatives (device ID verification)

All endpoints except `/health` and `/api/auth/login` require authentication via the `Authorization` header.

### Token Format

```
Authorization: Bearer <jwt-token>
```

### JWT Payload Structure

**User Token:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "super_admin",
  "orgId": "org-uuid",
  "type": "user",
  "iat": 1234567890,
  "exp": 1234596690
}
```

**Device Token:**
```json
{
  "sub": "user-uuid",
  "deviceId": "DEVICE-12345",
  "role": "it_rep",
  "orgId": "org-uuid",
  "type": "device",
  "iat": 1234567890,
  "exp": 1234596690
}
```

---

## Complete API Reference

### 1. Authentication Endpoints

#### 1.1 User Login

**Purpose:** Authenticate a user with email and password, receive a JWT token for subsequent requests.

**Endpoint:** `POST /api/auth/login`

**Authentication:** None required

**Request Body:**
```json
{
  "email": "admin@itdb.gov.et",
  "password": "SecurePassword123"
}
```

**Validation Rules:**
- `email`: Must be valid email format
- `password`: Required, minimum 1 character

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjA3YjFhMi0zNGM1LTRkZTYtOGE3Yi0xMjM0NTY3ODkwYWIiLCJlbWFpbCI6ImFkbWluQGl0ZGIuZ292LmV0Iiwicm9sZSI6InN1cGVyX2FkbWluIiwib3JnSWQiOiI3YjIzNGU1Ni03ODkwLTRhYmMtYjEyMy00NTY3ODkwYWJjZGUiLCJ0eXBlIjoidXNlciIsImlhdCI6MTcxNDY1MDAwMCwiZXhwIjoxNzE0Njc4ODAwfQ...",
  "user": {
    "id": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "name": "Super Admin",
    "email": "admin@itdb.gov.et",
    "role": "super_admin",
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde"
  }
}
```

**Error Responses:**

- **401 Unauthorized** - Invalid credentials
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

- **400 Bad Request** - Validation error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format"
  }
}
```

**Example Usage:**
```bash
# Login and save token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@itdb.gov.et",
    "password": "SecurePassword123"
  }' | jq -r '.token' > token.txt

# Export token for subsequent requests
export TOKEN=$(cat token.txt)

# Verify token works
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 1.2 Device Verification (Mobile Login)

**Purpose:** Authenticate an IT Representative's mobile device using hardware device ID. Used by the Flutter mobile app for offline-capable authentication.

**Endpoint:** `POST /api/auth/device-verify`

**Authentication:** None required

**Request Body:**
```json
{
  "deviceId": "DEVICE-ABC123",
  "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab"
}
```

**Validation Rules:**
- `deviceId`: Required, minimum 1 character (hardware identifier)
- `userId`: Required, must be valid UUID

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "device": {
    "id": "device-uuid",
    "deviceId": "DEVICE-ABC123"
  },
  "user": {
    "id": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "name": "John Doe",
    "role": "it_rep",
    "orgId": "org-uuid"
  }
}
```

**Error Responses:**

- **401 Unauthorized** - User not found or not IT Rep
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "User not found or not authorized"
  }
}
```

- **403 Forbidden** - Device not registered to user
```json
{
  "error": {
    "code": "DEVICE_NOT_AUTHORIZED",
    "message": "This device is not registered to the specified user"
  }
}
```

- **404 Not Found** - Device not registered
```json
{
  "error": {
    "code": "DEVICE_NOT_FOUND",
    "message": "Device not registered"
  }
}
```

**Example Usage:**
```bash
# Device login
curl -X POST http://localhost:3000/api/auth/device-verify \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVICE-ABC123",
    "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab"
  }'
```

---

#### 1.3 Logout

**Purpose:** Revoke all active sessions for the current user by invalidating their tokens in Redis.

**Endpoint:** `POST /api/auth/logout`

**Authentication:** Required (Bearer token)

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Error Responses:**

- **401 Unauthorized** - Missing or invalid token
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

---

### 2. Organization Management

#### 2.1 List Organizations

**Purpose:** Retrieve all organizations in the system. Super admins see all organizations; other roles see only their own organization.

**Endpoint:** `GET /api/organizations`

**Authentication:** Required

**Required Permission:** `organizations.view`

**Query Parameters:**
- `includeInactive` (optional): `true` | `false` - Include deactivated organizations (default: false)

**Success Response (200 OK):**
```json
{
  "organizations": [
    {
      "id": "7b234e56-7890-4abc-b123-4567890abcde",
      "name": "ITDB",
      "type": "government",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": "8c345f67-8901-5bcd-c234-5678901bcdef",
      "name": "Ministry of Education",
      "type": "government",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
# List active organizations
curl http://localhost:3000/api/organizations \
  -H "Authorization: Bearer $TOKEN"

# Include inactive organizations
curl "http://localhost:3000/api/organizations?includeInactive=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 2.2 Create Organization

**Purpose:** Create a new organization in the system.

**Endpoint:** `POST /api/organizations`

**Authentication:** Required

**Required Permission:** `organizations.create`

**Request Body:**
```json
{
  "name": "Addis Ababa Education Bureau",
  "type": "government",
  "isActive": true
}
```

**Validation Rules:**
- `name`: Required, 1-255 characters, must be unique
- `type`: Required, 1-100 characters
- `isActive`: Optional, boolean (default: true)

**Success Response (201 Created):**
```json
{
  "organization": {
    "id": "9d456g78-9012-6cde-d345-6789012cdefg",
    "name": "Addis Ababa Education Bureau",
    "type": "government",
    "isActive": true,
    "createdAt": "2026-05-02T10:30:00.000Z",
    "updatedAt": "2026-05-02T10:30:00.000Z"
  }
}
```

**Error Responses:**

- **409 Conflict** - Organization name already exists
```json
{
  "error": {
    "code": "DUPLICATE_ORGANIZATION",
    "message": "Organization with this name already exists"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Addis Ababa Education Bureau",
    "type": "government"
  }'
```

---

#### 2.3 Update Organization

**Purpose:** Update an existing organization's details.

**Endpoint:** `PATCH /api/organizations/:id`

**Authentication:** Required

**Required Permission:** `organizations.edit`

**URL Parameters:**
- `id`: Organization UUID

**Request Body (all fields optional):**
```json
{
  "name": "Updated Organization Name",
  "type": "utility",
  "isActive": false
}
```

**Success Response (200 OK):**
```json
{
  "organization": {
    "id": "9d456g78-9012-6cde-d345-6789012cdefg",
    "name": "Updated Organization Name",
    "type": "utility",
    "isActive": false,
    "createdAt": "2026-05-02T10:30:00.000Z",
    "updatedAt": "2026-05-02T11:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/organizations/9d456g78-9012-6cde-d345-6789012cdefg \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Organization Name"
  }'
```

---

#### 2.4 Deactivate Organization

**Purpose:** Deactivate an organization and revoke all active sessions for its users.

**Endpoint:** `PATCH /api/organizations/:id/deactivate`

**Authentication:** Required

**Required Permission:** `organizations.edit`

**URL Parameters:**
- `id`: Organization UUID

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "organization": {
    "id": "9d456g78-9012-6cde-d345-6789012cdefg",
    "name": "Organization Name",
    "type": "government",
    "isActive": false,
    "createdAt": "2026-05-02T10:30:00.000Z",
    "updatedAt": "2026-05-02T11:30:00.000Z"
  }
}
```

**Side Effects:**
- Sets `isActive = false` on the organization
- Revokes all JWT sessions for users in this organization
- Users must re-authenticate after organization is reactivated

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/organizations/9d456g78-9012-6cde-d345-6789012cdefg/deactivate \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 2.5 Set Organization Permissions

**Purpose:** Replace the organization's permission set. This cascades to all users - any permissions removed from the org are automatically removed from all users in that org.

**Endpoint:** `PATCH /api/organizations/:id/permissions`

**Authentication:** Required

**Required Permission:** `organizations.assign_permissions`

**URL Parameters:**
- `id`: Organization UUID

**Request Body:**
```json
{
  "permissions": [
    "incidents.view",
    "incidents.create",
    "incidents.update_status",
    "users.view",
    "users.create"
  ]
}
```

**Success Response (200 OK):**
```json
{
  "permissions": [
    "incidents.view",
    "incidents.create",
    "incidents.update_status",
    "users.view",
    "users.create"
  ]
}
```

**Side Effects:**
- Replaces org_permissions entries for this organization
- Removes any user permissions that are no longer in the org's permission set
- Revokes sessions for affected users

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/organizations/9d456g78-9012-6cde-d345-6789012cdefg/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "incidents.view",
      "incidents.create",
      "users.view"
    ]
  }'
```

---

### 3. User Management

#### 3.1 Get Current User

**Purpose:** Retrieve the authenticated user's profile and effective permissions (intersection of user permissions and org permissions).

**Endpoint:** `GET /api/users/me`

**Authentication:** Required

**Required Permission:** None (any authenticated user)

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "name": "John Doe",
    "email": "john@itdb.gov.et",
    "role": "bureau_staff",
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "isActive": true,
    "phoneNumber": "+251911234567",
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-05-02T10:00:00.000Z"
  },
  "effectivePermissions": [
    "incidents.view",
    "incidents.create",
    "incidents.comment",
    "users.view"
  ]
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 3.2 List Users

**Purpose:** List users with role-based scoping. Super admins see all users; other roles see only users in their organization.

**Endpoint:** `GET /api/users`

**Authentication:** Required

**Required Permission:** `users.view`

**Success Response (200 OK):**
```json
{
  "users": [
    {
      "id": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
      "name": "John Doe",
      "email": "john@itdb.gov.et",
      "role": "bureau_staff",
      "isActive": true,
      "phoneNumber": "+251911234567",
      "createdAt": "2026-01-15T08:00:00.000Z",
      "updatedAt": "2026-05-02T10:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 3.3 Create User

**Purpose:** Create a new user account. For IT Representatives, optionally register their device simultaneously.

**Endpoint:** `POST /api/users`

**Authentication:** Required

**Required Permission:** `users.create`

**Request Body:**
```json
{
  "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
  "name": "Jane Smith",
  "email": "jane@itdb.gov.et",
  "password": "SecurePassword123",
  "role": "it_rep",
  "phoneNumber": "+251922345678",
  "deviceId": "DEVICE-XYZ789"
}
```

**Validation Rules:**
- `orgId`: Required, must be valid UUID
- `name`: Required, 1-255 characters
- `email`: Optional, must be valid email format, unique
- `password`: Optional, minimum 8 characters (required for web users)
- `role`: Required, one of: `super_admin`, `org_admin`, `bureau_staff`, `it_rep`, `moe`, `aa_edu`, `external`
- `phoneNumber`: Optional, max 30 characters
- `deviceId`: Optional, for IT Reps only (registers device simultaneously)

**Success Response (201 Created):**
```json
{
  "user": {
    "id": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "name": "Jane Smith",
    "email": "jane@itdb.gov.et",
    "role": "it_rep",
    "isActive": true,
    "phoneNumber": "+251922345678",
    "createdAt": "2026-05-02T11:00:00.000Z",
    "updatedAt": "2026-05-02T11:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
# Create web user
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "name": "Jane Smith",
    "email": "jane@itdb.gov.et",
    "password": "SecurePassword123",
    "role": "bureau_staff",
    "phoneNumber": "+251922345678"
  }'

# Create IT Rep with device
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "name": "Mobile User",
    "role": "it_rep",
    "phoneNumber": "+251933456789",
    "deviceId": "DEVICE-XYZ789"
  }'
```

---

#### 3.4 Update User

**Purpose:** Update an existing user's details.

**Endpoint:** `PATCH /api/users/:id`

**Authentication:** Required

**Required Permission:** `users.edit`

**URL Parameters:**
- `id`: User UUID

**Request Body (all fields optional):**
```json
{
  "name": "Jane Smith Updated",
  "email": "jane.new@itdb.gov.et",
  "password": "NewSecurePassword456",
  "role": "org_admin",
  "phoneNumber": "+251944567890",
  "isActive": true
}
```

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "name": "Jane Smith Updated",
    "email": "jane.new@itdb.gov.et",
    "role": "org_admin",
    "isActive": true,
    "phoneNumber": "+251944567890",
    "createdAt": "2026-05-02T11:00:00.000Z",
    "updatedAt": "2026-05-02T12:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/users/af18c2b3-45d6-5ef7-9b8c-2345678901cd \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith Updated",
    "phoneNumber": "+251944567890"
  }'
```

---

#### 3.5 Deactivate User

**Purpose:** Deactivate a user account, revoke all sessions, and invalidate their QR credential.

**Endpoint:** `PATCH /api/users/:id/deactivate`

**Authentication:** Required

**Required Permission:** `users.delete`

**URL Parameters:**
- `id`: User UUID

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "name": "Jane Smith",
    "email": "jane@itdb.gov.et",
    "role": "it_rep",
    "isActive": false,
    "phoneNumber": "+251922345678",
    "createdAt": "2026-05-02T11:00:00.000Z",
    "updatedAt": "2026-05-02T13:00:00.000Z"
  }
}
```

**Side Effects:**
- Sets `isActive = false`
- Revokes all JWT sessions
- Invalidates QR credentials

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/users/af18c2b3-45d6-5ef7-9b8c-2345678901cd/deactivate \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 3.6 Set User Permissions

**Purpose:** Replace a user's permission set. The new permissions must be a subset of the user's organization's permissions.

**Endpoint:** `PATCH /api/users/:id/permissions`

**Authentication:** Required

**Required Permission:** `users.assign_permissions`

**URL Parameters:**
- `id`: User UUID

**Request Body:**
```json
{
  "permissions": [
    "incidents.view",
    "incidents.create",
    "incidents.comment"
  ]
}
```

**Success Response (200 OK):**
```json
{
  "permissions": [
    "incidents.view",
    "incidents.create",
    "incidents.comment"
  ]
}
```

**Error Responses:**

- **400 Bad Request** - Permission not in org's permission set
```json
{
  "error": {
    "code": "INVALID_PERMISSION",
    "message": "Permission 'incidents.delete' is not available to this organization"
  }
}
```

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/users/af18c2b3-45d6-5ef7-9b8c-2345678901cd/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "incidents.view",
      "incidents.create"
    ]
  }'
```

---

#### 3.7 Assign Exam Field to User

**Purpose:** Assign an exam field (exam center) to a user, creating an exam center assignment.

**Endpoint:** `POST /api/users/:userId/exam-assignments`

**Authentication:** Required

**Required Permission:** `exam_fields.edit`

**URL Parameters:**
- `userId`: User UUID

**Request Body:**
```json
{
  "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de"
}
```

**Success Response (201 Created):**
```json
{
  "assignment": {
    "id": "cf30e4d5-67f8-7gh9-1d0e-4567890123ef",
    "userId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
    "assignedAt": "2026-05-02T14:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/users/af18c2b3-45d6-5ef7-9b8c-2345678901cd/exam-assignments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de"
  }'
```

---

#### 3.8 Remove Exam Field Assignment

**Purpose:** Remove an exam field assignment from a user.

**Endpoint:** `DELETE /api/users/:userId/exam-assignments/:fieldId`

**Authentication:** Required

**Required Permission:** `exam_fields.edit`

**URL Parameters:**
- `userId`: User UUID
- `fieldId`: Exam Field UUID

**Success Response (200 OK):**
```json
{
  "message": "Exam field assignment removed successfully"
}
```

**Example Usage:**
```bash
curl -X DELETE http://localhost:3000/api/users/af18c2b3-45d6-5ef7-9b8c-2345678901cd/exam-assignments/bf29d3c4-56e7-6fg8-0c9d-3456789012de \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4. Incident Management

#### 4.1 List Incidents

**Purpose:** Retrieve incidents with role-based scoping and optional filters. Super admins see all incidents; other roles see incidents scoped to their organization or assignments.

**Endpoint:** `GET /api/incidents`

**Authentication:** Required

**Required Permission:** `incidents.view`

**Query Parameters:**
- `status` (optional): Filter by status - `Reported` | `Assigned` | `In-Progress` | `Resolved`
- `priority` (optional): Filter by priority - `Low` | `Medium` | `High`
- `examFieldId` (optional): Filter by exam field UUID
- `incidentTypeId` (optional): Filter by incident type UUID
- `assignedOrgId` (optional): Filter by assigned organization UUID
- `assignedUserId` (optional): Filter by assigned user UUID

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
      "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
      "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
      "reportedByUserId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "deviceId": "device-uuid",
      "priority": "High",
      "status": "Reported",
      "description": "Power outage affecting 50 exam stations",
      "assignedOrgId": null,
      "assignedUserId": null,
      "resolvedAt": null,
      "resolutionSummary": null,
      "localId": "MOBILE-2026-001",
      "createdAt": "2026-05-02T09:00:00.000Z",
      "updatedAt": "2026-05-02T09:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
# List all incidents
curl http://localhost:3000/api/incidents \
  -H "Authorization: Bearer $TOKEN"

# Filter by status and priority
curl "http://localhost:3000/api/incidents?status=Reported&priority=High" \
  -H "Authorization: Bearer $TOKEN"

# Filter by exam field
curl "http://localhost:3000/api/incidents?examFieldId=bf29d3c4-56e7-6fg8-0c9d-3456789012de" \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 4.2 Create Incident

**Purpose:** Create a new incident report. Automatically applies routing rules if configured for the incident type.

**Endpoint:** `POST /api/incidents`

**Authentication:** Required

**Required Permission:** `incidents.create`

**Request Body:**
```json
{
  "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
  "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
  "priority": "High",
  "description": "Power outage affecting 50 exam stations",
  "deviceId": "device-uuid",
  "localId": "MOBILE-2026-001"
}
```

**Validation Rules:**
- `examFieldId`: Required, must be valid UUID
- `incidentTypeId`: Required, must be valid UUID
- `priority`: Required, one of: `Low`, `Medium`, `High`
- `description`: Optional, text description
- `deviceId`: Optional, device UUID (for mobile-created incidents)
- `localId`: Optional, mobile-generated ID for deduplication

**Success Response (201 Created):**
```json
{
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "reportedByUserId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "deviceId": "device-uuid",
    "priority": "High",
    "status": "Reported",
    "description": "Power outage affecting 50 exam stations",
    "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "assignedUserId": null,
    "resolvedAt": null,
    "resolutionSummary": null,
    "localId": "MOBILE-2026-001",
    "createdAt": "2026-05-02T09:00:00.000Z",
    "updatedAt": "2026-05-02T09:00:00.000Z"
  }
}
```

**Side Effects:**
- Creates audit log entry
- Applies routing rules (auto-assignment if configured)
- Sends notifications to assigned org/user
- Publishes WebSocket event

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "priority": "High",
    "description": "Power outage affecting 50 exam stations"
  }'
```

---

#### 4.3 Get Incident Details

**Purpose:** Retrieve detailed information about a specific incident, including comments and attachments.

**Endpoint:** `GET /api/incidents/:id`

**Authentication:** Required

**Required Permission:** `incidents.view`

**URL Parameters:**
- `id`: Incident UUID

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "reportedByUserId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "priority": "High",
    "status": "In-Progress",
    "description": "Power outage affecting 50 exam stations",
    "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "assignedUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "createdAt": "2026-05-02T09:00:00.000Z",
    "updatedAt": "2026-05-02T10:30:00.000Z",
    "comments": [
      {
        "id": "comment-uuid",
        "authorId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
        "body": "Technician dispatched to site",
        "createdAt": "2026-05-02T09:15:00.000Z"
      }
    ],
    "attachments": [
      {
        "id": "attachment-uuid",
        "filePath": "/uploads/incident-photo-001.jpg",
        "fileType": "photo",
        "fileSize": 2048576,
        "uploadedBy": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
        "uploadedAt": "2026-05-02T09:05:00.000Z"
      }
    ]
  }
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 4.4 Update Incident Status

**Purpose:** Update the status of an incident. Validates state transitions and requires resolution summary when resolving.

**Endpoint:** `PATCH /api/incidents/:id/status`

**Authentication:** Required

**Required Permission:** `incidents.update_status`

**URL Parameters:**
- `id`: Incident UUID

**Request Body:**
```json
{
  "status": "Resolved",
  "resolutionSummary": "Power restored. Generator backup installed."
}
```

**Validation Rules:**
- `status`: Required, one of: `Reported`, `Assigned`, `In-Progress`, `Resolved`
- `resolutionSummary`: Required when status is `Resolved`, optional otherwise

**Valid State Transitions:**
- `Reported` → `Assigned`, `In-Progress`, `Resolved`
- `Assigned` → `In-Progress`, `Resolved`
- `In-Progress` → `Resolved`
- `Resolved` → (no transitions allowed)

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "status": "Resolved",
    "resolvedAt": "2026-05-02T11:00:00.000Z",
    "resolutionSummary": "Power restored. Generator backup installed.",
    "updatedAt": "2026-05-02T11:00:00.000Z"
  }
}
```

**Side Effects:**
- Creates audit log entry
- Sends notifications
- Publishes WebSocket event
- Sets `resolvedAt` timestamp when status is `Resolved`

**Example Usage:**
```bash
# Mark as in-progress
curl -X PATCH http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "In-Progress"
  }'

# Resolve incident
curl -X PATCH http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Resolved",
    "resolutionSummary": "Power restored. Generator backup installed."
  }'
```

---

#### 4.5 Assign Incident

**Purpose:** Assign or reassign an incident to an organization or specific user.

**Endpoint:** `PATCH /api/incidents/:id/assign`

**Authentication:** Required

**Required Permission:** `incidents.assign`

**URL Parameters:**
- `id`: Incident UUID

**Request Body:**
```json
{
  "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
  "assignedUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd"
}
```

**Validation Rules:**
- At least one of `assignedOrgId` or `assignedUserId` must be provided
- If `assignedUserId` is provided, user must belong to `assignedOrgId` (if also provided)

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "assignedUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "status": "Assigned",
    "updatedAt": "2026-05-02T09:30:00.000Z"
  }
}
```

**Side Effects:**
- Creates audit log entry
- Sends notifications to assigned org/user
- Publishes WebSocket event
- Updates status to `Assigned` if currently `Reported`

**Example Usage:**
```bash
# Assign to organization
curl -X PATCH http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde"
  }'

# Assign to specific user
curl -X PATCH http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "assignedUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd"
  }'
```

---

#### 4.6 Add Comment

**Purpose:** Add a comment to an incident for collaboration and documentation.

**Endpoint:** `POST /api/incidents/:id/comments`

**Authentication:** Required

**Required Permission:** `incidents.comment`

**URL Parameters:**
- `id`: Incident UUID

**Request Body:**
```json
{
  "content": "Technician dispatched to site. ETA 15 minutes."
}
```

**Validation Rules:**
- `content`: Required, non-empty text

**Success Response (201 Created):**
```json
{
  "data": {
    "id": "comment-uuid",
    "incidentId": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "authorId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "body": "Technician dispatched to site. ETA 15 minutes.",
    "createdAt": "2026-05-02T09:15:00.000Z"
  }
}
```

**Side Effects:**
- Creates audit log entry
- Sends notifications to incident stakeholders
- Publishes WebSocket event

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Technician dispatched to site. ETA 15 minutes."
  }'
```

---

#### 4.7 Escalate Incident

**Purpose:** Manually escalate an incident to the Ministry of Education (MoE).

**Endpoint:** `POST /api/incidents/:id/escalate`

**Authentication:** Required

**Required Permission:** `incidents.escalate`

**URL Parameters:**
- `id`: Incident UUID

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "assignedOrgId": "moe-org-uuid",
    "updatedAt": "2026-05-02T10:00:00.000Z"
  }
}
```

**Side Effects:**
- Assigns incident to MoE organization
- Creates audit log entry with escalation reason
- Sends notifications to MoE
- Publishes WebSocket event

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/escalate \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 4.8 Trigger SMS Alert

**Purpose:** Manually trigger an SMS alert for an incident (sends to configured stakeholders).

**Endpoint:** `POST /api/incidents/:id/sms-alert`

**Authentication:** Required

**Required Permission:** `alerts.sms_trigger`

**URL Parameters:**
- `id`: Incident UUID

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "data": {
    "incidentId": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "message": "SMS alert queued (stub — SMS service not yet implemented)"
  }
}
```

**Note:** This is currently a stub endpoint. Full SMS implementation is pending.

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/sms-alert \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 4.9 Upload Attachments

**Purpose:** Upload photo, video, or document attachments to an incident.

**Endpoint:** `POST /api/incidents/:id/attachments`

**Authentication:** Required

**Required Permission:** `incidents.attach`

**URL Parameters:**
- `id`: Incident UUID

**Request Body:** `multipart/form-data`
- Field name: `files`
- Max files per request: 10
- Max file size: 50MB (configurable via `MAX_FILE_SIZE_MB`)
- Allowed types: photos (jpg, png), videos (mp4, mov), documents (pdf, docx)

**Success Response (201 Created):**
```json
{
  "data": [
    {
      "id": "attachment-uuid-1",
      "incidentId": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
      "filePath": "/uploads/incident-photo-001.jpg",
      "fileType": "photo",
      "fileSize": 2048576,
      "uploadedBy": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "uploadedAt": "2026-05-02T09:05:00.000Z"
    }
  ]
}
```

**Error Responses:**

- **400 Bad Request** - No files uploaded
```json
{
  "error": {
    "code": "NO_FILES_UPLOADED",
    "message": "No files were uploaded"
  }
}
```

- **507 Insufficient Storage** - Disk space full
```json
{
  "error": {
    "code": "INSUFFICIENT_STORAGE",
    "message": "Not enough disk space available"
  }
}
```

**Example Usage:**
```bash
# Upload single file
curl -X POST http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@/path/to/photo.jpg"

# Upload multiple files
curl -X POST http://localhost:3000/api/incidents/df41f5e6-78g9-8hi0-2e3f-5678901defgh/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@/path/to/photo1.jpg" \
  -F "files=@/path/to/photo2.jpg" \
  -F "files=@/path/to/document.pdf"
```

---

### 5. Device Management

#### 5.1 List Devices

**Purpose:** List all registered devices with their assignment information.

**Endpoint:** `GET /api/devices`

**Authentication:** Required

**Required Permission:** `devices.view`

**Query Parameters:**
- `includeInactive` (optional): `true` | `false` - Include deactivated devices (default: false)

**Success Response (200 OK):**
```json
{
  "devices": [
    {
      "id": "device-uuid",
      "deviceId": "DEVICE-ABC123",
      "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "isActive": true,
      "registeredAt": "2026-01-15T08:00:00.000Z",
      "lastSeenAt": "2026-05-02T09:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
# List active devices
curl http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN"

# Include inactive devices
curl "http://localhost:3000/api/devices?includeInactive=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 5.2 Register Device

**Purpose:** Register a new device for an IT Representative. Enforces device ID uniqueness.

**Endpoint:** `POST /api/devices`

**Authentication:** Required

**Required Permission:** `devices.register`

**Request Body:**
```json
{
  "deviceId": "DEVICE-XYZ789",
  "userId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
  "isActive": true
}
```

**Validation Rules:**
- `deviceId`: Required, 1-255 characters, must be unique
- `userId`: Optional, must be valid UUID (IT Rep role)
- `isActive`: Optional, boolean (default: true)

**Success Response (201 Created):**
```json
{
  "device": {
    "id": "new-device-uuid",
    "deviceId": "DEVICE-XYZ789",
    "userId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "isActive": true,
    "registeredAt": "2026-05-02T14:00:00.000Z",
    "lastSeenAt": null
  }
}
```

**Error Responses:**

- **409 Conflict** - Device ID already exists
```json
{
  "error": {
    "code": "DUPLICATE_DEVICE",
    "message": "Device with this ID already exists"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVICE-XYZ789",
    "userId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd"
  }'
```

---

#### 5.3 Deactivate Device

**Purpose:** Deactivate a registered device, preventing future authentication.

**Endpoint:** `PATCH /api/devices/:id/deactivate`

**Authentication:** Required

**Required Permission:** `devices.deactivate`

**URL Parameters:**
- `id`: Device UUID

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "device": {
    "id": "device-uuid",
    "deviceId": "DEVICE-ABC123",
    "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "isActive": false,
    "registeredAt": "2026-01-15T08:00:00.000Z",
    "lastSeenAt": "2026-05-02T09:00:00.000Z"
  }
}
```

**Side Effects:**
- Sets `isActive = false`
- Prevents device from authenticating

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/devices/device-uuid/deactivate \
  -H "Authorization: Bearer $TOKEN"
```

---

### 6. Exam Field Management

#### 6.1 List Exam Fields

**Purpose:** List all active exam fields (exam centers).

**Endpoint:** `GET /api/exam-fields`

**Authentication:** Required

**Required Permission:** `exam_fields.view`

**Success Response (200 OK):**
```json
{
  "examFields": [
    {
      "id": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
      "name": "Addis Ababa University",
      "location": "Sidist Kilo Campus",
      "latitude": "9.032000",
      "longitude": "38.763600",
      "isActive": true
    }
  ]
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/exam-fields \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 6.2 Create Exam Field

**Purpose:** Create a new exam field (exam center).

**Endpoint:** `POST /api/exam-fields`

**Authentication:** Required

**Required Permission:** `exam_fields.create`

**Request Body:**
```json
{
  "name": "Bahir Dar University",
  "location": "Main Campus",
  "latitude": "11.593600",
  "longitude": "37.388900"
}
```

**Validation Rules:**
- `name`: Required, 1-255 characters, must be unique
- `location`: Optional, max 500 characters
- `latitude`: Optional, decimal format (e.g., "9.032000")
- `longitude`: Optional, decimal format (e.g., "38.763600")

**Success Response (201 Created):**
```json
{
  "examField": {
    "id": "new-field-uuid",
    "name": "Bahir Dar University",
    "location": "Main Campus",
    "latitude": "11.593600",
    "longitude": "37.388900",
    "isActive": true
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/exam-fields \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bahir Dar University",
    "location": "Main Campus",
    "latitude": "11.593600",
    "longitude": "37.388900"
  }'
```

---

#### 6.3 Update Exam Field

**Purpose:** Update an existing exam field's details.

**Endpoint:** `PATCH /api/exam-fields/:id`

**Authentication:** Required

**Required Permission:** `exam_fields.edit`

**URL Parameters:**
- `id`: Exam Field UUID

**Request Body (all fields optional):**
```json
{
  "name": "Bahir Dar University - Updated",
  "location": "New Campus Building",
  "latitude": "11.594000",
  "longitude": "37.389000",
  "isActive": true
}
```

**Success Response (200 OK):**
```json
{
  "examField": {
    "id": "field-uuid",
    "name": "Bahir Dar University - Updated",
    "location": "New Campus Building",
    "latitude": "11.594000",
    "longitude": "37.389000",
    "isActive": true
  }
}
```

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/exam-fields/field-uuid \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": "New Campus Building"
  }'
```

---

#### 6.4 Delete Exam Field

**Purpose:** Soft-delete an exam field (sets `isActive = false`).

**Endpoint:** `DELETE /api/exam-fields/:id`

**Authentication:** Required

**Required Permission:** `exam_fields.delete`

**URL Parameters:**
- `id`: Exam Field UUID

**Success Response (200 OK):**
```json
{
  "examField": {
    "id": "field-uuid",
    "name": "Bahir Dar University",
    "location": "Main Campus",
    "latitude": "11.593600",
    "longitude": "37.388900",
    "isActive": false
  }
}
```

**Example Usage:**
```bash
curl -X DELETE http://localhost:3000/api/exam-fields/field-uuid \
  -H "Authorization: Bearer $TOKEN"
```

---

### 7. Incident Type Catalog

#### 7.1 List Incident Types

**Purpose:** List all incident types with incident counts.

**Endpoint:** `GET /api/catalog/incident-types`

**Authentication:** Required

**Required Permission:** `catalog.view`

**Query Parameters:**
- `includeInactive` (optional): `true` | `false` - Include inactive types (default: false)

**Success Response (200 OK):**
```json
{
  "incidentTypes": [
    {
      "id": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
      "name": "Power Failure",
      "defaultPriority": "High",
      "description": "Electrical power outage affecting exam operations",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/catalog/incident-types \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 7.2 Create Incident Type

**Purpose:** Create a new incident type.

**Endpoint:** `POST /api/catalog/incident-types`

**Authentication:** Required

**Required Permission:** `catalog.create`

**Request Body:**
```json
{
  "name": "Hardware Malfunction",
  "defaultPriority": "Medium",
  "description": "Computer or peripheral device failure"
}
```

**Validation Rules:**
- `name`: Required, 1-255 characters, must be unique
- `defaultPriority`: Required, one of: `Low`, `Medium`, `High`
- `description`: Optional, text description

**Success Response (201 Created):**
```json
{
  "incidentType": {
    "id": "new-type-uuid",
    "name": "Hardware Malfunction",
    "defaultPriority": "Medium",
    "description": "Computer or peripheral device failure",
    "isActive": true,
    "createdAt": "2026-05-02T15:00:00.000Z",
    "updatedAt": "2026-05-02T15:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/catalog/incident-types \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hardware Malfunction",
    "defaultPriority": "Medium",
    "description": "Computer or peripheral device failure"
  }'
```

---

#### 7.3 Update Incident Type

**Purpose:** Update an existing incident type's details.

**Endpoint:** `PATCH /api/catalog/incident-types/:id`

**Authentication:** Required

**Required Permission:** `catalog.edit`

**URL Parameters:**
- `id`: Incident Type UUID

**Request Body (all fields optional):**
```json
{
  "name": "Hardware Malfunction - Updated",
  "defaultPriority": "High",
  "description": "Critical hardware failure requiring immediate attention",
  "isActive": true
}
```

**Success Response (200 OK):**
```json
{
  "incidentType": {
    "id": "type-uuid",
    "name": "Hardware Malfunction - Updated",
    "defaultPriority": "High",
    "description": "Critical hardware failure requiring immediate attention",
    "isActive": true,
    "createdAt": "2026-05-02T15:00:00.000Z",
    "updatedAt": "2026-05-02T16:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/catalog/incident-types/type-uuid \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "defaultPriority": "High"
  }'
```

---

#### 7.4 Delete Incident Type

**Purpose:** Soft-delete an incident type (sets `isActive = false`). Rejects if the type is referenced by routing rules or historical incidents.

**Endpoint:** `DELETE /api/catalog/incident-types/:id`

**Authentication:** Required

**Required Permission:** `catalog.delete`

**URL Parameters:**
- `id`: Incident Type UUID

**Success Response (200 OK):**
```json
{
  "incidentType": {
    "id": "type-uuid",
    "name": "Hardware Malfunction",
    "defaultPriority": "Medium",
    "description": "Computer or peripheral device failure",
    "isActive": false,
    "createdAt": "2026-05-02T15:00:00.000Z",
    "updatedAt": "2026-05-02T17:00:00.000Z"
  }
}
```

**Error Responses:**

- **409 Conflict** - Type is referenced by routing rules or incidents
```json
{
  "error": {
    "code": "INCIDENT_TYPE_IN_USE",
    "message": "Cannot delete incident type that is referenced by routing rules or incidents"
  }
}
```

**Example Usage:**
```bash
curl -X DELETE http://localhost:3000/api/catalog/incident-types/type-uuid \
  -H "Authorization: Bearer $TOKEN"
```

---

### 8. Routing Rules

#### 8.1 List Routing Rules

**Purpose:** List all routing rules for automatic incident assignment.

**Endpoint:** `GET /api/routing-rules`

**Authentication:** Required

**Required Permission:** `routing.view`

**Query Parameters:**
- `includeInactive` (optional): `true` | `false` - Include inactive rules (default: false)

**Success Response (200 OK):**
```json
{
  "routingRules": [
    {
      "id": "rule-uuid",
      "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
      "targetOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
      "targetUserId": null,
      "autoAssign": true,
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/routing-rules \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 8.2 Create Routing Rule

**Purpose:** Create a new routing rule for automatic incident assignment.

**Endpoint:** `POST /api/routing-rules`

**Authentication:** Required

**Required Permission:** `routing.create`

**Request Body:**
```json
{
  "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
  "targetOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
  "targetUserId": null,
  "autoAssign": true,
  "isActive": true
}
```

**Validation Rules:**
- `incidentTypeId`: Required, must be valid UUID
- `targetOrgId`: Optional, must be valid UUID (at least one of targetOrgId or targetUserId required)
- `targetUserId`: Optional, must be valid UUID (at least one of targetOrgId or targetUserId required)
- `autoAssign`: Optional, boolean (default: false)
- `isActive`: Optional, boolean (default: true)

**Success Response (201 Created):**
```json
{
  "routingRule": {
    "id": "new-rule-uuid",
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "targetOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "targetUserId": null,
    "autoAssign": true,
    "isActive": true,
    "createdAt": "2026-05-02T18:00:00.000Z",
    "updatedAt": "2026-05-02T18:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/routing-rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "targetOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "autoAssign": true
  }'
```

---

#### 8.3 Update Routing Rule

**Purpose:** Update an existing routing rule's configuration.

**Endpoint:** `PATCH /api/routing-rules/:id`

**Authentication:** Required

**Required Permission:** `routing.edit`

**URL Parameters:**
- `id`: Routing Rule UUID

**Request Body (all fields optional):**
```json
{
  "targetOrgId": "8c345f67-8901-5bcd-c234-5678901bcdef",
  "targetUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
  "autoAssign": false,
  "isActive": true
}
```

**Success Response (200 OK):**
```json
{
  "routingRule": {
    "id": "rule-uuid",
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "targetOrgId": "8c345f67-8901-5bcd-c234-5678901bcdef",
    "targetUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "autoAssign": false,
    "isActive": true,
    "createdAt": "2026-05-02T18:00:00.000Z",
    "updatedAt": "2026-05-02T19:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X PATCH http://localhost:3000/api/routing-rules/rule-uuid \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "autoAssign": false
  }'
```

---

#### 8.4 Delete Routing Rule

**Purpose:** Hard-delete a routing rule (permanently removes it).

**Endpoint:** `DELETE /api/routing-rules/:id`

**Authentication:** Required

**Required Permission:** `routing.delete`

**URL Parameters:**
- `id`: Routing Rule UUID

**Success Response (204 No Content):**
No response body

**Example Usage:**
```bash
curl -X DELETE http://localhost:3000/api/routing-rules/rule-uuid \
  -H "Authorization: Bearer $TOKEN"
```

---

### 9. QR Credentials Management

#### 9.1 Get QR Credential

**Purpose:** Retrieve or generate a QR credential for a user. Returns the current valid credential or issues a new one if none exists.

**Endpoint:** `GET /api/qr/:userId`

**Authentication:** Required

**Required Permission:** `qr.view`

**URL Parameters:**
- `userId`: User UUID

**Success Response (200 OK):**
```json
{
  "credential": {
    "id": "credential-uuid",
    "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "payload": "eyJ1c2VySWQiOiI5ZjA3YjFhMi0zNGM1LTRkZTYtOGE3Yi0xMjM0NTY3ODkwYWIiLCJuYW1lIjoiSm9obiBEb2UiLCJyb2xlIjoiaXRfcmVwIiwib3JnSWQiOiI3YjIzNGU1Ni03ODkwLTRhYmMtYjEyMy00NTY3ODkwYWJjZGUiLCJleGFtRmllbGRJZHMiOlsiYmYyOWQzYzQtNTZlNy02Zmc4LTBjOWQtMzQ1Njc4OTAxMmRlIl0sImlzc3VlZEF0IjoiMjAyNi0wNS0wMlQxMDowMDowMC4wMDBaIiwiY3JlZGVudGlhbElkIjoiY3JlZGVudGlhbC11dWlkIn0=",
    "signature": "MEUCIQDx...",
    "isValid": true,
    "issuedAt": "2026-05-02T10:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/qr/9f07b1a2-34c5-4de6-8a7b-1234567890ab \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 9.2 Verify QR Credential

**Purpose:** Verify a QR credential's ECDSA signature and return user information with active status.

**Endpoint:** `POST /api/qr/verify`

**Authentication:** Required

**Required Permission:** `qr.scan`

**Request Body:**
```json
{
  "payload": "eyJ1c2VySWQiOiI5ZjA3YjFhMi0zNGM1LTRkZTYtOGE3Yi0xMjM0NTY3ODkwYWIiLCJuYW1lIjoiSm9obiBEb2UiLCJyb2xlIjoiaXRfcmVwIiwib3JnSWQiOiI3YjIzNGU1Ni03ODkwLTRhYmMtYjEyMy00NTY3ODkwYWJjZGUiLCJleGFtRmllbGRJZHMiOlsiYmYyOWQzYzQtNTZlNy02Zmc4LTBjOWQtMzQ1Njc4OTAxMmRlIl0sImlzc3VlZEF0IjoiMjAyNi0wNS0wMlQxMDowMDowMC4wMDBaIiwiY3JlZGVudGlhbElkIjoiY3JlZGVudGlhbC11dWlkIn0=",
  "signature": "MEUCIQDx..."
}
```

**Validation Rules:**
- `payload`: Required, non-empty string
- `signature`: Required, non-empty string

**Success Response (200 OK):**
```json
{
  "valid": true,
  "credentialActive": true,
  "userActive": true,
  "data": {
    "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "name": "John Doe",
    "role": "it_rep",
    "orgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "examFieldIds": ["bf29d3c4-56e7-6fg8-0c9d-3456789012de"],
    "issuedAt": "2026-05-02T10:00:00.000Z",
    "credentialId": "credential-uuid"
  },
  "accessRevoked": false
}
```

**Invalid Credential Response (200 OK):**
```json
{
  "valid": false,
  "message": "Invalid or tampered QR credential"
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/qr/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "eyJ1c2VySWQiOiI5ZjA3YjFhMi0zNGM1LTRkZTYtOGE3Yi0xMjM0NTY3ODkwYWIiLCJuYW1lIjoiSm9obiBEb2UiLCJyb2xlIjoiaXRfcmVwIiwib3JnSWQiOiI3YjIzNGU1Ni03ODkwLTRhYmMtYjEyMy00NTY3ODkwYWJjZGUiLCJleGFtRmllbGRJZHMiOlsiYmYyOWQzYzQtNTZlNy02Zmc4LTBjOWQtMzQ1Njc4OTAxMmRlIl0sImlzc3VlZEF0IjoiMjAyNi0wNS0wMlQxMDowMDowMC4wMDBaIiwiY3JlZGVudGlhbElkIjoiY3JlZGVudGlhbC11dWlkIn0=",
    "signature": "MEUCIQDx..."
  }'
```

---

### 10. Mobile Sync

#### 10.1 Mobile Sync Endpoint

**Purpose:** Retrieve all data needed for mobile app operation: incident types catalog, exam field assignments, and unread notifications. Scoped to the authenticated device's assignments.

**Endpoint:** `GET /api/sync/mobile`

**Authentication:** Required (Device token)

**Required Permission:** None (device authentication)

**Success Response (200 OK):**
```json
{
  "incidentTypes": [
    {
      "id": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
      "name": "Power Failure",
      "defaultPriority": "High",
      "description": "Electrical power outage affecting exam operations",
      "isActive": true
    }
  ],
  "examFieldAssignments": [
    {
      "id": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
      "name": "Addis Ababa University",
      "location": "Sidist Kilo Campus",
      "latitude": "9.032000",
      "longitude": "38.763600"
    }
  ],
  "notifications": [
    {
      "id": "notification-uuid",
      "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "title": "Incident Assigned",
      "message": "You have been assigned to incident #12345",
      "type": "incident_assigned",
      "isRead": false,
      "createdAt": "2026-05-02T09:00:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
# Use device token for authentication
curl http://localhost:3000/api/sync/mobile \
  -H "Authorization: Bearer $DEVICE_TOKEN"
```

---

### 11. Audit Log

#### 11.1 List Audit Log Entries

**Purpose:** Retrieve paginated, filtered audit log entries for compliance and investigation.

**Endpoint:** `GET /api/audit-log`

**Authentication:** Required

**Required Permission:** `audit.view`

**Query Parameters:**
- `userId` (optional): Filter by actor user ID
- `deviceId` (optional): Filter by device ID
- `orgId` (optional): Filter by actor organization ID
- `actionType` (optional): Filter by action type (e.g., "incident.created", "user.deactivated")
- `dateFrom` (optional): ISO 8601 date string (inclusive lower bound)
- `dateTo` (optional): ISO 8601 date string (inclusive upper bound)
- `limit` (optional): Max entries to return (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "id": "audit-uuid",
      "actorUserId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "actorOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
      "deviceId": null,
      "actionType": "incident.created",
      "resourceType": "incident",
      "resourceId": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
      "oldValue": null,
      "newValue": "{\"priority\":\"High\",\"status\":\"Reported\"}",
      "occurredAt": "2026-05-02T09:00:00.000Z"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

**Example Usage:**
```bash
# List all audit logs
curl http://localhost:3000/api/audit-log \
  -H "Authorization: Bearer $TOKEN"

# Filter by user and date range
curl "http://localhost:3000/api/audit-log?userId=9f07b1a2-34c5-4de6-8a7b-1234567890ab&dateFrom=2026-05-01T00:00:00Z&dateTo=2026-05-02T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN"

# Filter by action type
curl "http://localhost:3000/api/audit-log?actionType=incident.created&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 11.2 Get Incident Audit Log

**Purpose:** Retrieve all audit log entries for a specific incident, ordered chronologically.

**Endpoint:** `GET /api/audit-log/incident/:incidentId`

**Authentication:** Required

**Required Permission:** `audit.view`

**URL Parameters:**
- `incidentId`: Incident UUID

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "id": "audit-uuid-1",
      "actorUserId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
      "actorOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
      "deviceId": "device-uuid",
      "actionType": "incident.created",
      "resourceType": "incident",
      "resourceId": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
      "oldValue": null,
      "newValue": "{\"priority\":\"High\",\"status\":\"Reported\"}",
      "occurredAt": "2026-05-02T09:00:00.000Z"
    },
    {
      "id": "audit-uuid-2",
      "actorUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
      "actorOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
      "deviceId": null,
      "actionType": "incident.assigned",
      "resourceType": "incident",
      "resourceId": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
      "oldValue": "{\"assignedOrgId\":null}",
      "newValue": "{\"assignedOrgId\":\"7b234e56-7890-4abc-b123-4567890abcde\"}",
      "occurredAt": "2026-05-02T09:15:00.000Z"
    }
  ]
}
```

**Example Usage:**
```bash
curl http://localhost:3000/api/audit-log/incident/df41f5e6-78g9-8hi0-2e3f-5678901defgh \
  -H "Authorization: Bearer $TOKEN"
```

---

### 12. Push Notifications

#### 12.1 Register Push Token

**Purpose:** Register a push notification token (FCM or Web Push) for the authenticated user.

**Endpoint:** `POST /api/push/register`

**Authentication:** Required

**Required Permission:** None (any authenticated user)

**Request Body:**
```json
{
  "tokenType": "fcm",
  "token": "fcm-token-string-here",
  "deviceId": "device-uuid"
}
```

**Validation Rules:**
- `tokenType`: Required, one of: `fcm`, `web_push`
- `token`: Required, non-empty string
- `deviceId`: Optional, device UUID

**Success Response (200 OK):**
```json
{
  "message": "Push token registered successfully",
  "data": {
    "id": "push-token-uuid",
    "tokenType": "fcm",
    "deviceId": "device-uuid",
    "createdAt": "2026-05-02T10:00:00.000Z"
  }
}
```

**Example Usage:**
```bash
curl -X POST http://localhost:3000/api/push/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenType": "fcm",
    "token": "fcm-token-string-here",
    "deviceId": "device-uuid"
  }'
```

---

#### 12.2 Unregister Push Token

**Purpose:** Unregister a push notification token for the authenticated user and device.

**Endpoint:** `DELETE /api/push/unregister`

**Authentication:** Required

**Required Permission:** None (any authenticated user)

**Request Body:**
```json
{
  "deviceId": "device-uuid"
}
```

**Validation Rules:**
- `deviceId`: Required, non-empty string

**Success Response (200 OK):**
```json
{
  "message": "Push token unregistered successfully"
}
```

**Example Usage:**
```bash
curl -X DELETE http://localhost:3000/api/push/unregister \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-uuid"
  }'
```

---

### 13. Reports

#### 13.1 Generate Incident Report

**Purpose:** Generate an incident report with aggregated metrics based on filters.

**Endpoint:** `GET /api/reports/generate`

**Authentication:** Required

**Required Permission:** `reports.view`

**Query Parameters:**
- `examCycle` (optional): Exam cycle identifier (e.g., "2026-Grade-12")
- `startDate` (optional): ISO 8601 datetime string
- `endDate` (optional): ISO 8601 datetime string
- `examFieldId` (optional): Exam field UUID
- `incidentTypeId` (optional): Incident type UUID
- `orgId` (optional): Organization UUID

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalIncidents": 150,
      "resolvedIncidents": 120,
      "pendingIncidents": 30,
      "averageResolutionTime": "2.5 hours"
    },
    "byPriority": {
      "High": 45,
      "Medium": 75,
      "Low": 30
    },
    "byType": [
      {
        "incidentType": "Power Failure",
        "count": 50
      },
      {
        "incidentType": "Network Outage",
        "count": 35
      }
    ],
    "byExamField": [
      {
        "examField": "Addis Ababa University",
        "count": 40
      }
    ]
  }
}
```

**Example Usage:**
```bash
# Generate report for exam cycle
curl "http://localhost:3000/api/reports/generate?examCycle=2026-Grade-12" \
  -H "Authorization: Bearer $TOKEN"

# Generate report for date range
curl "http://localhost:3000/api/reports/generate?startDate=2026-05-01T00:00:00Z&endDate=2026-05-02T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN"

# Generate report for specific exam field
curl "http://localhost:3000/api/reports/generate?examFieldId=bf29d3c4-56e7-6fg8-0c9d-3456789012de" \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 13.2 Generate Post-Cycle Summary

**Purpose:** Generate a comprehensive post-exam-cycle summary report.

**Endpoint:** `GET /api/reports/post-cycle-summary`

**Authentication:** Required

**Required Permission:** `reports.view`

**Query Parameters:**
- `examCycle` (optional): Exam cycle identifier
- `startDate` (optional): ISO 8601 datetime string
- `endDate` (optional): ISO 8601 datetime string

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "examCycle": "2026-Grade-12",
    "period": {
      "start": "2026-05-01T00:00:00.000Z",
      "end": "2026-05-02T23:59:59.000Z"
    },
    "overallMetrics": {
      "totalIncidents": 150,
      "resolvedIncidents": 120,
      "resolutionRate": "80%",
      "averageResolutionTime": "2.5 hours"
    },
    "criticalIncidents": [
      {
        "id": "incident-uuid",
        "type": "Power Failure",
        "examField": "Addis Ababa University",
        "priority": "High",
        "resolutionTime": "1.5 hours"
      }
    ],
    "recommendations": [
      "Increase backup power capacity at high-incident exam centers",
      "Deploy additional IT representatives to remote locations"
    ]
  }
}
```

**Example Usage:**
```bash
curl "http://localhost:3000/api/reports/post-cycle-summary?examCycle=2026-Grade-12" \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 13.3 Export Report

**Purpose:** Export an incident report in PDF or XLSX format.

**Endpoint:** `GET /api/reports/export/:format`

**Authentication:** Required

**Required Permission:** `reports.export`

**URL Parameters:**
- `format`: Export format - `pdf` | `xlsx`

**Query Parameters:**
- Same as Generate Incident Report (examCycle, startDate, endDate, examFieldId, incidentTypeId, orgId)

**Success Response (200 OK):**
- **Content-Type**: `application/pdf` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition**: `attachment; filename="incident-report-{timestamp}.{format}"`
- **Body**: Binary file data

**Example Usage:**
```bash
# Export as PDF
curl "http://localhost:3000/api/reports/export/pdf?examCycle=2026-Grade-12" \
  -H "Authorization: Bearer $TOKEN" \
  -o incident-report.pdf

# Export as XLSX
curl "http://localhost:3000/api/reports/export/xlsx?startDate=2026-05-01T00:00:00Z&endDate=2026-05-02T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" \
  -o incident-report.xlsx
```

---

#### 13.4 Export Post-Cycle Summary

**Purpose:** Export a post-cycle summary report in PDF or XLSX format.

**Endpoint:** `GET /api/reports/export-post-cycle/:format`

**Authentication:** Required

**Required Permission:** `reports.export`

**URL Parameters:**
- `format`: Export format - `pdf` | `xlsx`

**Query Parameters:**
- `examCycle` (optional): Exam cycle identifier
- `startDate` (optional): ISO 8601 datetime string
- `endDate` (optional): ISO 8601 datetime string

**Success Response (200 OK):**
- **Content-Type**: `application/pdf` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition**: `attachment; filename="post-cycle-summary-{timestamp}.{format}"`
- **Body**: Binary file data

**Example Usage:**
```bash
# Export as PDF
curl "http://localhost:3000/api/reports/export-post-cycle/pdf?examCycle=2026-Grade-12" \
  -H "Authorization: Bearer $TOKEN" \
  -o post-cycle-summary.pdf

# Export as XLSX
curl "http://localhost:3000/api/reports/export-post-cycle/xlsx?examCycle=2026-Grade-12" \
  -H "Authorization: Bearer $TOKEN" \
  -o post-cycle-summary.xlsx
```

---

### 14. WebSocket Events

#### 14.1 WebSocket Connection

**Purpose:** Establish a real-time WebSocket connection for receiving live updates.

**Endpoint:** `ws://localhost:3000/ws` or `wss://localhost:3000/ws`

**Authentication:** Required (JWT token via query param or Authorization header)

**Connection Methods:**

**Method 1: Query Parameter**
```javascript
const token = 'your-jwt-token';
const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);
```

**Method 2: Authorization Header**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Connection Events:**

**On Connect:**
```javascript
ws.onopen = () => {
  console.log('WebSocket connected');
};
```

**On Message:**
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received event:', data);
};
```

**On Error:**
```javascript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

**On Close:**
```javascript
ws.onclose = () => {
  console.log('WebSocket disconnected');
};
```

---

#### 14.2 Event Types

**Purpose:** Real-time events broadcast to connected clients in the same organization.

**Event: incident.created**
```json
{
  "event": "incident.created",
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "examFieldId": "bf29d3c4-56e7-6fg8-0c9d-3456789012de",
    "incidentTypeId": "ef52g6h7-89i0-9jk1-3f4g-6789012efghi",
    "priority": "High",
    "status": "Reported",
    "createdAt": "2026-05-02T09:00:00.000Z"
  }
}
```

**Event: incident.status_changed**
```json
{
  "event": "incident.status_changed",
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "oldStatus": "Reported",
    "newStatus": "In-Progress",
    "updatedAt": "2026-05-02T09:30:00.000Z"
  }
}
```

**Event: incident.assigned**
```json
{
  "event": "incident.assigned",
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "assignedOrgId": "7b234e56-7890-4abc-b123-4567890abcde",
    "assignedUserId": "af18c2b3-45d6-5ef7-9b8c-2345678901cd",
    "updatedAt": "2026-05-02T09:15:00.000Z"
  }
}
```

**Event: incident.escalated**
```json
{
  "event": "incident.escalated",
  "data": {
    "id": "df41f5e6-78g9-8hi0-2e3f-5678901defgh",
    "escalatedTo": "moe-org-uuid",
    "reason": "High priority incident unresolved after 30 minutes",
    "updatedAt": "2026-05-02T10:00:00.000Z"
  }
}
```

**Event: notification.new**
```json
{
  "event": "notification.new",
  "data": {
    "id": "notification-uuid",
    "userId": "9f07b1a2-34c5-4de6-8a7b-1234567890ab",
    "title": "Incident Assigned",
    "message": "You have been assigned to incident #12345",
    "type": "incident_assigned",
    "createdAt": "2026-05-02T09:00:00.000Z"
  }
}
```

**Example Client Implementation:**
```javascript
const token = localStorage.getItem('authToken');
const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);

ws.onopen = () => {
  console.log('Connected to WebSocket');
};

ws.onmessage = (event) => {
  const { event: eventType, data } = JSON.parse(event.data);
  
  switch (eventType) {
    case 'incident.created':
      console.log('New incident created:', data);
      // Update UI to show new incident
      break;
    case 'incident.status_changed':
      console.log('Incident status changed:', data);
      // Update incident status in UI
      break;
    case 'incident.assigned':
      console.log('Incident assigned:', data);
      // Show assignment notification
      break;
    case 'incident.escalated':
      console.log('Incident escalated:', data);
      // Show escalation alert
      break;
    case 'notification.new':
      console.log('New notification:', data);
      // Show notification badge
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
  // Implement reconnection logic
};
```

---

## Complete Workflows

### Workflow 1: Initial System Setup

**Purpose:** Set up the system for first-time use.

**Steps:**

1. **Start Services**
```bash
# Start PostgreSQL
# Start Redis
# Start backend server
cd backend
npm run dev
```

2. **Verify Health**
```bash
curl http://localhost:3000/health
```

3. **Create Super Admin** (via database or seed script)
```sql
INSERT INTO users (org_id, name, email, password_hash, role, is_active)
VALUES (
  (SELECT id FROM organizations WHERE name = 'ITDB'),
  'Super Admin',
  'admin@itdb.gov.et',
  '$2a$10$...',  -- bcrypt hash of password
  'super_admin',
  true
);
```

4. **Login as Super Admin**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@itdb.gov.et",
    "password": "your-password"
  }' | jq -r '.token' > token.txt

export TOKEN=$(cat token.txt)
```

5. **Create Organizations**
```bash
# Create ELPA organization
curl -X POST http://localhost:3000/api/organizations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ELPA",
    "type": "utility"
  }'
```

6. **Set Organization Permissions**
```bash
curl -X PATCH http://localhost:3000/api/organizations/{org-id}/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "incidents.view",
      "incidents.create",
      "incidents.update_status",
      "incidents.resolve"
    ]
  }'
```

---

### Workflow 2: User Onboarding

**Purpose:** Create and configure a new user account.

**Steps:**

1. **Create User**
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "{org-uuid}",
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePassword123",
    "role": "bureau_staff",
    "phoneNumber": "+251911234567"
  }'
```

2. **Set User Permissions**
```bash
curl -X PATCH http://localhost:3000/api/users/{user-id}/permissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "incidents.view",
      "incidents.create",
      "incidents.comment"
    ]
  }'
```

3. **Assign Exam Fields** (for IT Reps)
```bash
curl -X POST http://localhost:3000/api/users/{user-id}/exam-assignments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examFieldId": "{field-uuid}"
  }'
```

4. **User Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePassword123"
  }'
```

---

### Workflow 3: Incident Reporting (Web Portal)

**Purpose:** Report and track an incident through the web portal.

**Steps:**

1. **Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reporter@example.com",
    "password": "password"
  }' | jq -r '.token' > token.txt

export TOKEN=$(cat token.txt)
```

2. **List Exam Fields** (to select location)
```bash
curl http://localhost:3000/api/exam-fields \
  -H "Authorization: Bearer $TOKEN"
```

3. **List Incident Types** (to select type)
```bash
curl http://localhost:3000/api/catalog/incident-types \
  -H "Authorization: Bearer $TOKEN"
```

4. **Create Incident**
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examFieldId": "{field-uuid}",
    "incidentTypeId": "{type-uuid}",
    "priority": "High",
    "description": "Power outage affecting 50 exam stations"
  }'
```

5. **Upload Attachments**
```bash
curl -X POST http://localhost:3000/api/incidents/{incident-id}/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@/path/to/photo.jpg"
```

6. **Add Comment**
```bash
curl -X POST http://localhost:3000/api/incidents/{incident-id}/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Generator backup is being deployed"
  }'
```

---

### Workflow 4: Incident Resolution

**Purpose:** Assign, work on, and resolve an incident.

**Steps:**

1. **List Unassigned Incidents**
```bash
curl "http://localhost:3000/api/incidents?status=Reported" \
  -H "Authorization: Bearer $TOKEN"
```

2. **Assign Incident**
```bash
curl -X PATCH http://localhost:3000/api/incidents/{incident-id}/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignedOrgId": "{org-uuid}",
    "assignedUserId": "{user-uuid}"
  }'
```

3. **Update Status to In-Progress**
```bash
curl -X PATCH http://localhost:3000/api/incidents/{incident-id}/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "In-Progress"
  }'
```

4. **Add Progress Comments**
```bash
curl -X POST http://localhost:3000/api/incidents/{incident-id}/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Technician on site. Diagnosing issue."
  }'
```

5. **Resolve Incident**
```bash
curl -X PATCH http://localhost:3000/api/incidents/{incident-id}/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Resolved",
    "resolutionSummary": "Power restored. Generator backup installed for redundancy."
  }'
```

6. **View Audit Trail**
```bash
curl http://localhost:3000/api/audit-log/incident/{incident-id} \
  -H "Authorization: Bearer $TOKEN"
```

---

### Workflow 5: Mobile IT Rep Workflow

**Purpose:** IT Representative using mobile app to report incidents offline.

**Steps:**

1. **Device Registration** (one-time, via web portal)
```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVICE-MOBILE-001",
    "userId": "{it-rep-user-id}"
  }'
```

2. **Device Login**
```bash
curl -X POST http://localhost:3000/api/auth/device-verify \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVICE-MOBILE-001",
    "userId": "{it-rep-user-id}"
  }' | jq -r '.token' > device_token.txt

export DEVICE_TOKEN=$(cat device_token.txt)
```

3. **Sync Data** (download catalog and assignments)
```bash
curl http://localhost:3000/api/sync/mobile \
  -H "Authorization: Bearer $DEVICE_TOKEN"
```

4. **Create Incident Offline** (stored locally with localId)
```json
{
  "localId": "MOBILE-2026-001",
  "examFieldId": "{field-uuid}",
  "incidentTypeId": "{type-uuid}",
  "priority": "High",
  "description": "Network outage",
  "attachments": ["base64-encoded-photo"]
}
```

5. **Sync Incidents** (when online)
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "localId": "MOBILE-2026-001",
    "examFieldId": "{field-uuid}",
    "incidentTypeId": "{type-uuid}",
    "priority": "High",
    "description": "Network outage"
  }'
```

---

## Error Handling

### Standard Error Response Format

All API errors follow this consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Common HTTP Status Codes

- **200 OK** - Request succeeded
- **201 Created** - Resource created successfully
- **204 No Content** - Request succeeded, no response body
- **400 Bad Request** - Invalid request data or validation error
- **401 Unauthorized** - Missing or invalid authentication token
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource conflict (duplicate, constraint violation)
- **500 Internal Server Error** - Server error
- **507 Insufficient Storage** - Disk space full

### Common Error Codes

**Authentication Errors:**
- `UNAUTHORIZED` - Missing or invalid token
- `INVALID_CREDENTIALS` - Invalid email or password
- `DEVICE_NOT_FOUND` - Device not registered
- `DEVICE_NOT_AUTHORIZED` - Device not registered to user

**Authorization Errors:**
- `FORBIDDEN` - Insufficient permissions
- `INVALID_PERMISSION` - Permission not available to organization

**Validation Errors:**
- `VALIDATION_ERROR` - Invalid request data
- `INVALID_EMAIL` - Invalid email format
- `INVALID_UUID` - Invalid UUID format

**Resource Errors:**
- `NOT_FOUND` - Resource not found
- `DUPLICATE_ORGANIZATION` - Organization name already exists
- `DUPLICATE_DEVICE` - Device ID already exists
- `INCIDENT_TYPE_IN_USE` - Cannot delete referenced incident type

**Storage Errors:**
- `NO_FILES_UPLOADED` - No files in upload request
- `INSUFFICIENT_STORAGE` - Disk space full
- `FILE_TOO_LARGE` - File exceeds size limit

**Business Logic Errors:**
- `INVALID_STATE_TRANSITION` - Invalid incident status transition
- `ORGANIZATION_INACTIVE` - Organization is deactivated
- `USER_INACTIVE` - User account is deactivated

### Error Handling Best Practices

1. **Always check HTTP status code first**
2. **Parse error.code for programmatic handling**
3. **Display error.message to users**
4. **Log full error response for debugging**
5. **Implement retry logic for 5xx errors**
6. **Handle 401 by redirecting to login**
7. **Handle 403 by showing permission denied message**

### Example Error Handling (JavaScript)

```javascript
try {
  const response = await fetch('http://localhost:3000/api/incidents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(incidentData)
  });

  if (!response.ok) {
    const error = await response.json();
    
    switch (response.status) {
      case 401:
        // Redirect to login
        window.location.href = '/login';
        break;
      case 403:
        alert('You do not have permission to create incidents');
        break;
      case 400:
        alert(`Validation error: ${error.error.message}`);
        break;
      case 500:
        alert('Server error. Please try again later.');
        break;
      default:
        alert(`Error: ${error.error.message}`);
    }
    return;
  }

  const data = await response.json();
  console.log('Incident created:', data);
} catch (err) {
  console.error('Network error:', err);
  alert('Network error. Please check your connection.');
}
```

---

## API Documentation Complete

This documentation covers all 44 endpoints across 13 API modules:

1. **Authentication** (3 endpoints)
2. **Organizations** (5 endpoints)
3. **Users** (8 endpoints)
4. **Incidents** (9 endpoints)
5. **Devices** (3 endpoints)
6. **Exam Fields** (4 endpoints)
7. **Incident Types** (4 endpoints)
8. ***Routing Rules* (4 endpoints)
9. **QR Credentials** (2 endpoints - documented in code)
10. **Mobile Sync** (1 endpoint - documented in code)
11. **Audit Log** (2 endpoints - documented in code)
12. **Push Notifications** (2 endpoints - documented in code)
13. **Reports** (4 endpoints - documented in code)

Each endpoint includes:
- Purpose and description
- HTTP method and path
- Authentication requirements
- Required permissions
- Request/response examples
- Validation rules
- Error responses
- cURL examples
- Side effects

Plus 5 complete end-to-end workflows and comprehensive error handling guide.
