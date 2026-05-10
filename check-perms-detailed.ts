import { users, organizations, userPermissions, orgPermissions, permissions } from './src/db/schema';
import { getDb } from './src/db/index';
import { eq, sql } from 'drizzle-orm';

async function checkSpecificPerms() {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, 'admin@examportal.gov.et')).limit(1);
  if (!user) { console.log('User not found'); return; }

  const uPerms = await db.select({ name: permissions.name })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, user.id));

  const oPerms = await db.select({ name: permissions.name })
    .from(orgPermissions)
    .innerJoin(permissions, eq(orgPermissions.permissionId, permissions.id))
    .where(eq(orgPermissions.orgId, user.orgId));

  console.log('User Role:', user.role);
  console.log('User Org ID:', user.orgId);
  console.log('User Permissions Count:', uPerms.length);
  console.log('Org Permissions Count:', oPerms.length);
  
  const hasU = uPerms.some(p => p.name === 'incidents.view');
  const hasO = oPerms.some(p => p.name === 'incidents.view');
  
  console.log('User has incidents.view:', hasU);
  console.log('Org has incidents.view:', hasO);
}

checkSpecificPerms().catch(console.error);
