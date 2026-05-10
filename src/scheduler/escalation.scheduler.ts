import cron from 'node-cron';
import { incidentRepository } from '../incidents/incident.repository';
import { userRepository } from '../users/user.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { smsService } from '../notifications/sms.service';
import { pushNotificationService } from '../push/push-notification.service';
import { config } from '../config';

const SCHEDULER_ACTOR = {
  actorUserId: '00000000-0000-0000-0000-000000000000',
  actorRole: 'system',
};

async function processEscalations(): Promise<void> {
  try {
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

    const nationalCommandUsers = await userRepository.findAllByRole('national_command');
    
    for (const incident of eligibleIncidents) {
      try {
        if (incident.status === 'Escalated') {
          continue;
        }

        const elapsedMinutes = Math.floor(
          (Date.now() - new Date(incident.createdAt).getTime()) / 60000,
        );

        const updated = await incidentRepository.updateStatus(
          incident.id,
          'Escalated',
        );

        if (!updated) {
          console.error(
            `[EscalationScheduler] Failed to update incident ${incident.id} status`,
          );
          continue;
        }

        await auditLogRepository.append({
          ...SCHEDULER_ACTOR,
          incidentId: incident.id,
          actionType: 'incident_escalated_automatic',
          fieldChanged: 'status',
          previousValue: incident.status,
          newValue: `Escalated (auto-escalation: ${incident.priority} priority, ${elapsedMinutes} minutes elapsed)`,
        });

        const smsMessage = `ESCALATION: ${incident.priority} priority incident has been automatically escalated. Incident ID: ${incident.id}. Elapsed time: ${elapsedMinutes} minutes.`;
        
        for (const user of nationalCommandUsers) {
          if (user.phoneNumber) {
            await smsService.enqueueAlert(
              user.phoneNumber,
              smsMessage,
              incident.id,
            );
          }
        }

        const pushPayload = {
          title: 'Incident Automatically Escalated',
          body: `${incident.priority} priority incident has been escalated after ${elapsedMinutes} minutes`,
          incidentId: incident.id,
          data: {
            priority: incident.priority,
            status: incident.status,
            elapsedMinutes,
            escalationType: 'automatic',
          },
        };

        const commandUserIds = nationalCommandUsers.map((u) => u.id);
        if (commandUserIds.length > 0) {
          await pushNotificationService.sendToUsers(commandUserIds, pushPayload);
        }

        console.info(
          `[EscalationScheduler] Escalated incident ${incident.id} (${incident.priority} priority, ${elapsedMinutes} minutes elapsed)`,
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

export function startEscalationScheduler(): void {
  cron.schedule('*/5 * * * *', () => {
    void processEscalations();
  });

  console.info('[EscalationScheduler] Started — running every 5 minutes');
}
