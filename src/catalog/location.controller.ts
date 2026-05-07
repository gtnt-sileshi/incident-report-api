import { Request, Response, NextFunction } from 'express';
import { locationRepository } from './location.repository';

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
    res.status(201).json({ region });
  } catch (err) {
    next(err);
  }
}

export async function updateRegion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const region = await locationRepository.updateRegion(id, req.body);
    res.status(200).json({ region });
  } catch (err) {
    next(err);
  }
}

export async function deleteRegion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await locationRepository.deleteRegion(id);
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
    res.status(201).json({ zone });
  } catch (err) {
    next(err);
  }
}

export async function updateZone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const zone = await locationRepository.updateZone(id, req.body);
    res.status(200).json({ zone });
  } catch (err) {
    next(err);
  }
}

export async function deleteZone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await locationRepository.deleteZone(id);
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
    res.status(201).json({ woreda });
  } catch (err) {
    next(err);
  }
}

export async function updateWoreda(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const woreda = await locationRepository.updateWoreda(id, req.body);
    res.status(200).json({ woreda });
  } catch (err) {
    next(err);
  }
}

export async function deleteWoreda(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await locationRepository.deleteWoreda(id);
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
    res.status(201).json({ center });
  } catch (err) {
    next(err);
  }
}

export async function updateExamCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const center = await locationRepository.updateExamCenter(id, req.body);
    res.status(200).json({ center });
  } catch (err) {
    next(err);
  }
}

export async function deleteExamCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await locationRepository.deleteExamCenter(id);
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

export async function listInternetClusters(_req: Request, res: Response, next: NextFunction) {
  try {
    const clusters = await locationRepository.listInternetClusters();
    res.status(200).json({ clusters });
  } catch (err) {
    next(err);
  }
}

export async function listExamRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const { examCenterId } = req.query;
    if (!examCenterId) {
      res.status(200).json({ rooms: [] });
      return;
    }
    const rooms = await locationRepository.listRooms(examCenterId as string);
    res.status(200).json({ rooms });
  } catch (err) {
    next(err);
  }
}
