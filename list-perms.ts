import { permissions } from './src/db/schema';
import { getDb } from './src/db/index';

async function listPerms() {
  const db = getDb();
  const allPerms = await db.select().from(permissions);
  console.log('Total Permissions:', allPerms.length);
  console.log(allPerms.map(p => p.name).sort());
}

listPerms().catch(console.error);
