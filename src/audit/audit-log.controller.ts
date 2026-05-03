import { Request, Response, NextFunction } from 'express';
import { auditLogRepository, AuditLogFilters } from './audit-log.repository';
import { userRepository } from '../users/user.repository';
import { AuditLogEntry } from '../db/schema';

// Cache user names to avoid N+1 on large audit log pages
async function enrichWithActorNames(entries: AuditLogEntry[]) {
  const userIds = [...new Set(entries.map((e) => e.actorUserId))];
  const userMap = new Map<string, string>();

  await Promise.all(
    userIds.map(async (id) => {
      const user = await userRepository.findById(id);
      if (user) userMap.set(id, user.name);
    }),
  );

  return entries.map((e) => ({
    ...e,
    actorName: userMap.get(e.actorUserId) ?? null,
  }));
}

/**
 * GET /api/audit-log
 * Returns a paginated, filtered list of audit log entries with actor names.
 */
export async function listAuditLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      userId,
      deviceId,
      orgId,
      actionType,
      dateFrom,
      dateTo,
      limit: limitStr,
      offset: offsetStr,
      page: pageStr,
    } = req.query as Record<string, string | undefined>;

    const filters: AuditLogFilters = {};
    if (userId)     filters.actorUserId = userId;
    if (deviceId)   filters.deviceId    = deviceId;
    if (orgId)      filters.actorOrgId  = orgId;
    if (actionType) filters.actionType  = actionType;
    if (dateFrom)   filters.fromDate    = new Date(dateFrom);
    if (dateTo)     filters.toDate      = new Date(dateTo);

    const limit  = limitStr  ? parseInt(limitStr,  10) : 25;
    const page   = pageStr   ? parseInt(pageStr,   10) : 1;
    const offset = offsetStr ? parseInt(offsetStr, 10) : (page - 1) * limit;

    const [entries, total] = await Promise.all([
      auditLogRepository.search(filters, limit, offset),
      auditLogRepository.count(filters),
    ]);

    const enriched = await enrichWithActorNames(entries);

    res.json({ data: enriched, total, page, limit });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-log/incident/:incidentId
 * Returns all audit log entries for a specific incident with actor names.
 */
export async function getIncidentAuditLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { incidentId } = req.params;
    const entries = await auditLogRepository.findByIncident(incidentId);
    const enriched = await enrichWithActorNames(entries);
    res.json({ data: enriched });
  } catch (err) {
    next(err);
  }
}
