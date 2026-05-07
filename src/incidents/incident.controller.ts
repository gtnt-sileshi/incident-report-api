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

export async function listIncidents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const filters = {
      status:            req.query.status as string | undefined,
      priority:          req.query.priority as string | undefined,
      regionId:          req.query.regionId as string | undefined,
      examCenterId:      req.query.examCenterId as string | undefined,
      examRoomId:        req.query.examRoomId as string | undefined,
      powerClusterId:    req.query.powerClusterId as string | undefined,
      internetClusterId: req.query.internetClusterId as string | undefined,
      incidentTypeId:    req.query.incidentTypeId as string | undefined,
      assignedUserId:    req.query.assignedUserId as string | undefined,
    };

    const incidents = await incidentService.listIncidents(user, filters);

    res.json({ data: incidents });
  } catch (err) {
    next(err);
  }
}

export async function createIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const data = CreateIncidentSchema.parse(req.body);

    const incident = await incidentService.createIncident(data, user);

    res.status(201).json({ data: incident });
  } catch (err) {
    next(err);
  }
}

export async function getIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;

    const incident = await incidentService.getIncident(id, user);

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
      user,
      resolutionSummary,
    );

    res.json({ data: incident });
  } catch (err) {
    next(err);
  }
}

export async function assignIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = AssignIncidentSchema.parse(req.body);

    const incident = await incidentService.assignIncident(id, data, user);

    res.json({ data: incident });
  } catch (err) {
    next(err);
  }
}

export async function addComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const data = AddCommentSchema.parse(req.body);

    const comment = await incidentService.addComment(id, data, user);

    res.status(201).json({ data: comment });
  } catch (err) {
    next(err);
  }
}

export async function escalateIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    EscalateIncidentSchema.parse(req.body);

    const incident = await incidentService.escalateIncident(id, user);

    res.json({ data: incident });
  } catch (err) {
    next(err);
  }
}

export async function triggerSmsAlert(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

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

export async function uploadAttachments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;

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

    const fileInfos = files.map((file) => ({
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    }));

    const attachments = await attachmentService.createAttachments(
      id,
      fileInfos,
      user,
    );

    res.status(201).json({ data: attachments });
  } catch (err) {
    next(err);
  }
}
