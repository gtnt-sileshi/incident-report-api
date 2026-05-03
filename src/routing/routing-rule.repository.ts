import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import {
  routingRules,
  incidentTypes,
  organizations,
  users,
  RoutingRule,
  NewRoutingRule,
} from '../db/schema';

export interface RoutingRuleWithRelations extends RoutingRule {
  incidentTypeName: string | null;
  targetOrgName: string | null;
  targetUserName: string | null;
}

export class RoutingRuleRepository {
  private get db() {
    return getDb();
  }

  private async enrich(rule: RoutingRule): Promise<RoutingRuleWithRelations> {
    const db = this.db;

    const [incidentType, targetOrg, targetUser] = await Promise.all([
      rule.incidentTypeId
        ? db.select({ name: incidentTypes.name }).from(incidentTypes)
            .where(eq(incidentTypes.id, rule.incidentTypeId)).limit(1).then(r => r[0] ?? null)
        : null,
      rule.targetOrgId
        ? db.select({ name: organizations.name }).from(organizations)
            .where(eq(organizations.id, rule.targetOrgId)).limit(1).then(r => r[0] ?? null)
        : null,
      rule.targetUserId
        ? db.select({ name: users.name }).from(users)
            .where(eq(users.id, rule.targetUserId)).limit(1).then(r => r[0] ?? null)
        : null,
    ]);

    return {
      ...rule,
      incidentTypeName: incidentType?.name ?? null,
      targetOrgName:    targetOrg?.name ?? null,
      targetUserName:   targetUser?.name ?? null,
    };
  }

  private async enrichAll(rows: RoutingRule[]): Promise<RoutingRuleWithRelations[]> {
    return Promise.all(rows.map(r => this.enrich(r)));
  }

  async findAll(includeInactive = false): Promise<RoutingRuleWithRelations[]> {
    const rows = includeInactive
      ? await this.db.select().from(routingRules)
      : await this.db.select().from(routingRules).where(eq(routingRules.isActive, true));
    return this.enrichAll(rows);
  }

  async findById(id: string): Promise<RoutingRuleWithRelations | null> {
    const rows = await this.db
      .select()
      .from(routingRules)
      .where(eq(routingRules.id, id))
      .limit(1);
    if (!rows[0]) return null;
    return this.enrich(rows[0]);
  }

  async findByIncidentType(incidentTypeId: string): Promise<RoutingRule | null> {
    const rows = await this.db
      .select()
      .from(routingRules)
      .where(
        and(
          eq(routingRules.incidentTypeId, incidentTypeId),
          eq(routingRules.isActive, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewRoutingRule): Promise<RoutingRuleWithRelations> {
    const rows = await this.db
      .insert(routingRules)
      .values(data)
      .returning();
    return this.enrich(rows[0]);
  }

  async update(id: string, data: Partial<NewRoutingRule>): Promise<RoutingRuleWithRelations | null> {
    const rows = await this.db
      .update(routingRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(routingRules.id, id))
      .returning();
    if (!rows[0]) return null;
    return this.enrich(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(routingRules)
      .where(eq(routingRules.id, id));
  }
}

export const routingRuleRepository = new RoutingRuleRepository();
export default RoutingRuleRepository;
