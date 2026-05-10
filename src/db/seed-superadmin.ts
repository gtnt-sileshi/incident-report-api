/**
 * Super Admin Seeder
 * Creates a super admin user for initial system setup.
 * 
 * Usage: npm run seed:superadmin
 */

import bcrypt from 'bcryptjs';
import { getDb } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';

interface SuperAdminConfig {
  name: string;
  email: string;
  password: string;
  phoneNumber?: string;
}

const DEFAULT_CONFIG: SuperAdminConfig = {
  name: 'Super Admin',
  email: 'admin@examportal.gov.et',
  password: 'Admin@123456', // Change this in production!
  phoneNumber: '+251911000000',
};

async function seedSuperAdmin(config: SuperAdminConfig = DEFAULT_CONFIG) {
  console.log('🌱 Starting Super Admin seeder...\n');

  const db = getDb();

  try {
    // Check if super admin already exists
    console.log(`👤 Checking for existing super admin: ${config.email}`);
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
      console.log(`\n🔐 Resetting password for existing super admin...`);
      const passwordHash = await bcrypt.hash(config.password, 10);
      await db.update(users)
        .set({ passwordHash, isActive: true })
        .where(eq(users.id, existingUser.id));
      console.log(`   ✅ Password reset successfully\n`);
      return existingUser;
    }

    // Hash password
    console.log(`\n🔐 Hashing password...`);
    const passwordHash = await bcrypt.hash(config.password, 10);
    console.log(`   ✅ Password hashed`);

    // Create super admin user
    console.log(`\n👤 Creating super admin user...`);
    const [superAdmin] = await db
      .insert(users)
      .values({
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

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ SUPER ADMIN CREATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`\n📋 Login Credentials:`);
    console.log(`   Email:    ${superAdmin.email}`);
    console.log(`   Password: ${config.password}`);
    console.log(`\n⚠️  IMPORTANT: Change the password after first login!\n`);
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
