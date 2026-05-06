import { Request, Response, NextFunction } from 'express';
import { locationRepository } from './location.repository';

export async function listRegions(req: Request, res: Response, next: NextFunction) {
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

export async function listExamCenters(req: Request, res: Response, next: NextFunction) {
  try {
    const { regionId } = req.query;
    const centers = await locationRepository.listExamCenters(regionId as string);
    res.status(200).json({ centers });
  } catch (err) {
    next(err);
  }
}

export async function listPowerClusters(req: Request, res: Response, next: NextFunction) {
  try {
    const clusters = await locationRepository.listPowerClusters();
    res.status(200).json({ clusters });
  } catch (err) {
    next(err);
  }
}

export async function listInternetClusters(req: Request, res: Response, next: NextFunction) {
  try {
    const clusters = await locationRepository.listInternetClusters();
    res.status(200).json({ clusters });
  } catch (err) {
    next(err);
  }
}
