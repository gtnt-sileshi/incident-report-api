import { Request, Response, NextFunction } from 'express';
import { incidentService } from './incident.service';
import {
  CreateIncidentSchema,
  UpdateStatusSchema,
  AssignIncidentSchema,
  AddCommentSchema,
  EscalateIncidentSchema,
} from './incident.service';
import { attachmentService } from './attachment.service';
import { commentRepository } from './comment.repository';
import { attachmentRepository } from './attachment.repository';
import { auditLogRepository } from '../audit/audit-log.repository';

/**
 * GET /api/incidents
 * Lists incidents, scoped by role.
 * Requirements: 1.3, 8.1, 9.1
 */
export async function listIncidents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const filters = {
      status:          req.query.status as string | undefined,
      priority:        req.query.priority as string | undefined,
      examFieldId:     req.query.examFieldId as string | undefined,
      incidentTypeId:  req.query.incidentTypeId as string | undefined,
      assignedOrgId:   req.query.assignedOrgId as string | undefined,
      assignedUserId:  req.query.assignedUserId as string | undefined,
    };

    const incidents = await incidentService.listIncidents(
      { sub: user.sub, role: user.role, orgId: user.orgId },
      filters,
    );

    res.json({ data: incidents });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/incidents
 * Creates a new incident.
 * Requirements: 6.1, 17.2, 17.4
 */
export async function createIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const data = CreateIncidentSchema.parse(req.body);

    const incident = await incidentService.createIncident(data, {
      sub:   user.sub,
      role:  user.role,
      orgId: user.orgId,
    });

    res.status(201).json({ data: incident });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/incidents/:id
 * Gets a single incident by ID, including comments, attachments, and audit log.
 * Requirements: 1.3, 9.1
 */
export async function getIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;

    const incident = await incidentService.getIncident(id, {
      sub:   user.sub,
      role:  user.role,
      orgId: user.orgId,
    });

    // Fetch related data in parallel
    const [comments, attachments, auditEntries] = await Promise.all([
      commentRepository.findByIncident(id),
      attachmentRepository.findByIncident(id),
      auditLogRepository.findByIncident(id),
    ]);

    // Enrich comments with author names
    const { userRepository } = await import('../users/user.repository');
    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const authorMap = new Map<string, string>();
    await Promise.all(
      authorIds.map(async (authorId) => {
        const author = await userRepository.findById(authorId);
        if (author) authorMap.set(authorId, author.name);
      }),
    );
    const enrichedComments = comments.map((c) => ({
      ...c,
      authorName: authorMap.get(c.authorId) ?? null,
    }));

    // Enrich audit entries with actor names
    const actorIds = [...new Set(auditEntries.map((e) => e.actorUserId))];
    const actorMap = new Map<string, string>();
    await Promise.all(
      actorIds.map(async (actorId) => {
        const actor = await userRepository.findById(actorId);
        if (actor) actorMap.set(actorId, actor.name);
      }),
    );
    const enrichedAudit = auditEntries.map((e) => ({
      ...e,
      actorName: actorMap.get(e.actorUserId) ?? null,
    }));

    res.json({
      data: {
        ...incident,
        comments: enrichedComments,
        attachments,
        auditLog: enrichedAudit,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/incidents/:id/status
 * Updates the status of an incident.
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6
 */
export async function updateStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { status, resolutionSummary } = UpdateStatusSchema.parse(req.body);

    const incident = await incidentService.updateStatus(
      id,
      status,
      { sub: user.sub, role: user.role, orgId: user.orgId },
      resolutionSummary,
    );

    res.json({ data: incident });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/incidents/:id/assign
 * Assigns or reassigns an incident.
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */
export async function assignIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = AssignIncidentSchema.parse(req.body);

    const incident = await incidentService.assignIncident(
      id,
      data,
      { sub: user.sub, role: user.role, orgId: user.orgId },
    );

    res.json({ data: incident });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/incidents/:id/comments
 * Adds a comment to an incident.
 * Requirements: 8.5
 */
export async function addComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { content } = AddCommentSchema.parse(req.body);

    const comment = await incidentService.addComment(
      id,
      content,
      { sub: user.sub, role: user.role, orgId: user.orgId },
    );

    res.status(201).json({ data: comment });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/incidents/:id/escalate
 * Escalates an incident to a specified organization.
 * Requirements: 7.7, 7.8, 7.9
 */
export async function escalateIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { orgId } = EscalateIncidentSchema.parse(req.body);

    const incident = await incidentService.escalateIncident(
      id,
      orgId,
      { sub: user.sub, role: user.role, orgId: user.orgId },
    );

    res.json({ data: incident });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/incidents/:id/sms-alert
 * Stub for triggering an SMS alert for an incident.
 * Full implementation in task 14.
 * Requirements: 12.6
 */
export async function triggerSmsAlert(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    // Stub: SMS service will be implemented in task 14
    res.json({
      data: {
        incidentId: id,
        message:    'SMS alert queued (stub — SMS service not yet implemented)',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/incidents/:id/attachments
 * Upload attachments to an incident.
 * Requirements: 5.3, 8.4, 8.5
 */
export async function uploadAttachments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;

    // Multer attaches files to req.files
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        error: {
          code: 'NO_FILES_UPLOADED',
          message: 'No files were uploaded',
        },
      });
      return;
    }

    // Map multer files to the format expected by the service
    const fileInfos = files.map((file) => ({
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    }));

    const attachments = await attachmentService.createAttachments(
      id,
      fileInfos,
      { sub: user.sub, role: user.role, orgId: user.orgId },
    );

    res.status(201).json({ data: attachments });
  } catch (err) {
    next(err);
  }
}
