# Middleware Documentation

## Permission Middleware

The `requirePermission` middleware implements the two-level permission enforcement system as specified in Requirements 1.6, 1.7, 18.5, and 18.6.

### How It Works

The middleware enforces that every action requires a permission to be present in **BOTH**:
1. The user's `User_Permission_Set`
2. The user's organization's `Org_Permission_Set`

The effective permission set is the **intersection** (P_user ∩ P_org). If a permission is missing from either set, the request is denied with HTTP 403.

### Usage

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// Example: Protect an endpoint with permission check
router.get(
  '/incidents',
  authenticate,                      // First: verify JWT and attach req.user
  requirePermission('incidents.view'), // Second: check permission
  async (req, res) => {
    // Handler code - only executes if permission check passes
    // ...
  }
);

// Example: Multiple permissions on different routes
router.post(
  '/incidents',
  authenticate,
  requirePermission('incidents.create'),
  createIncidentHandler
);

router.patch(
  '/incidents/:id/status',
  authenticate,
  requirePermission('incidents.update_status'),
  updateStatusHandler
);

router.post(
  '/users',
  authenticate,
  requirePermission('users.create'),
  createUserHandler
);
```

### Permission Names

The system defines ~35 permissions organized into groups. Some examples:

**Incidents:**
- `incidents.view`
- `incidents.create`
- `incidents.edit`
- `incidents.assign`
- `incidents.update_status`
- `incidents.resolve`

**Users:**
- `users.view`
- `users.create`
- `users.edit`
- `users.delete`
- `users.assign_permissions`

**Organizations:**
- `organizations.view`
- `organizations.create`
- `organizations.edit`
- `organizations.assign_permissions`

See `backend/src/db/migrations/002_seed_data.sql` for the complete list.

### Error Responses

**401 Unauthorized** - User is not authenticated (no valid JWT)
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**403 Forbidden** - Permission denied (permission not in user set OR org set)
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Permission denied: incidents.view not granted"
  }
}
```

### Implementation Details

The middleware:
1. Extracts `userId` and `orgId` from `req.user` (set by `authenticate` middleware)
2. Loads the user's permissions from `user_permissions` table
3. Loads the organization's permissions from `org_permissions` table
4. Checks if the required permission exists in **both** sets
5. Calls `next()` if permission is granted, or throws `AppError(403)` if denied

### Testing

See `backend/tests/unit/middleware/permission.test.ts` for comprehensive test coverage including:
- Permission granted when in both sets
- Permission denied when absent from user set
- Permission denied when absent from org set
- Permission denied when absent from both sets
- Authentication check
- Repository integration
- Error handling

Run tests:
```bash
npm test -- permission.test.ts
```
