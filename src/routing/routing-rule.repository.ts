import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db/index';
import { routingRules, RoutingRule, NewRoutingRule } from '../db/schema';

export class RoutingRuleRepository {
  private get db() {
    return getDb();
  }

  async findAll(): Promise<RoutingRule[]> {
    return this.db.select().from(routingRules);
  }

  async findById(id: string): Promise<RoutingRule | null> {
    const rows = await this.db
      .select()
      .from(routingRules)
      .where(eq(routingRules.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Returns all active routing rules ordered by priority ASC, then createdAt ASC.
   * Used by the dispatch engine to find the first matching rule.
   */
  async findActiveOrdered(): Promise<RoutingRule[]> {
    return this.db
      .select()
      .from(routingRules)
      .where(eq(routingRules.isActive, true))
      .orderBy(asc(routingRules.priority), asc(routingRules.createdAt));
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

  async delete(id: string): Promise<RoutingRule | null> {
    const rows = await this.db
      .delete(routingRules)
      .where(eq(routingRules.id, id))
      .returning();
    return rows[0] ?? null;
  }
}

export const routingRuleRepository = new RoutingRuleRepository();
export default RoutingRuleRepository;
