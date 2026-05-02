/**
 * Super Admin Seeder
 * Creates a super admin user with all permissions for initial system setup.
 * 
 * Usage: npm run seed:superadmin
 */

import bcrypt from 'bcryptjs';
import { getDb } from './index';
import { organizations, users, permissions, userPermissions, orgPermissions, Permission } from './schema';
import { eq } from 'drizzle-orm';

interface SuperAdminConfig {
  name: string;
  email: string;
  password: string;
  phoneNumber?: string;
  organizationName: string;
}

const DEFAULT_CONFIG: SuperAdminConfig = {
  name: 'Super Admin',
  email: 'admin@examportal.gov.et',
  password: 'Admin@123456', // Change this in production!
  phoneNumber: '+251911000000',
  organizationName: 'ITDB',
};

async function seedSuperAdmin(config: SuperAdminConfig = DEFAULT_CONFIG) {
  console.log('🌱 Starting Super Admin seeder...\n');

  const db = getDb();

  try {
    // 1. Find or create the organization
    console.log(`📋 Looking for organization: ${config.organizationName}`);
    let [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, config.organizationName))
      .limit(1);

    if (!org) {
      console.log(`   ⚠️  Organization not found, creating: ${config.organizationName}`);
      [org] = await db
        .insert(organizations)
        .values({
          name: config.organizationName,
          type: 'government',
          isActive: true,
        })
        .returning();
      console.log(`   ✅ Organization created: ${org.id}`);
    } else {
      console.log(`   ✅ Organization found: ${org.id}`);
    }

    // 2. Check if super admin already exists
    console.log(`\n👤 Checking for existing super admin: ${config.email}`);
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, config.email))
      .limit(1);

    if (existingUser) {
      console.log(`   ⚠️  Super admin already exists: ${existingUser.id}`);
      console.log(`   📧 Email: ${existingUser.email}`);
      console.log(`   👤 Name: ${existingUser.name}`);
      console.log(`   🏢 Role: ${existingUser.role}`);
      console.log('\n   To reset password, delete the user first or use a different email.\n');
      return existingUser;
    }

    // 3. Hash password
    console.log(`\n🔐 Hashing password...`);
    const passwordHash = await bcrypt.hash(config.password, 10);
    console.log(`   ✅ Password hashed`);

    // 4. Create super admin user
    console.log(`\n👤 Creating super admin user...`);
    const [superAdmin] = await db
      .insert(users)
      .values({
        orgId: org.id,
        name: config.name,
        email: config.email,
        passwordHash,
        role: 'super_admin',
        phoneNumber: config.phoneNumber,
        isActive: true,
      })
      .returning();

    console.log(`   ✅ Super admin created: ${superAdmin.id}`);
    console.log(`   📧 Email: ${superAdmin.email}`);
    console.log(`   👤 Name: ${superAdmin.name}`);
    console.log(`   🏢 Role: ${superAdmin.role}`);

    // 5. Get all permissions
    console.log(`\n🔑 Fetching all permissions...`);
    const allPermissions = await db.select().from(permissions);
    console.log(`   ✅ Found ${allPermissions.length} permissions`);

    // 6. Assign all permissions to super admin
    console.log(`\n🔐 Assigning all permissions to super admin...`);
    const permissionInserts = allPermissions.map((perm: Permission) => ({
      userId: superAdmin.id,
      permissionId: perm.id,
    }));

    await db.insert(userPermissions).values(permissionInserts);
    console.log(`   ✅ Assigned ${allPermissions.length} permissions to user`);

    // 7. Assign all permissions to the organization (ITDB)
    console.log(`\n🏢 Assigning all permissions to organization: ${org.name}...`);
    const orgPermissionInserts = allPermissions.map((perm: Permission) => ({
      orgId: org.id,
      permissionId: perm.id,
    }));

    await db.insert(orgPermissions).values(orgPermissionInserts);
    console.log(`   ✅ Assigned ${allPermissions.length} permissions to organization`);

    // 7. Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ SUPER ADMIN CREATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`\n📋 Login Credentials:`);
    console.log(`   Email:    ${superAdmin.email}`);
    console.log(`   Password: ${config.password}`);
    console.log(`\n⚠️  IMPORTANT: Change the password after first login!\n`);
    console.log(`🔑 User Permissions: ${allPermissions.length} (all permissions granted)`);
    console.log(`🏢 Organization: ${org.name} (${org.type})`);
    console.log(`🔑 Org Permissions: ${allPermissions.length} (all permissions granted)`);
    console.log(`\n${'='.repeat(60)}\n`);

    return superAdmin;
  } catch (error) {
    console.error('\n❌ Error creating super admin:', error);
    throw error;
  }
}

// Run seeder if executed directly
if (require.main === module) {
  seedSuperAdmin()
    .then(() => {
      console.log('✅ Seeder completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeder failed:', error);
      process.exit(1);
    });
}

export { seedSuperAdmin, SuperAdminConfig };
