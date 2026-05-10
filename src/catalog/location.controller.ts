import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { locationRepository } from './location.repository';
import { AppError } from '../middleware/errorHandler';
import { auditLogRepository } from '../audit/audit-log.repository';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createClusterSchema = z.object({
  name:          z.string().min(1).max(255),
  code:          z.string().min(1).max(50),
  contactPerson: z.string().max(255).optional(),
  contactPhone:  z.string().max(50).optional(),
});

const updateClusterSchema = z.object({
  name:          z.string().min(1).max(255).optional(),
  code:          z.string().min(1).max(50).optional(),
  contactPerson: z.string().max(255).optional(),
  contactPhone:  z.string().max(50).optional(),
});

const createExamRoomSchema = z.object({
  examCenterId: z.string().uuid(),
  name:         z.string().min(1).max(255),
  capacity:     z.coerce.number().int().positive().optional(),
  isActive:     z.boolean().optional(),
});

const updateExamRoomSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  capacity: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

// Regions
export async function listRegions(_req: Request, res: Response, next: NextFunction) {
  try {
    const regions = await locationRepository.listRegions();
    res.status(200).json({ regions });
  } catch (err) {
    next(err);
  }
}

export async function createRegion(req: Request, res: Response, next: NextFunction) {
  try {
    const region = await locationRepository.createRegion(req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'REGION_CREATED',
      newValue: JSON.stringify(region),
      details: `New region "${region.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ region });
  } catch (err) {
    next(err);
  }
}

export async function updateRegion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findRegionById(id);
    const region = await locationRepository.updateRegion(id, req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'REGION_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(region),
      details: `Region "${region.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ region });
  } catch (err) {
    next(err);
  }
}

export async function deleteRegion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findRegionById(id);
    const childCount = await locationRepository.countZonesByRegion(id);
    if (childCount > 0) {
      throw new AppError(409, 'REGION_HAS_CHILDREN', 'Region cannot be deleted — it has zones');
    }
    await locationRepository.deleteRegion(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'REGION_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Region "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Zones
export async function listZones(req: Request, res: Response, next: NextFunction) {
  try {
    const { regionId } = req.query;
    const zones = await locationRepository.listZones(regionId as string);
    res.status(200).json({ zones });
  } catch (err) {
    next(err);
  }
}

export async function createZone(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await locationRepository.createZone(req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'ZONE_CREATED',
      newValue: JSON.stringify(zone),
      details: `New zone "${zone.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ zone });
  } catch (err) {
    next(err);
  }
}

export async function updateZone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findZoneById(id);
    const zone = await locationRepository.updateZone(id, req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'ZONE_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(zone),
      details: `Zone "${zone.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ zone });
  } catch (err) {
    next(err);
  }
}

export async function deleteZone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findZoneById(id);
    const childCount = await locationRepository.countWoredasByZone(id);
    if (childCount > 0) {
      throw new AppError(409, 'ZONE_HAS_CHILDREN', 'Zone cannot be deleted — it has woredas');
    }
    await locationRepository.deleteZone(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'ZONE_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Zone "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Woredas
export async function listWoredas(req: Request, res: Response, next: NextFunction) {
  try {
    const { zoneId } = req.query;
    const woredas = await locationRepository.listWoredas(zoneId as string);
    res.status(200).json({ woredas });
  } catch (err) {
    next(err);
  }
}

export async function createWoreda(req: Request, res: Response, next: NextFunction) {
  try {
    const woreda = await locationRepository.createWoreda(req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'WOREDA_CREATED',
      newValue: JSON.stringify(woreda),
      details: `New woreda "${woreda.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ woreda });
  } catch (err) {
    next(err);
  }
}

export async function updateWoreda(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findWoredaById(id);
    const woreda = await locationRepository.updateWoreda(id, req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'WOREDA_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(woreda),
      details: `Woreda "${woreda.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ woreda });
  } catch (err) {
    next(err);
  }
}

export async function deleteWoreda(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findWoredaById(id);
    const childCount = await locationRepository.countExamCentersByWoreda(id);
    if (childCount > 0) {
      throw new AppError(409, 'WOREDA_HAS_CHILDREN', 'Woreda cannot be deleted — it has exam centers');
    }
    await locationRepository.deleteWoreda(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'WOREDA_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Woreda "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Exam Centers
export async function listExamCenters(req: Request, res: Response, next: NextFunction) {
  try {
    const { regionId } = req.query;
    const centers = await locationRepository.listExamCenters(regionId as string);
    res.status(200).json({ centers });
  } catch (err) {
    next(err);
  }
}

export async function createExamCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const center = await locationRepository.createExamCenter(req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_CENTER_CREATED',
      newValue: JSON.stringify(center),
      details: `New exam center "${center.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ center });
  } catch (err) {
    next(err);
  }
}

export async function updateExamCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findExamCenterById(id);
    const center = await locationRepository.updateExamCenter(id, req.body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_CENTER_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(center),
      details: `Exam center "${center.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ center });
  } catch (err) {
    next(err);
  }
}

export async function deleteExamCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findExamCenterById(id);
    const childCount = await locationRepository.countExamRoomsByCenter(id);
    if (childCount > 0) {
      throw new AppError(409, 'CENTER_HAS_CHILDREN', 'Exam center cannot be deleted — it has exam rooms');
    }
    await locationRepository.deleteExamCenter(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_CENTER_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Exam center "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Clusters
export async function listPowerClusters(_req: Request, res: Response, next: NextFunction) {
  try {
    const clusters = await locationRepository.listPowerClusters();
    res.status(200).json({ clusters });
  } catch (err) {
    next(err);
  }
}

export async function createPowerCluster(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createClusterSchema.parse(req.body);
    const cluster = await locationRepository.createPowerCluster(body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'POWER_CLUSTER_CREATED',
      newValue: JSON.stringify(cluster),
      details: `New power cluster "${cluster.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ cluster });
  } catch (err) {
    next(err);
  }
}

export async function updatePowerCluster(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findPowerClusterById(id);
    const body = updateClusterSchema.parse(req.body);
    const cluster = await locationRepository.updatePowerCluster(id, body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'POWER_CLUSTER_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(cluster),
      details: `Power cluster "${cluster.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ cluster });
  } catch (err) {
    next(err);
  }
}

export async function deletePowerCluster(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findPowerClusterById(id);
    const centers = await locationRepository.findExamCentersByPowerCluster(id);
    if (centers.length > 0) {
      const names = centers.map((c) => c.name).join(', ');
      throw new AppError(409, 'CLUSTER_IN_USE', `Cluster is assigned to exam centers: ${names}`);
    }
    await locationRepository.deletePowerCluster(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'POWER_CLUSTER_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Power cluster "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listInternetClusters(_req: Request, res: Response, next: NextFunction) {
  try {
    const clusters = await locationRepository.listInternetClusters();
    res.status(200).json({ clusters });
  } catch (err) {
    next(err);
  }
}

export async function createInternetCluster(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createClusterSchema.parse(req.body);
    const cluster = await locationRepository.createInternetCluster(body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'INTERNET_CLUSTER_CREATED',
      newValue: JSON.stringify(cluster),
      details: `New internet cluster "${cluster.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ cluster });
  } catch (err) {
    next(err);
  }
}

export async function updateInternetCluster(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findInternetClusterById(id);
    const body = updateClusterSchema.parse(req.body);
    const cluster = await locationRepository.updateInternetCluster(id, body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'INTERNET_CLUSTER_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(cluster),
      details: `Internet cluster "${cluster.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ cluster });
  } catch (err) {
    next(err);
  }
}

export async function deleteInternetCluster(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findInternetClusterById(id);
    const centers = await locationRepository.findExamCentersByInternetCluster(id);
    if (centers.length > 0) {
      const names = centers.map((c) => c.name).join(', ');
      throw new AppError(409, 'CLUSTER_IN_USE', `Cluster is assigned to exam centers: ${names}`);
    }
    await locationRepository.deleteInternetCluster(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'INTERNET_CLUSTER_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Internet cluster "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listExamRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const { examCenterId } = req.query;
    if (!examCenterId) {
      throw new AppError(400, 'MISSING_EXAM_CENTER_ID', 'examCenterId query parameter is required');
    }
    const rooms = await locationRepository.listRooms(examCenterId as string);
    res.status(200).json({ rooms });
  } catch (err) {
    next(err);
  }
}

export async function createExamRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createExamRoomSchema.parse(req.body);
    const room = await locationRepository.createExamRoom(body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_ROOM_CREATED',
      newValue: JSON.stringify(room),
      details: `New exam room "${room.name}" created by ${req.user!.email}`,
    });

    res.status(201).json({ room });
  } catch (err) {
    next(err);
  }
}

export async function updateExamRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findExamRoomById(id);
    const body = updateExamRoomSchema.parse(req.body);
    const room = await locationRepository.updateExamRoom(id, body);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_ROOM_UPDATED',
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(room),
      details: `Exam room "${room.name}" modified by ${req.user!.email}`,
    });

    res.status(200).json({ room });
  } catch (err) {
    next(err);
  }
}

export async function deleteExamRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await locationRepository.findExamRoomById(id);
    await locationRepository.deleteExamRoom(id);

    // Audit
    await auditLogRepository.append({
      actorUserId: req.user!.sub,
      actorRole: req.user!.role,
      actionType: 'EXAM_ROOM_DELETED',
      previousValue: JSON.stringify(existing),
      details: `Exam room "${existing?.name}" deleted by ${req.user!.email}`,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Hierarchy
export async function listHierarchy(_req: Request, res: Response, next: NextFunction) {
  try {
    const regions = await locationRepository.getHierarchy();
    res.status(200).json({ regions });
  } catch (err) {
    next(err);
  }
}
