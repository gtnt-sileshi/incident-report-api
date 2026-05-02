/**
 * Clear Redis Revocation Data
 * Removes all revoked user and org session data from Redis.
 * 
 * Usage: npm run clear:revocations
 */

import { getRedis, closeRedis } from './redis';

async function clearRevocations() {
  console.log('🧹 Clearing Redis revocation data...\n');

  try {
    const redis = getRedis();

    // Clear old set-based revocations (legacy)
    const [oldUsersExist, oldOrgsExist] = await Promise.all([
      redis.exists('revoked:users'),
      redis.exists('revoked:orgs'),
    ]);

    if (oldUsersExist) {
      await redis.del('revoked:users');
      console.log('✅ Cleared legacy revoked:users set');
    }

    if (oldOrgsExist) {
      await redis.del('revoked:orgs');
      console.log('✅ Cleared legacy revoked:orgs set');
    }

    // Clear new key-based revocations
    const userKeys = await redis.keys('revoked:user:*');
    const orgKeys = await redis.keys('revoked:org:*');

    if (userKeys.length > 0) {
      console.log(`📋 Found ${userKeys.length} revoked user key(s)`);
      await redis.del(...userKeys);
      console.log('   ✅ Cleared all revoked:user:* keys');
    } else {
      console.log('📋 No revoked user keys found');
    }

    if (orgKeys.length > 0) {
      console.log(`📋 Found ${orgKeys.length} revoked organization key(s)`);
      await redis.del(...orgKeys);
      console.log('   ✅ Cleared all revoked:org:* keys');
    } else {
      console.log('📋 No revoked organization keys found');
    }

    console.log('\n✅ Redis revocation data cleared successfully\n');
  } catch (error) {
    console.error('\n❌ Error clearing revocations:', error);
    throw error;
  } finally {
    await closeRedis();
  }
}

// Run if executed directly
if (require.main === module) {
  clearRevocations()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { clearRevocations };
