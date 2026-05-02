import { Request, Response, NextFunction } from 'express';
import { auditLogRepository, AuditLogFilters } from './audit-log.repository';

/**
 * GET /api/audit-log
 *
 * Returns a paginated, filtered list of audit log entries.
 *
 * Accepted query parameters:
 *   userId      — filter by actor user ID
 *   deviceId    — filter by device ID
 *   orgId       — filter by actor org ID
 *   examFieldId — (informational; stored in newValue for field-related actions)
 *   dateFrom    — ISO 8601 date string (inclusive lower bound on occurred_at)
 *   dateTo      — ISO 8601 date string (inclusive upper bound on occurred_at)
 *   actionType  — filter by action type string
 *   limit       — max entries to return (default 100)
 *   offset      — pagination offset (default 0)
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
    } = req.query as Record<string, string | undefined>;

    const filters: AuditLogFilters = {};

    if (userId)     filters.actorUserId = userId;
    if (deviceId)   filters.deviceId    = deviceId;
    if (orgId)      filters.actorOrgId  = orgId;
    if (actionType) filters.actionType  = actionType;
    if (dateFrom)   filters.fromDate    = new Date(dateFrom);
    if (dateTo)     filters.toDate      = new Date(dateTo);

    const limit  = limitStr  ? parseInt(limitStr,  10) : 100;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const entries = await auditLogRepository.search(filters, limit, offset);

    res.json({ data: entries, limit, offset });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-log/incident/:incidentId
 *
 * Returns all audit log entries for a specific incident, ordered by
 * occurred_at ascending (chronological timeline).
 */
export async function getIncidentAuditLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { incidentId } = req.params;

    const entries = await auditLogRepository.findByIncident(incidentId);

    res.json({ data: entries });
  } catch (err) {
    next(err);
  }
}
