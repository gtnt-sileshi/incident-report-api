import { z } from 'zod';
import { incidentRepository } from './incident.repository';
import { commentRepository } from './comment.repository';
import { auditLogRepository } from '../audit/audit-log.repository';
import { AppError } from '../middleware/errorHandler';
import { Incident, NewIncident } from '../db/schema';
import { JwtPayload } from '../auth/jwt.service';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const CreateIncidentSchema = z.object({
  regionId:          z.string().uuid().optional(),
  examCenterId:      z.string().uuid().optional(),
  examRoomId:        z.string().uuid().optional(),
  powerClusterId:    z.string().uuid().optional(),
  internetClusterId: z.string().uuid().optional(),
  incidentTypeId:    z.string().uuid(),
  priority:          z.enum(['Low', 'Medium', 'High', 'Critical']),
  description:       z.string().optional(),
  localId:           z.string().optional(),
  deviceId:          z.string().uuid().optional(),
  status:            z.string().optional(), // Allow setting status if from mobile (e.g. Draft)
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
  async createIncident(
    data: CreateIncidentData,
    requestingUser: JwtPayload,
  ): Promise<Incident> {
    const incidentData: NewIncident = {
      regionId:          data.regionId ?? requestingUser.regionId ?? null,
      examCenterId:      data.examCenterId ?? requestingUser.examCenterId ?? null,
      examRoomId:        data.examRoomId ?? requestingUser.examRoomId ?? null,
      incidentTypeId:    data.incidentTypeId,
      reportedByUserId:  requestingUser.sub,
      deviceId:          data.deviceId ?? null,
      priority:          data.priority,
      status:            data.status ?? 'Submitted',
      description:       data.description ?? null,
      assignedUserId:    null,
      localId:           data.localId ?? null,
    };

    const incident = await incidentRepository.create(incidentData);

    await auditLogRepository.append({
      incidentId:    incident.id,
      actorUserId:   requestingUser.sub,
      actorRole:     requestingUser.role,
      actionType:    'incident_created',
      fieldChanged:  'status',
      previousValue: null,
      newValue:      data.status ?? 'Submitted',
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
    });

    return comment;
  }

  async listIncidents(
    requestingUser: JwtPayload,
    filters?: import('./incident.repository').IncidentFilters,
  ): Promise<Incident[]> {
    if (requestingUser.role === 'super_admin' || requestingUser.role === 'national_command') {
      return incidentRepository.findAll(filters);
    }

    return incidentRepository.findAll({
      ...filters,
      regionId: requestingUser.regionId,
      examCenterId: requestingUser.examCenterId,
      examRoomId: requestingUser.examRoomId,
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
    });

    return updated;
  }
}

export const incidentService = new IncidentService();
export default IncidentService;
