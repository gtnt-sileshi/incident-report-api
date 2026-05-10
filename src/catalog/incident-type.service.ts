import { incidentTypeRepository } from './incident-type.repository';
import { AppError } from '../middleware/errorHandler';
import { IncidentType, NewIncidentType, IssueCategory } from '../db/schema';
import { auditLogRepository } from '../audit/audit-log.repository';
import { JwtPayload } from '../auth/jwt.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncidentTypeWithCount extends IncidentType {
  incidentCount: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class IncidentTypeService {
  /**
   * Creates a new incident type.
   * Requirements: 19.2, 19.3
   */
  async createIncidentType(
    data: Pick<NewIncidentType, 'name' | 'categoryId' | 'defaultPriority' | 'description'>,
    requestingUser?: JwtPayload,
  ): Promise<IncidentType> {
    // Check for name uniqueness
    const existing = await incidentTypeRepository.findByName(data.name);
    if (existing) {
      throw new AppError(
        409,
        'INCIDENT_TYPE_NAME_CONFLICT',
        `Incident type with name "${data.name}" already exists`,
      );
    }

    const type = await incidentTypeRepository.create({
      name: data.name,
      categoryId: data.categoryId,
      defaultPriority: data.defaultPriority,
      description: data.description ?? null,
    });

    // Audit
    await auditLogRepository.append({
      actorUserId: requestingUser?.sub ?? 'SYSTEM',
      actorRole: requestingUser?.role ?? 'CATALOG_ADMIN',
      actionType: 'INCIDENT_TYPE_CREATED',
      newValue: JSON.stringify(type),
      details: `New incident type "${type.name}" created by ${requestingUser?.email ?? 'System'}`,
    });

    return type;
  }

  /**
   * Updates an existing incident type's fields.
   * Allows toggling active/inactive status.
   * Requirements: 19.3, 19.4
   */
  async updateIncidentType(
    id: string,
    data: Partial<Pick<NewIncidentType, 'name' | 'defaultPriority' | 'description' | 'isActive'>>,
    requestingUser?: JwtPayload,
  ): Promise<IncidentType> {
    // If renaming, check uniqueness
    if (data.name) {
      const existing = await incidentTypeRepository.findByName(data.name);
      if (existing && existing.id !== id) {
        throw new AppError(
          409,
          'INCIDENT_TYPE_NAME_CONFLICT',
          `Incident type with name "${data.name}" already exists`,
        );
      }
    }

    const existing = await incidentTypeRepository.findById(id);
    const updated = await incidentTypeRepository.update(id, data);
    if (!updated) {
      throw new AppError(404, 'INCIDENT_TYPE_NOT_FOUND', `Incident type ${id} not found`);
    }

    // Audit
    await auditLogRepository.append({
      actorUserId: requestingUser?.sub ?? 'SYSTEM',
      actorRole: requestingUser?.role ?? 'CATALOG_ADMIN',
      actionType: 'INCIDENT_TYPE_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updated),
      details: `Incident type "${updated.name}" updated by ${requestingUser?.email ?? 'System'}`,
    });

    return updated;
  }

  /**
   * Soft-deletes an incident type by setting is_active = false.
   * Rejects deletion if the type is referenced by routing rules OR historical incidents.
   * Requirements: 19.7, 19.8
   */
  async softDeleteIncidentType(id: string, requestingUser?: JwtPayload): Promise<IncidentType> {
    const incidentType = await incidentTypeRepository.findById(id);
    if (!incidentType) {
      throw new AppError(404, 'INCIDENT_TYPE_NOT_FOUND', `Incident type ${id} not found`);
    }

    // Check referential integrity: routing rules and historical incidents
    const refs = await incidentTypeRepository.countReferences(id);

    if (refs.incidents > 0) {
      throw new AppError(
        409,
        'INCIDENT_TYPE_HAS_REFERENCES',
        `Cannot delete incident type "${incidentType.name}" because it is referenced by existing records`,
        {
          incidentCount: refs.incidents,
        },
      );
    }

    // No references — safe to soft-delete (set is_active = false)
    const deactivated = await incidentTypeRepository.setActive(id, false);
    if (!deactivated) {
      throw new AppError(404, 'INCIDENT_TYPE_NOT_FOUND', `Incident type ${id} not found`);
    }

    // Audit
    await auditLogRepository.append({
      actorUserId: requestingUser?.sub ?? 'SYSTEM',
      actorRole: requestingUser?.role ?? 'CATALOG_ADMIN',
      actionType: 'INCIDENT_TYPE_DEACTIVATED',
      previousValue: JSON.stringify(incidentType),
      newValue: JSON.stringify(deactivated),
      details: `Incident type "${incidentType.name}" deactivated by ${requestingUser?.email ?? 'System'}`,
    });

    return deactivated;
  }

  /**
   * Lists incident types with their incident counts.
   * Requirements: 19.5, 19.6
   *
   * @param includeInactive - if true, returns all types; if false (default), returns only active types
   */
  async listIncidentTypes(includeInactive = false): Promise<IncidentTypeWithCount[]> {
    const types = await incidentTypeRepository.findAll(includeInactive);

    // Attach incident counts
    const typesWithCounts = await Promise.all(
      types.map(async (type) => {
        const refs = await incidentTypeRepository.countReferences(type.id);
        return {
          ...type,
          incidentCount: refs.incidents,
        };
      }),
    );

    return typesWithCounts;
  }

  /**
   * Fetches a single incident type by ID.
   * Requirements: 19.2
   */
  async getIncidentType(id: string): Promise<IncidentType> {
    const type = await incidentTypeRepository.findById(id);
    if (!type) {
      throw new AppError(404, 'INCIDENT_TYPE_NOT_FOUND', `Incident type ${id} not found`);
    }
    return type;
  }

  /**
   * Lists all issue categories.
   */
  async listCategories(): Promise<IssueCategory[]> {
    return incidentTypeRepository.listCategories();
  }
}

export const incidentTypeService = new IncidentTypeService();
export default IncidentTypeService;
