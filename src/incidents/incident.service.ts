import { z } from 'zod';
import { incidentRepository } from './incident.repository';
import { commentRepository } from './comment.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { examPeriodRepository } from '../exam-periods/exam-period.repository';
import { locationRepository } from '../catalog/location.repository';
import { dispatchService } from '../routing/dispatch.service';
import { AppError } from '../middleware/errorHandler';
import { Incident, NewIncident } from '../db/schema';
import { JwtPayload } from '../auth/jwt.service';
import { withTransaction } from '../db';
import { getRedis } from '../db/redis';

// ─── Helper: publish a WebSocket event to the region's Redis channel ─────────

function publishEvent(regionId: string | null, event: string, data: unknown): void {
  const message = JSON.stringify({ event, data });
  const regionChannel = `region:${regionId ?? 'global'}`;

  // Always publish to the specific region channel
  getRedis().publish(regionChannel, message).catch((err: Error) => {
    console.error(`[IncidentService] Failed to publish ${event} to ${regionChannel}:`, err.message);
  });

  // Also publish to the global channel so super_admin / national_command dashboards get it
  if (regionId) {
    getRedis().publish('region:global', message).catch((err: Error) => {
      console.error(`[IncidentService] Failed to publish ${event} to region:global:`, err.message);
    });
  }
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const CreateIncidentSchema = z.object({
  regionId:                z.string().uuid().optional(),
  examCenterId:            z.string().uuid().optional(),
  examRoomId:              z.string().uuid().optional(),
  powerClusterId:          z.string().uuid().optional(),
  internetClusterId:       z.string().uuid().optional(),
  incidentTypeId:          z.string().uuid(),
  priority:                z.enum(['Low', 'Medium', 'High', 'Critical']),
  description:             z.string().optional(),
  localId:                 z.string().optional(),
  deviceId:                z.string().uuid().optional(),
  status:                  z.string().optional(),
  studentReference:        z.string().max(100).optional(),
  gpsLatitude:             z.number().optional(),
  gpsLongitude:            z.number().optional(),
  offlineSubmissionStatus: z.enum(['online', 'offline']).optional(),
});

export const UpdateStatusSchema = z.object({
  status:            z.enum([
    'Draft', 
    'Submitted', 
    'Dispatched', 
    'Acknowledged', 
    'In Progress', 
    'Pending External Support', 
    'Resolved', 
    'Resolution Rejected', 
    'Reopened', 
    'Escalated', 
    'Closed', 
    'Cancelled'
  ]),
  resolutionSummary: z.string().optional(),
});

export const AssignIncidentSchema = z.object({
  userId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  reason: z.string().optional(),
}).refine(data => data.userId || data.assignedUserId, {
  message: "Either userId or assignedUserId must be provided",
});

export const EscalateIncidentSchema = z.object({
  reason: z.string().optional(),
});

export const AddCommentSchema = z.object({
  body: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
}).refine(data => data.body || data.content, {
  message: "Either body or content must be provided",
});

export type CreateIncidentData  = z.infer<typeof CreateIncidentSchema>;
export type UpdateStatusData    = z.infer<typeof UpdateStatusSchema>;
export type AssignIncidentData  = z.infer<typeof AssignIncidentSchema>;
export type EscalateIncidentData = z.infer<typeof EscalateIncidentSchema>;

export const STATUS_ORDER: Record<string, number> = {
  'Draft':                    0,
  'Submitted':                1,
  'Dispatched':               2,
  'Acknowledged':             3,
  'In Progress':              4,
  'Pending External Support': 5,
  'Resolved':                 6,
  'Resolution Rejected':      7,
  'Reopened':                 8,
  'Escalated':                9,
  'Closed':                   10,
  'Cancelled':                11,
};

export class IncidentService {
  /**
   * Generates a unique tracking number in the format NEIMS-{YEAR}-{CODE}-{SEQUENCE}.
   * Uses an atomic upsert on tracking_number_sequences to guarantee uniqueness.
   */
  async generateTrackingNumber(regionId: string): Promise<string> {
    const region = await locationRepository.findRegionById(regionId);
    if (!region?.code) {
      throw new AppError(422, 'REGION_CODE_MISSING', 'Region has no code defined — tracking number cannot be generated');
    }

    const year = new Date().getUTCFullYear();
    const seq = await withTransaction(async (client) => {
      const result = await client.query<{ last_seq: number }>(
        `INSERT INTO tracking_number_sequences (region_id, year, last_seq)
         VALUES ($1, $2, 1)
         ON CONFLICT (region_id, year) DO UPDATE
           SET last_seq = tracking_number_sequences.last_seq + 1
         RETURNING last_seq`,
        [regionId, year],
      );
      return result.rows[0].last_seq;
    });

    const code   = region.code.toUpperCase().substring(0, 2);
    const padded = String(seq).padStart(6, '0');
    return `NEIMS-${year}-${code}-${padded}`;
  }

  async createIncident(
    data: CreateIncidentData,
    requestingUser: JwtPayload,
  ): Promise<Incident> {
    // Gate: require an active exam period
    const activePeriod = await examPeriodRepository.findActive();
    if (!activePeriod) {
      throw new AppError(403, 'NO_ACTIVE_EXAM_PERIOD', 'No active exam period — incident reporting is currently disabled');
    }

    const status = data.status ?? 'Submitted';
    const regionId = data.regionId ?? requestingUser.regionId ?? null;

    const incidentData: NewIncident = {
      regionId,
      examCenterId:            data.examCenterId ?? requestingUser.examCenterId ?? null,
      examRoomId:              data.examRoomId ?? requestingUser.examRoomId ?? null,
      incidentTypeId:          data.incidentTypeId,
      reportedByUserId:        requestingUser.sub,
      deviceId:                data.deviceId ?? null,
      priority:                data.priority,
      status,
      description:             data.description ?? null,
      assignedUserId:          null,
      localId:                 data.localId ?? null,
    };

    const incident = await incidentRepository.create(incidentData);

    // Generate tracking number for submitted (non-draft) incidents with a region
    if (status !== 'Draft' && regionId) {
      try {
        const trackingNumber = await this.generateTrackingNumber(regionId);
        await incidentRepository.updateTrackingNumber(incident.id, trackingNumber);
        (incident as any).trackingNumber = trackingNumber;
      } catch (err) {
        // Log but don't fail — tracking number is non-critical for incident creation
        console.error('[IncidentService] Failed to generate tracking number:', err);
      }
    }

    await auditLogRepository.append({
      incidentId:    incident.id,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'incident_created',
      fieldChanged:  'status',
      previousValue: null,
      newValue:      status,
      details: `Incident created with status "${status}" by ${requestingUser.email}`,
    });

    // Auto-dispatch if the incident is not a draft
    if (status !== 'Draft') {
      try {
        await dispatchService.dispatchIncident(incident);
      } catch (err) {
        // Log but don't fail — dispatch is best-effort
        console.error('[IncidentService] Auto-dispatch failed:', err);
      }
    }

    // Broadcast to dashboard and mobile clients in real time
    publishEvent(regionId, 'incident.created', {
      incidentId:     incident.id,
      trackingNumber: (incident as any).trackingNumber ?? null,
      status:         incident.status,
      priority:       incident.priority,
      regionId:       incident.regionId,
      examCenterId:   incident.examCenterId,
      reportedByUserId: incident.reportedByUserId,
    });

    return incident;
  }

  async updateStatus(
    incidentId:        string,
    newStatus:         string,
    requestingUser:    JwtPayload,
    resolutionSummary?: string,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    const currentOrder = STATUS_ORDER[incident.status] ?? 0;
    const newOrder     = STATUS_ORDER[newStatus] ?? 0;

    if (newOrder < currentOrder && requestingUser.role !== 'super_admin' && requestingUser.role !== 'national_command') {
      throw new AppError(
        400,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition from "${incident.status}" to "${newStatus}"`,
      );
    }

    if (newStatus === 'Resolved') {
      if (!resolutionSummary || resolutionSummary.trim().length < 10) {
        throw new AppError(
          400,
          'RESOLUTION_SUMMARY_REQUIRED',
          'A resolution summary of at least 10 characters is required when resolving an incident',
        );
      }
    }

    let updated: Incident | null;
    if (newStatus === 'Resolved' && resolutionSummary) {
      updated = await incidentRepository.resolve(incidentId, resolutionSummary);
    } else {
      updated = await incidentRepository.updateStatus(incidentId, newStatus);
    }

    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'status_changed',
      fieldChanged:  'status',
      previousValue: incident.status,
      newValue:      newStatus,
      details: `Status changed from "${incident.status}" to "${newStatus}" by ${requestingUser.email}`,
    });

    // Broadcast status change to dashboard and mobile clients in real time
    publishEvent(updated.regionId, 'incident.status_changed', {
      incidentId:       incidentId,
      newStatus,
      previousStatus:   incident.status,
      regionId:         updated.regionId,
      examCenterId:     updated.examCenterId,
      reportedByUserId: updated.reportedByUserId,
      resolvedAt:       newStatus === 'Resolved' ? updated.resolvedAt : null,
    });

    return updated;
  }

  async assignIncident(
    incidentId:     string,
    data:           { userId?: string; assignedUserId?: string; reason?: string },
    requestingUser: JwtPayload,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    const isReassignment = !!(incident.assignedUserId);
    if (isReassignment && !data.reason) {
      throw new AppError(
        400,
        'REASSIGNMENT_REASON_REQUIRED',
        'A reason is required when reassigning an incident',
      );
    }

    const previousUserId = incident.assignedUserId;

    const targetUserId = (data.assignedUserId || data.userId)!;

    const updated = await incidentRepository.updateAssignment(
      incidentId,
      targetUserId,
    );

    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    isReassignment ? 'incident_reassigned' : 'incident_assigned',
      fieldChanged:  'assigned_user_id',
      previousValue: previousUserId ?? null,
      newValue:      targetUserId,
      details: `${isReassignment ? 'Reassigned' : 'Assigned'} incident to user ID ${targetUserId} by ${requestingUser.email}${data.reason ? ` (Reason: ${data.reason})` : ''}`,
    });

    return updated;
  }

  async addComment(
    incidentId:     string,
    data:           { body?: string; content?: string },
    requestingUser: JwtPayload,
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
      body:       (data.body || data.content)!,
    });

    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'comment_added',
      fieldChanged:  null,
      previousValue: null,
      newValue:      comment.id,
      details: `New comment added by ${requestingUser.email}`,
    });

    return comment;
  }

  async listIncidents(
    requestingUser: JwtPayload,
    filters?: import('./incident.repository').IncidentFilters,
  ): Promise<{ data: import('./incident.repository').IncidentWithRelations[]; total: number }> {
    if (requestingUser.role === 'super_admin' || requestingUser.role === 'national_command') {
      return incidentRepository.findAll(filters);
    }

    return incidentRepository.findAll({
      ...filters,
      regionId: requestingUser.regionId ?? undefined,
      examCenterId: requestingUser.examCenterId ?? undefined,
      examRoomId: requestingUser.examRoomId ?? undefined,
    });
  }

  async getIncident(
    incidentId:     string,
    requestingUser: JwtPayload,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    if (requestingUser.role !== 'super_admin' && requestingUser.role !== 'national_command') {
      if (
        (requestingUser.regionId && incident.regionId !== requestingUser.regionId) ||
        (requestingUser.examCenterId && incident.examCenterId !== requestingUser.examCenterId) ||
        (requestingUser.examRoomId && incident.examRoomId !== requestingUser.examRoomId)
      ) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'You do not have access to this incident',
        );
      }
    }

    return incident;
  }

  async escalateIncident(
    incidentId:     string,
    requestingUser: JwtPayload,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    const updated = await incidentRepository.updateStatus(incidentId, 'Escalated');
    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'incident_escalated',
      fieldChanged:  'status',
      previousValue: incident.status,
      newValue:      'Escalated',
      details: `Incident escalated by ${requestingUser.email}`,
    });

    return updated;
  }

  async confirmResolution(
    incidentId:     string,
    requestingUser: JwtPayload,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }
    if (incident.status !== 'Resolved') {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION', `Cannot confirm resolution — incident is in "${incident.status}" status, not "Resolved"`);
    }

    const updated = await incidentRepository.updateStatus(incidentId, 'Closed');
    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'resolution_confirmed',
      fieldChanged:  'status',
      previousValue: 'Resolved',
      newValue:      'Closed',
      details: `Resolution confirmed and incident closed by ${requestingUser.email}`,
    });

    return updated;
  }

  async rejectResolution(
    incidentId:      string,
    rejectionReason: string,
    requestingUser:  JwtPayload,
  ): Promise<Incident> {
    const incident = await incidentRepository.findById(incidentId);
    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }
    if (incident.status !== 'Resolved') {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION', `Cannot reject resolution — incident is in "${incident.status}" status, not "Resolved"`);
    }
    if (!rejectionReason || rejectionReason.trim().length < 10 || rejectionReason.trim().length > 500) {
      throw new AppError(400, 'INVALID_REJECTION_REASON', 'rejectionReason must be between 10 and 500 characters');
    }

    // Transition: Resolved → Resolution Rejected
    await incidentRepository.updateStatus(incidentId, 'Resolution Rejected');
    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'resolution_rejected',
      fieldChanged:  'status',
      previousValue: 'Resolved',
      newValue:      'Resolution Rejected',
      details: `Resolution rejected by ${requestingUser.email}. Reason: ${rejectionReason}`,
    });

    // Transition: Resolution Rejected → Reopened + increment reopenCount
    const updated = await incidentRepository.reopenIncident(incidentId);
    if (!updated) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `Incident ${incidentId} not found`);
    }

    await auditLogRepository.append({
      incidentId:    incidentId,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'incident_reopened',
      fieldChanged:  'status',
      previousValue: 'Resolution Rejected',
      newValue:      'Reopened',
      details: `Incident reopened by system after resolution rejection`,
    });

    return updated;
  }
}

export const incidentService = new IncidentService();
export default IncidentService;
