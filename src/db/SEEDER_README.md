# Database Seeders

## Super Admin Seeder

Creates a super admin user with all system permissions for initial setup.

### Quick Start

```bash
npm run seed:superadmin
```

### Default Credentials

- **Email**: `admin@examportal.gov.et`
- **Password**: `Admin@123456`
- **Organization**: ITDB (government)
- **Role**: super_admin
- **Permissions**: All 47 system permissions

⚠️ **IMPORTANT**: Change the password immediately after first login!

### Custom Configuration

You can customize the super admin by modifying the `DEFAULT_CONFIG` in `seed-superadmin.ts`:

```typescript
const DEFAULT_CONFIG: SuperAdminConfig = {
  name: 'Super Admin',
  email: 'admin@examportal.gov.et',
  password: 'Admin@123456',
  phoneNumber: '+251911000000',
  organizationName: 'ITDB',
};
```

### Programmatic Usage

You can also use the seeder programmatically:

```typescript
import { seedSuperAdmin } from './db/seed-superadmin';

// Use default config
await seedSuperAdmin();

// Or provide custom config
await seedSuperAdmin({
  name: 'System Administrator',
  email: 'sysadmin@example.com',
  password: 'SecurePassword123!',
  phoneNumber: '+251911123456',
  organizationName: 'ITDB',
});
```

### What It Does

1. ✅ Finds or creates the specified organization (default: ITDB)
2. ✅ Checks if super admin already exists (by email)
3. ✅ Hashes the password using bcrypt
4. ✅ Creates the super admin user with role `super_admin`
5. ✅ Assigns all system permissions to the user
6. ✅ Displays login credentials

### Idempotency

The seeder is idempotent - if a user with the same email already exists, it will:
- Skip creation
- Display existing user information
- Exit gracefully

To reset the super admin:
1. Delete the existing user from the database
2. Run the seeder again

### Security Notes

- Password is hashed with bcrypt (10 rounds)
- Default password should be changed immediately in production
- All permissions are granted automatically
- User is created as active by default

### Troubleshooting

**Error: Organization not found**
- The seeder will automatically create the organization if it doesn't exist
- Ensure migrations have been run: `npm run migrate`

**Error: Email already exists**
- A user with that email already exists
- Use a different email or delete the existing user

**Error: Database connection failed**
- Check your `.env` file has correct database credentials
- Ensure PostgreSQL is running
- Verify `DATABASE_URL` is set correctly

### Login After Seeding

Use the credentials to login via the `/api/auth/login` endpoint:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@examportal.gov.et",
    "password": "Admin@123456"
  }'
```

The response will include a JWT token for authenticated requests.
