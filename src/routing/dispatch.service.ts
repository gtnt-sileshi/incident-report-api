import { routingRuleRepository } from './routing-rule.repository';
import { incidentRepository } from '../incidents/incident.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { userRepository } from '../users/user.repository';
import { Incident } from '../db/schema';
import { notificationService } from '../notifications/notification.service';

// System actor UUID used for automated audit log entries
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export class DispatchService {
  /**
   * Evaluates active routing rules in priority order and auto-assigns the incident
   * to the first matching rule's target user.
   *
   * Matching criteria:
   *  - incidentTypeId: rule matches any type if null, or must equal incident's type
   *  - examFieldId: rule matches any center if null, or must equal incident's examCenterId
   *
   * After a match:
   *  - Assigns the incident to the target user
   *  - Updates status to 'Assigned'
   *  - If rule.autoAssign is true, further transitions to 'Acknowledged'
   *  - Appends an audit log entry with actionType 'auto_dispatched'
   *
   * If no rule matches, the incident is left in its current status (Reported/Submitted).
   */
  async dispatchIncident(incident: Incident): Promise<void> {
    const rules = await routingRuleRepository.findActiveOrdered();

    for (const rule of rules) {
      const typeMatch = !rule.incidentTypeId || rule.incidentTypeId === incident.incidentTypeId;
      const fieldMatch = !rule.examFieldId || rule.examFieldId === incident.examCenterId;

      if (!typeMatch || !fieldMatch) continue;

      // Verify the target user exists and is active
      const target = await userRepository.findById(rule.targetUserId!);
      if (!target?.isActive) continue;

      // Assign incident to the target user
      await incidentRepository.updateAssignment(incident.id, rule.targetUserId!);
      await incidentRepository.updateStatus(incident.id, 'Assigned');

      // If autoAssign is enabled, immediately acknowledge
      if (rule.autoAssign) {
        await incidentRepository.updateStatus(incident.id, 'Acknowledged');
      }

      await auditLogRepository.append({
        incidentId:    incident.id,
        actorUserId:   SYSTEM_USER_ID,
        actorRole:     'system',
        actionType:    'auto_dispatched',
        fieldChanged:  null,
        previousValue: null,
        newValue:      JSON.stringify({ ruleId: rule.id, targetUserId: rule.targetUserId }),
      });

      // Notify Target User (Non-blocking)
      const message = `Auto-assigned: New ${incident.priority} priority incident ${incident.trackingNumber ?? incident.id.substring(0,8)}`;
      notificationService.createNotification(rule.targetUserId!, incident.id, message).catch(err =>
        console.error('[DispatchService] Failed to notify auto-assigned user:', err));

      // Stop after the first matching rule
      return;
    }

    // No matching rule found — incident remains in its current status
  }
}

export const dispatchService = new DispatchService();
export default DispatchService;
