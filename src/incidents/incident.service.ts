import { z } from 'zod';
import { incidentRepository } from './incident.repository';
import { commentRepository } from './comment.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { organizationRepository } from '../organizations/organization.repository';
import { examCenterAssignmentRepository } from '../devices/exam-center-assignment.repository';
import { routingRuleService } from '../routing/routing-rule.service';
import { userRepository } from '../users/user.repository';
import { pushNotificationService } from '../push/push-notification.service';
import { websocketPublisher } from '../websocket/websocket-publisher.service';
import { AppError } from '../middleware/errorHandler';
import { Incident, NewIncident } from '../db/schema';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const CreateIncidentSchema = z.object({
  examFieldId:     z.string().uuid(),
  incidentTypeId:  z.string().uuid(),
  priority:        z.enum(['Low', 'Medium', 'High']),
  description:     z.string().optional(),
  localId:         z.string().optional(),
  deviceId:        z.string().uuid().optional(),
});

export const UpdateStatusSchema = z.object({
  status:            z.enum(['Reported', 'Assigned', 'In-Progress', 'Resolved']),
  resolutionSummary: z.string().optional(),
});

export const AssignIncidentSchema = z.object({
  orgId:  z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export const AddCommentSchema = z.object({
  content: z.string().min(1),
});

export type CreateIncidentData  = z.infer<typeof CreateIncidentSchema>;
export type UpdateStatusData    = z.infer<typeof UpdateStatusSchema>;
export type AssignIncidentData  = z.infer<typeof AssignIncidentSchema>;

// ─── Status Order ─────────────────────────────────────────────────────────────

export const STATUS_ORDER: Record<string, number> = {
  'Reported':    0,
  'Assigned':    1,
  'In-Progress': 2,
  'Resolved':    3,
};

// ─── Requesting User Shape ────────────────────────────────────────────────────

export interface RequestingUser {
  sub:    string;
  role:   string;
  orgId:  string;
  email?: string;
}

// ─── IncidentService ──────────────────────────────────────────────────────────

export class IncidentService {

  /**
   * Creates a new incident.
   *
   * - Validates the exam field is in the reporter's assignment
   * - Sets initial status = "Reported", assigned_org = ITDB
   * - Applies routing rule if present and autoAssign = true
   * - Writes audit log entry
   * - Sends push notifications to Bureau Staff (all incidents) and assigned org (if assigned)
   *
   * Requirements: 6.1, 17.2, 17.4, 14.1, 14.2, 7.2, 7.3, 12.1
   */
  async createIncident(
    data: CreateIncidentData,
    requestingUser: RequestingUser,
  ): Promise<Incident> {
    // Validate exam field is in reporter's assignment
    const assignments = await examCenterAssignmentRepository.findByUser(requestingUser.sub);
    const assignedFieldIds = assignments.map((a) => a.examFieldId);
    if (!assignedFieldIds.includes(data.examFieldId)) {
      throw new AppError(
        403,
        'EXAM_FIELD_NOT_ASSIGNED',
        'The specified exam field is not in your assignment',
      );
    }

    // Look up ITDB org
    const itdbOrg = await organizationRepository.findByName('ITDB');
    if (!itdbOrg) {
      throw new AppError(500, 'ITDB_ORG_NOT_FOUND', 'ITDB organization not found in the system');
    }

    // Build initial incident data
    const incidentData: NewIncident = {
      examFieldId:      data.examFieldId,
      incidentTypeId:   data.incidentTypeId,
      reportedByUserId: requestingUser.sub,
      deviceId:         data.deviceId ?? null,
      priority:         data.priority,
      status:           'Reported',
      description:      data.description ?? null,
      assignedOrgId:    itdbOrg.id,
      assignedUserId:   null,
      localId:          data.localId ?? null,
    };

    // Apply routing rule if present and autoAssign = true
    const rule = await routingRuleService.evaluateRule(data.incidentTypeId);
    if (rule && rule.autoAssign) {
      if (rule.targetOrgId)  incidentData.assignedOrgId  = rule.targetOrgId;
      if (rule.targetUserId) incidentData.assignedUserId = rule.targetUserId;
    }

    // Create the incident
    const incident = await incidentRepository.create(incidentData);

    // Write audit log entry
    await auditLogRepository.append({
      incidentId:    incident.id,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actorOrgId:    requestingUser.orgId,
      actionType:    'incident_created',
      fieldChanged:  'status',
      previousValue: null,
      newValue:      'Reported',
      routingRuleId: rule?.id ?? null,
    });

    // Publish WebSocket event (non-blocking)
    this.publishIncidentCreatedEvent(incident, itdbOrg.id).catch((err) => {
      console.error('[IncidentService] Failed to publish WebSocket event:', err);
    });

    // Send push notifications (non-blocking)
    this.sendIncidentCreatedPushNotifications(incident, itdbOrg.id).catch((err) => {
      console.error('[IncidentService] Failed to send push notifications:', err);
    });

    return incident;
  }

  /**
   * Publishes WebSocket event when an incident is created.
   * Requirements: 8.2
   */
  private async publishIncidentCreatedEvent(incident: Incident, itdbOrgId: string): Promise<void> {
    try {
      const orgIds: string[] = [itdbOrgId];

      // If assigned to a specific org (via routing rule), publish to that org too
      if (incident.assignedOrgId && incident.assignedOrgId !== itdbOrgId) {
        orgIds.push(incident.assignedOrgId);
      }

      await websocketPublisher.publishToOrgs(orgIds, {
        event: 'incident.created',
        data: incident,
      });
    } catch (err) {
      console.error('[IncidentService] publishIncidentCreatedEvent error:', err);
    }
  }

  /**
   * Sends push notifications when an incident is created.
   * - Push to all Bureau Staff
   * - If High-priority, push immediately to all Bureau Staff
   * - If assigned to a specific org (via routing rule), push to that org
   */
  private async sendIncidentCreatedPushNotifications(
    incident: Incident,
    itdbOrgId: string,
  ): Promise<void> {
    try {
      // Get all Bureau Staff users
      const bureauStaffUsers = await userRepository.findAll(itdbOrgId, false);
      const bureauStaff = bureauStaffUsers.filter((u) => u.role === 'bureau_staff');

      const payload = {
        title: `New ${incident.priority} Priority Incident`,
        body: incident.description ?? 'A new incident has been reported',
        incidentId: incident.id,
        data: {
          priority: incident.priority,
          status: incident.status,
        },
      };

      // Push to all Bureau Staff
      if (bureauStaff.length > 0) {
        const bureauStaffIds = bureauStaff.map((u) => u.id);
        await pushNotificationService.sendToUsers(bureauStaffIds, payload);
      }

      // If assigned to a specific org (not ITDB), push to that org
      if (incident.assignedOrgId && incident.assignedOrgId !== itdbOrgId) {
        await pushNotificationService.sendToOrg(incident.assignedOrgId, payload);
      }

      // If assigned to a specific user, push to that user
      if (incident.assignedUserId) {
        await pushNotificationService.sendToUser(incident.assignedUserId, payload);
      }
    } catch (err) {
      console.error('[IncidentService] sendIncidentCreatedPushNotifications error:', err);
    }
  }

  /**
   * Updates the status of an incident.
   *
   * - Enforces forward-only status machine: Reported → Assigned → In-Progress → Resolved
   * - Rejects backward transitions for non-Super_Admin users
   * - Requires resolution summary (min 10 chars) on Resolved transition
   * - Writes audit log entry
   * - Sends push notifications to reporter and assigned body
   *
   * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 14.1, 14.2, 7.2, 7.3
   */
  async updateStatus(
    incidentId:        string,
    newStatus:         string,
    requestingUser:    RequestingUser,
    resolutionSummary?: string,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    const currentOrder = STATUS_ORDER[incident.status] ?? 0;
    const newOrder     = STATUS_ORDER[newStatus] ?? 0;

    // Enforce forward-only for non-Super_Admin
    if (newOrder < currentOrder && requestingUser.role !== 'super_admin') {
      throw new AppError(
        400,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition from "${incident.status}" to "${newStatus}"`,
      );
    }

    // Require resolution summary on Resolved transition
    if (newStatus === 'Resolved') {
      if (!resolutionSummary || resolutionSummary.trim().length < 10) {
        throw new AppError(
          400,
          'RESOLUTION_SUMMARY_REQUIRED',
          'A resolution summary of at least 10 characters is required when resolving an incident',
        );
      }
    }

    // Persist the status change
    let updated: Incident | null;
    if (newStatus === 'Resolved' && resolutionSummary) {
      updated = await incidentRepository.resolve(incidentId, resolutionSummary);
    } else {
      updated = await incidentRepository.updateStatus(incidentId, newStatus);
    }

    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    // Write audit log entry
    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actorOrgId:    requestingUser.orgId,
      actionType:    'status_changed',
      fieldChanged:  'status',
      previousValue: incident.status,
      newValue:      newStatus,
    });

    // Publish WebSocket event (non-blocking)
    this.publishStatusChangeEvent(updated, incident.status, requestingUser).catch((err) => {
      console.error('[IncidentService] Failed to publish WebSocket event:', err);
    });

    // Send push notifications (non-blocking)
    this.sendStatusChangePushNotifications(updated, incident.status).catch((err) => {
      console.error('[IncidentService] Failed to send push notifications:', err);
    });

    return updated;
  }

  /**
   * Publishes WebSocket event when incident status changes.
   * Requirements: 8.2
   */
  private async publishStatusChangeEvent(
    incident: Incident,
    previousStatus: string,
    actor: RequestingUser,
  ): Promise<void> {
    try {
      const orgIds: string[] = [];

      // Publish to ITDB (always)
      const itdbOrg = await organizationRepository.findByName('ITDB');
      if (itdbOrg) {
        orgIds.push(itdbOrg.id);
      }

      // Publish to assigned org
      if (incident.assignedOrgId && incident.assignedOrgId !== itdbOrg?.id) {
        orgIds.push(incident.assignedOrgId);
      }

      await websocketPublisher.publishToOrgs(orgIds, {
        event: 'incident.status_changed',
        data: {
          incidentId: incident.id,
          newStatus: incident.status,
          previousStatus,
          actor: {
            userId: actor.sub,
            role: actor.role,
          },
        },
      });
    } catch (err) {
      console.error('[IncidentService] publishStatusChangeEvent error:', err);
    }
  }

  /**
   * Sends push notifications when incident status changes.
   * - Status changed to In-Progress → push to reporter IT Rep + assigned body
   * - Incident resolved → push to reporter IT Rep + assigned body
   */
  private async sendStatusChangePushNotifications(
    incident: Incident,
    previousStatus: string,
  ): Promise<void> {
    try {
      const payload = {
        title: `Incident Status Updated: ${incident.status}`,
        body: `Incident status changed from ${previousStatus} to ${incident.status}`,
        incidentId: incident.id,
        data: {
          previousStatus,
          newStatus: incident.status,
        },
      };

      const recipientIds: string[] = [];

      // Always notify the reporter
      recipientIds.push(incident.reportedByUserId);

      // Notify assigned body
      if (incident.assignedUserId) {
        recipientIds.push(incident.assignedUserId);
      } else if (incident.assignedOrgId) {
        // Push to all users in the assigned org
        await pushNotificationService.sendToOrg(incident.assignedOrgId, payload);
      }

      // Send to individual recipients
      if (recipientIds.length > 0) {
        await pushNotificationService.sendToUsers(recipientIds, payload);
      }
    } catch (err) {
      console.error('[IncidentService] sendStatusChangePushNotifications error:', err);
    }
  }

  /**
   * Assigns or reassigns an incident to an org or specific user.
   *
   * - Requires reason on reassignment (when incident already has an assigned_org or assigned_user)
   * - Writes audit log entry
   * - Sends push notifications to newly assigned body
   *
   * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 14.1, 14.2
   */
  async assignIncident(
    incidentId:     string,
    data:           AssignIncidentData,
    requestingUser: RequestingUser,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    // Require reason on reassignment
    const isReassignment = !!(incident.assignedOrgId || incident.assignedUserId);
    if (isReassignment && !data.reason) {
      throw new AppError(
        400,
        'REASSIGNMENT_REASON_REQUIRED',
        'A reason is required when reassigning an incident',
      );
    }

    if (!data.orgId && !data.userId) {
      throw new AppError(
        400,
        'ASSIGNMENT_TARGET_REQUIRED',
        'Either orgId or userId must be provided for assignment',
      );
    }

    const previousOrgId = incident.assignedOrgId;

    const updated = await incidentRepository.updateAssignment(
      incidentId,
      data.orgId  ?? null,
      data.userId ?? null,
    );

    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    // Write audit log entry
    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actorOrgId:    requestingUser.orgId,
      actionType:    isReassignment ? 'incident_reassigned' : 'incident_assigned',
      fieldChanged:  'assigned_org_id',
      previousValue: previousOrgId ?? null,
      newValue:      data.orgId ?? data.userId ?? null,
    });

    // Publish WebSocket event (non-blocking)
    this.publishAssignmentEvent(updated, requestingUser).catch((err) => {
      console.error('[IncidentService] Failed to publish WebSocket event:', err);
    });

    // Send push notifications (non-blocking)
    this.sendAssignmentPushNotifications(updated).catch((err) => {
      console.error('[IncidentService] Failed to send push notifications:', err);
    });

    return updated;
  }

  /**
   * Publishes WebSocket event when incident is assigned.
   * Requirements: 8.2
   */
  private async publishAssignmentEvent(
    incident: Incident,
    actor: RequestingUser,
  ): Promise<void> {
    try {
      const orgIds: string[] = [];

      // Publish to ITDB (always)
      const itdbOrg = await organizationRepository.findByName('ITDB');
      if (itdbOrg) {
        orgIds.push(itdbOrg.id);
      }

      // Publish to assigned org
      if (incident.assignedOrgId && incident.assignedOrgId !== itdbOrg?.id) {
        orgIds.push(incident.assignedOrgId);
      }

      await websocketPublisher.publishToOrgs(orgIds, {
        event: 'incident.assigned',
        data: {
          incidentId: incident.id,
          assignedOrgId: incident.assignedOrgId,
          assignedUserId: incident.assignedUserId,
          actor: {
            userId: actor.sub,
            role: actor.role,
          },
        },
      });
    } catch (err) {
      console.error('[IncidentService] publishAssignmentEvent error:', err);
    }
  }

  /**
   * Sends push notifications when incident is assigned.
   * - Incident assigned to org → push to all users of that org
   * - Incident assigned to specific user → push to that user
   */
  private async sendAssignmentPushNotifications(incident: Incident): Promise<void> {
    try {
      const payload = {
        title: 'Incident Assigned to You',
        body: incident.description ?? 'An incident has been assigned to you',
        incidentId: incident.id,
        data: {
          priority: incident.priority,
          status: incident.status,
        },
      };

      if (incident.assignedUserId) {
        await pushNotificationService.sendToUser(incident.assignedUserId, payload);
      } else if (incident.assignedOrgId) {
        await pushNotificationService.sendToOrg(incident.assignedOrgId, payload);
      }
    } catch (err) {
      console.error('[IncidentService] sendAssignmentPushNotifications error:', err);
    }
  }

  /**
   * Adds a comment to an incident.
   *
   * - Validates incident exists and is not Resolved
   * - Writes audit log entry
   * - Sends push notifications to all parties involved
   *
   * Requirements: 8.5, 14.1, 14.2
   */
  async addComment(
    incidentId:     string,
    content:        string,
    requestingUser: RequestingUser,
  ): Promise<import('../db/schema').Comment> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    if (incident.status === 'Resolved') {
      throw new AppError(
        400,
        'INCIDENT_RESOLVED',
        'Cannot add comments to a resolved incident',
      );
    }

    const comment = await commentRepository.create({
      incidentId: incidentId,
      authorId:   requestingUser.sub,
      body:       content,
    });

    // Write audit log entry
    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actorOrgId:    requestingUser.orgId,
      actionType:    'comment_added',
      fieldChanged:  null,
      previousValue: null,
      newValue:      comment.id,
    });

    // Send push notifications (non-blocking)
    this.sendCommentPushNotifications(incident, requestingUser.sub).catch((err) => {
      console.error('[IncidentService] Failed to send push notifications:', err);
    });

    return comment;
  }

  /**
   * Sends push notifications when a comment is added.
   * - Comment added → push to all parties involved (reporter, assigned body)
   */
  private async sendCommentPushNotifications(
    incident: Incident,
    commentAuthorId: string,
  ): Promise<void> {
    try {
      const payload = {
        title: 'New Comment on Incident',
        body: 'A new comment has been added to an incident you are involved in',
        incidentId: incident.id,
        data: {
          priority: incident.priority,
          status: incident.status,
        },
      };

      const recipientIds: string[] = [];

      // Notify reporter (unless they are the comment author)
      if (incident.reportedByUserId !== commentAuthorId) {
        recipientIds.push(incident.reportedByUserId);
      }

      // Notify assigned user (unless they are the comment author)
      if (incident.assignedUserId && incident.assignedUserId !== commentAuthorId) {
        recipientIds.push(incident.assignedUserId);
      }

      // Send to individual recipients
      if (recipientIds.length > 0) {
        await pushNotificationService.sendToUsers(recipientIds, payload);
      }

      // If assigned to an org, push to all users in that org (except comment author)
      if (incident.assignedOrgId) {
        await pushNotificationService.sendToOrg(incident.assignedOrgId, payload);
      }
    } catch (err) {
      console.error('[IncidentService] sendCommentPushNotifications error:', err);
    }
  }

  /**
   * Lists incidents, scoped by the requesting user's role/org.
   *
   * - Bureau_Staff sees all incidents
   * - External org users see only incidents assigned to their org
   *
   * Requirements: 1.3, 8.1, 9.1
   */
  async listIncidents(
    requestingUser: RequestingUser,
    filters?: import('./incident.repository').IncidentFilters,
  ): Promise<Incident[]> {
    const externalOrgRoles = ['external', 'ethio_telecom', 'elpa', 'security_police'];
    const isExternalOrg = externalOrgRoles.includes(requestingUser.role);

    if (isExternalOrg) {
      // External org users only see incidents assigned to their org
      return incidentRepository.findAll({
        ...filters,
        assignedOrgId: requestingUser.orgId,
      });
    }

    // Bureau_Staff, Super_Admin, MoE, etc. see all (or filtered)
    return incidentRepository.findAll(filters);
  }

  /**
   * Gets a single incident by ID, enforcing org scoping for external users.
   *
   * Requirements: 1.3, 9.1
   */
  async getIncident(
    incidentId:     string,
    requestingUser: RequestingUser,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    const externalOrgRoles = ['external', 'ethio_telecom', 'elpa', 'security_police'];
    const isExternalOrg = externalOrgRoles.includes(requestingUser.role);

    if (isExternalOrg && incident.assignedOrgId !== requestingUser.orgId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have access to this incident',
      );
    }

    return incident;
  }

  /**
   * Manually escalates an incident to MoE.
   *
   * - Sends push notifications to MoE and Bureau Staff
   *
   * Requirements: 7.7, 7.8, 7.9, 14.1, 14.2, 12.1
   */
  async escalateIncident(
    incidentId:     string,
    requestingUser: RequestingUser,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    // Look up MoE org
    const moeOrg = await organizationRepository.findByName('MoE');
    if (!moeOrg) {
      throw new AppError(500, 'MOE_ORG_NOT_FOUND', 'MoE organization not found in the system');
    }

    const previousOrgId = incident.assignedOrgId;

    const updated = await incidentRepository.updateAssignment(incidentId, moeOrg.id, null);
    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    // Write audit log entry
    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actorOrgId:    requestingUser.orgId,
      actionType:    'incident_escalated',
      fieldChanged:  'assigned_org_id',
      previousValue: previousOrgId ?? null,
      newValue:      moeOrg.id,
    });

    // Publish WebSocket event (non-blocking)
    this.publishEscalationEvent(updated, requestingUser).catch((err) => {
      console.error('[IncidentService] Failed to publish WebSocket event:', err);
    });

    // Send push notifications (non-blocking)
    this.sendEscalationPushNotifications(updated).catch((err) => {
      console.error('[IncidentService] Failed to send push notifications:', err);
    });

    return updated;
  }

  /**
   * Publishes WebSocket event when incident is escalated.
   * Requirements: 8.2
   */
  private async publishEscalationEvent(
    incident: Incident,
    actor: RequestingUser,
  ): Promise<void> {
    try {
      const orgIds: string[] = [];

      // Publish to ITDB (always)
      const itdbOrg = await organizationRepository.findByName('ITDB');
      if (itdbOrg) {
        orgIds.push(itdbOrg.id);
      }

      // Publish to MoE (new assigned org)
      if (incident.assignedOrgId && incident.assignedOrgId !== itdbOrg?.id) {
        orgIds.push(incident.assignedOrgId);
      }

      await websocketPublisher.publishToOrgs(orgIds, {
        event: 'incident.escalated',
        data: {
          incidentId: incident.id,
          reason: 'Manual escalation',
          actor: {
            userId: actor.sub,
            role: actor.role,
          },
        },
      });
    } catch (err) {
      console.error('[IncidentService] publishEscalationEvent error:', err);
    }
  }

  /**
   * Sends push notifications when incident is escalated.
   * - Incident escalated → push to new assigned body (MoE) + Bureau Staff
   */
  private async sendEscalationPushNotifications(incident: Incident): Promise<void> {
    try {
      const payload = {
        title: 'Incident Escalated',
        body: incident.description ?? 'An incident has been escalated',
        incidentId: incident.id,
        data: {
          priority: incident.priority,
          status: incident.status,
        },
      };

      // Push to MoE (new assigned body)
      if (incident.assignedOrgId) {
        await pushNotificationService.sendToOrg(incident.assignedOrgId, payload);
      }

      // Push to Bureau Staff
      const itdbOrg = await organizationRepository.findByName('ITDB');
      if (itdbOrg) {
        const bureauStaffUsers = await userRepository.findAll(itdbOrg.id, false);
        const bureauStaff = bureauStaffUsers.filter((u) => u.role === 'bureau_staff');
        if (bureauStaff.length > 0) {
          const bureauStaffIds = bureauStaff.map((u) => u.id);
          await pushNotificationService.sendToUsers(bureauStaffIds, payload);
        }
      }
    } catch (err) {
      console.error('[IncidentService] sendEscalationPushNotifications error:', err);
    }
  }
}

export const incidentService = new IncidentService();
export default IncidentService;
