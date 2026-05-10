import { getDb } from './src/db/index';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  console.log('🗑️ Deleting existing super admin...');
  await db.delete(users).where(eq(users.email, 'admin@examportal.gov.et'));
  console.log('✅ Done.');
  process.exit(0);
}

main();
