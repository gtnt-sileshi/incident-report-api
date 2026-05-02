/**
 * Fix Organization Permissions
 * Assigns all permissions to ITDB organization for existing super admin setup.
 * 
 * Usage: npm run fix:org-permissions
 */

import { getDb } from './index';
import { organizations, permissions, orgPermissions, Permission } from './schema';
import { eq } from 'drizzle-orm';

async function fixOrgPermissions() {
  console.log('🔧 Fixing organization permissions...\n');

  const db = getDb();

  try {
    // 1. Find ITDB organization
    console.log('📋 Looking for ITDB organization...');
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, 'ITDB'))
      .limit(1);

    if (!org) {
      console.log('   ❌ ITDB organization not found');
      return;
    }

    console.log(`   ✅ Found ITDB: ${org.id}`);

    // 2. Get all permissions
    console.log(`\n🔑 Fetching all permissions...`);
    const allPermissions = await db.select().from(permissions);
    console.log(`   ✅ Found ${allPermissions.length} permissions`);

    // 3. Check existing org permissions
    console.log(`\n📋 Checking existing org permissions...`);
    const existingOrgPerms = await db
      .select()
      .from(orgPermissions)
      .where(eq(orgPermissions.orgId, org.id));
    
    console.log(`   📊 Current org permissions: ${existingOrgPerms.length}`);

    if (existingOrgPerms.length === allPermissions.length) {
      console.log(`   ✅ Organization already has all permissions\n`);
      return;
    }

    // 4. Assign all permissions to organization
    console.log(`\n🏢 Assigning all permissions to ITDB...`);
    
    // Delete existing permissions first
    if (existingOrgPerms.length > 0) {
      await db
        .delete(orgPermissions)
        .where(eq(orgPermissions.orgId, org.id));
      console.log(`   🗑️  Cleared ${existingOrgPerms.length} existing permissions`);
    }

    // Insert all permissions
    const orgPermissionInserts = allPermissions.map((perm: Permission) => ({
      orgId: org.id,
      permissionId: perm.id,
    }));

    await db.insert(orgPermissions).values(orgPermissionInserts);
    console.log(`   ✅ Assigned ${allPermissions.length} permissions to ITDB`);

    // 5. Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ ORGANIZATION PERMISSIONS FIXED');
    console.log('='.repeat(60));
    console.log(`\n🏢 Organization: ${org.name} (${org.type})`);
    console.log(`🔑 Permissions: ${allPermissions.length} (all permissions granted)`);
    console.log(`\n${'='.repeat(60)}\n`);
  } catch (error) {
    console.error('\n❌ Error fixing org permissions:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  fixOrgPermissions()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { fixOrgPermissions };
