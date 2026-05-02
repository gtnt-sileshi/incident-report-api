import cron from 'node-cron';
import { incidentRepository } from '../incidents/incident.repository';
import { organizationRepository } from '../organizations/organization.repository';
import { userRepository } from '../users/user.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { smsService } from '../notifications/sms.service';
import { pushNotificationService } from '../push/push-notification.service';
import { config } from '../config';

/**
 * System actor used for audit log entries written by the scheduler.
 * These values are synthetic — the scheduler is not a human user.
 */
const SCHEDULER_ACTOR = {
  actorUserId: '00000000-0000-0000-0000-000000000000',
  actorRole: 'system',
  actorOrgId: '00000000-0000-0000-0000-000000000000',
};

/**
 * Processes all incidents that are eligible for automatic escalation:
 *   - status is "In-Progress"
 *   - High-priority incidents unresolved >= 30 minutes
 *   - Medium-priority incidents unresolved >= 90 minutes
 *
 * For each eligible incident:
 *   1. Assign to MoE exam-coordination unit
 *   2. Enqueue SMS alert
 *   3. Send push notifications to MoE and Bureau Staff
 *   4. Write audit log entry
 *
 * Requirements: 7.7, 7.8, 7.9
 */
async function processEscalations(): Promise<void> {
  try {
    // Query incidents that exceed the escalation threshold
    const eligibleIncidents = await incidentRepository.findInProgressBeyondThreshold({
      High: config.ESCALATION_HIGH_PRIORITY_MINUTES,
      Medium: config.ESCALATION_MEDIUM_PRIORITY_MINUTES,
    });

    if (eligibleIncidents.length === 0) {
      return;
    }

    console.info(
      `[EscalationScheduler] Processing ${eligibleIncidents.length} incidents for automatic escalation`,
    );

    // Look up MoE organization
    const moeOrg = await organizationRepository.findByName('MoE');
    if (!moeOrg) {
      console.error('[EscalationScheduler] MoE organization not found in the system');
      return;
    }

    // Look up ITDB organization for Bureau Staff notifications
    const itdbOrg = await organizationRepository.findByName('ITDB');
    if (!itdbOrg) {
      console.error('[EscalationScheduler] ITDB organization not found in the system');
      return;
    }

    for (const incident of eligibleIncidents) {
      try {
        // Skip if already assigned to MoE (already escalated)
        if (incident.assignedOrgId === moeOrg.id) {
          continue;
        }

        const previousOrgId = incident.assignedOrgId;

        // Calculate elapsed time in minutes
        const elapsedMinutes = Math.floor(
          (Date.now() - new Date(incident.createdAt).getTime()) / 60000,
        );

        // Update assignment to MoE
        const updated = await incidentRepository.updateAssignment(
          incident.id,
          moeOrg.id,
          null,
        );

        if (!updated) {
          console.error(
            `[EscalationScheduler] Failed to update incident ${incident.id} assignment`,
          );
          continue;
        }

        // Write audit log entry
        await auditLogRepository.append({
          ...SCHEDULER_ACTOR,
          incidentId: incident.id,
          actionType: 'incident_escalated_automatic',
          fieldChanged: 'assigned_org_id',
          previousValue: previousOrgId ?? null,
          newValue: `${moeOrg.id} (auto-escalation: ${incident.priority} priority, ${elapsedMinutes} minutes elapsed)`,
        });

        // Enqueue SMS alert to MoE
        const smsMessage = `ESCALATION: ${incident.priority} priority incident at exam field has been automatically escalated to MoE. Incident ID: ${incident.id}. Elapsed time: ${elapsedMinutes} minutes.`;
        
        // Get MoE users to send SMS (assuming we send to all MoE users or a designated contact)
        const moeUsers = await userRepository.findAll(moeOrg.id, false);
        for (const user of moeUsers) {
          if (user.phoneNumber) {
            await smsService.enqueueAlert(
              user.phoneNumber,
              smsMessage,
              incident.id,
            );
          }
        }

        // Send push notifications to MoE
        const pushPayload = {
          title: 'Incident Automatically Escalated',
          body: `${incident.priority} priority incident has been escalated to MoE after ${elapsedMinutes} minutes`,
          incidentId: incident.id,
          data: {
            priority: incident.priority,
            status: incident.status,
            elapsedMinutes,
            escalationType: 'automatic',
          },
        };

        await pushNotificationService.sendToOrg(moeOrg.id, pushPayload);

        // Send push notifications to Bureau Staff
        const bureauStaffUsers = await userRepository.findAll(itdbOrg.id, false);
        const bureauStaff = bureauStaffUsers.filter((u) => u.role === 'bureau_staff');
        if (bureauStaff.length > 0) {
          const bureauStaffIds = bureauStaff.map((u) => u.id);
          await pushNotificationService.sendToUsers(bureauStaffIds, pushPayload);
        }

        console.info(
          `[EscalationScheduler] Escalated incident ${incident.id} to MoE (${incident.priority} priority, ${elapsedMinutes} minutes elapsed)`,
        );
      } catch (err) {
        console.error(
          `[EscalationScheduler] Failed to escalate incident ${incident.id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error('[EscalationScheduler] Failed to process escalations:', err);
  }
}

/**
 * Starts the escalation cron job.
 * Runs every 5 minutes.
 * Call this once from server.ts after the database connection is established.
 */
export function startEscalationScheduler(): void {
  cron.schedule('*/5 * * * *', () => {
    void processEscalations();
  });

  console.info('[EscalationScheduler] Started — running every 5 minutes');
}
