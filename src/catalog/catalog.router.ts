import { Router } from 'express';
import {
  listIncidentTypes,
  createIncidentType,
  updateIncidentType,
  deleteIncidentType,
} from './incident-type.controller';
import {
  listRegions,
  createRegion,
  listExamCenters,
  listPowerClusters,
  listInternetClusters,
} from './location.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * ─── Incident Types ──────────────────────────────────────────────────────────
 */
router.get(
  '/incident-types',
  authenticate,
  requirePermission('catalog.view'),
  listIncidentTypes,
);

router.post(
  '/incident-types',
  authenticate,
  requirePermission('catalog.create'),
  createIncidentType,
);

router.patch(
  '/incident-types/:id',
  authenticate,
  requirePermission('catalog.edit'),
  updateIncidentType,
);

router.delete(
  '/incident-types/:id',
  authenticate,
  requirePermission('catalog.delete'),
  deleteIncidentType,
);

/**
 * ─── Location Hierarchy ──────────────────────────────────────────────────────
 */
router.get('/regions', authenticate, requirePermission('catalog.view'), listRegions);
router.post('/regions', authenticate, requirePermission('catalog.create'), createRegion);
router.get('/exam-centers', authenticate, requirePermission('catalog.view'), listExamCenters);
router.get('/power-clusters', authenticate, requirePermission('catalog.view'), listPowerClusters);
router.get('/internet-clusters', authenticate, requirePermission('catalog.view'), listInternetClusters);

export default router;
