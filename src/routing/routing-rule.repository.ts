import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index';
import { routingRules, RoutingRule, NewRoutingRule } from '../db/schema';

export class RoutingRuleRepository {
  private get db() {
    return getDb();
  }

  async findAll(includeInactive = false): Promise<RoutingRule[]> {
    if (includeInactive) {
      return this.db.select().from(routingRules);
    }
    return this.db
      .select()
      .from(routingRules)
      .where(eq(routingRules.isActive, true));
  }

  async findById(id: string): Promise<RoutingRule | null> {
    const rows = await this.db
      .select()
      .from(routingRules)
      .where(eq(routingRules.id, id))
      .limit(1);
    return rows[0] ?? null;
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

  async create(data: NewRoutingRule): Promise<RoutingRule> {
    const rows = await this.db
      .insert(routingRules)
      .values(data)
      .returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewRoutingRule>): Promise<RoutingRule | null> {
    const rows = await this.db
      .update(routingRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(routingRules.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(routingRules)
      .where(eq(routingRules.id, id));
  }
}

export const routingRuleRepository = new RoutingRuleRepository();
export default RoutingRuleRepository;
