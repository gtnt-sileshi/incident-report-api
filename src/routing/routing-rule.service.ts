import { routingRuleRepository } from './routing-rule.repository';
import { AppError } from '../middleware/errorHandler';
import { RoutingRule, NewRoutingRule } from '../db/schema';

export class RoutingRuleService {
  /**
   * Creates a new routing rule.
   * Requirements: 17.1, 17.4
   */
  async createRoutingRule(data: NewRoutingRule): Promise<RoutingRule> {
    // At least one of targetOrgId or targetUserId must be provided
    if (!data.targetOrgId && !data.targetUserId) {
      throw new AppError(
        400,
        'ROUTING_RULE_MISSING_TARGET',
        'A routing rule must specify either a target organization or a target user',
      );
    }

    return routingRuleRepository.create(data);
  }

  /**
   * Updates an existing routing rule's fields.
   * Requirements: 17.5
   */
  async updateRoutingRule(id: string, data: Partial<NewRoutingRule>): Promise<RoutingRule> {
    const existing = await routingRuleRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'ROUTING_RULE_NOT_FOUND', `Routing rule ${id} not found`);
    }

    // Validate that the update doesn't leave the rule without a target
    const targetOrgId = data.targetOrgId !== undefined ? data.targetOrgId : existing.targetOrgId;
    const targetUserId = data.targetUserId !== undefined ? data.targetUserId : existing.targetUserId;

    if (!targetOrgId && !targetUserId) {
      throw new AppError(
        400,
        'ROUTING_RULE_MISSING_TARGET',
        'A routing rule must specify either a target organization or a target user',
      );
    }

    const updated = await routingRuleRepository.update(id, data);
    if (!updated) {
      throw new AppError(404, 'ROUTING_RULE_NOT_FOUND', `Routing rule ${id} not found`);
    }

    return updated;
  }

  /**
   * Hard-deletes a routing rule.
   * Requirements: 17.6
   */
  async deleteRoutingRule(id: string): Promise<void> {
    const existing = await routingRuleRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'ROUTING_RULE_NOT_FOUND', `Routing rule ${id} not found`);
    }

    await routingRuleRepository.delete(id);
  }

  /**
   * Lists all active routing rules.
   * Requirements: 17.1
   */
  async listRoutingRules(includeInactive = false): Promise<RoutingRule[]> {
    return routingRuleRepository.findAll(includeInactive);
  }

  /**
   * Fetches a single routing rule by ID.
   * Requirements: 17.1
   */
  async getRoutingRule(id: string): Promise<RoutingRule> {
    const rule = await routingRuleRepository.findById(id);
    if (!rule) {
      throw new AppError(404, 'ROUTING_RULE_NOT_FOUND', `Routing rule ${id} not found`);
    }
    return rule;
  }

  /**
   * Finds the active routing rule for a given incident type.
   * Returns the rule if one exists, or null if no active rule is configured.
   * Requirements: 17.2
   */
  async evaluateRule(incidentTypeId: string): Promise<RoutingRule | null> {
    return routingRuleRepository.findByIncidentType(incidentTypeId);
  }
}

export const routingRuleService = new RoutingRuleService();
export default RoutingRuleService;
