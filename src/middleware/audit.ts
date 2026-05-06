import { Request, Response, NextFunction } from 'express';
import { auditLogRepository } from '../audit/audit-log.repository';

/**
 * Audit middleware factory.
 *
 * Returns an Express middleware that, after a successful response (2xx status),
 * appends an audit log entry using AuditLogRepository.append.
 *
 * This is a supplementary audit mechanism — the primary audit writes happen in
 * the service layer (task 11). This middleware provides a safety net for routes
 * that don't go through the service layer.
 *
 * @param actionType - The action type string to record in the audit log
 *                     (e.g. 'incident_viewed', 'audit_log_queried')
 *
 * @example
 * router.get('/:id', authenticate, requirePermission('incidents.view'),
 *   auditMiddleware('incident_viewed'), handler);
 */
export function auditMiddleware(actionType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      // Only log successful responses (2xx)
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return;
      }

      // Require authenticated user
      if (!req.user) {
        return;
      }

      const { sub: actorUserId, role: actorRole } = req.user;

      // Extract the primary resource ID from route params (e.g. :id, :incidentId)
      const resourceId =
        req.params.id ??
        req.params.incidentId ??
        req.params.userId ??
        null;

      // Fire-and-forget — do not block the response
      auditLogRepository
        .append({
          actorUserId,
          actorRole,
          actionType,
          incidentId: resourceId ?? undefined,
          fieldChanged: null,
          previousValue: null,
          newValue: null,
        })
        .catch((err: unknown) => {
          // Log but never throw — audit failures must not affect the primary response
          console.error('[auditMiddleware] Failed to write audit entry:', err);
        });
    });

    next();
  };
}
