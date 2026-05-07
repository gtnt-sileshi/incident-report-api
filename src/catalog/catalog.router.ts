import { Router } from 'express';
import {
  listIncidentTypes,
  createIncidentType,
  updateIncidentType,
  deleteIncidentType,
  listCategories,
} from './incident-type.controller';
import {
  listRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  listZones,
  createZone,
  updateZone,
  deleteZone,
  listWoredas,
  createWoreda,
  updateWoreda,
  deleteWoreda,
  listExamCenters,
  createExamCenter,
  updateExamCenter,
  deleteExamCenter,
  listPowerClusters,
  listInternetClusters,
  listExamRooms,
} from './location.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

/**
 * ─── Incident Types ──────────────────────────────────────────────────────────
 */
router.get('/incident-types', authenticate, requirePermission('catalog.view'), listIncidentTypes);
router.post('/incident-types', authenticate, requirePermission('catalog.create'), createIncidentType);
router.patch('/incident-types/:id', authenticate, requirePermission('catalog.edit'), updateIncidentType);
router.delete('/incident-types/:id', authenticate, requirePermission('catalog.delete'), deleteIncidentType);
router.get('/categories', authenticate, requirePermission('catalog.view'), listCategories);

/**
 * ─── Location Hierarchy ──────────────────────────────────────────────────────
 */
// Regions
router.get('/regions', authenticate, requirePermission('catalog.view'), listRegions);
router.post('/regions', authenticate, requirePermission('catalog.create'), createRegion);
router.patch('/regions/:id', authenticate, requirePermission('catalog.edit'), updateRegion);
router.delete('/regions/:id', authenticate, requirePermission('catalog.delete'), deleteRegion);

// Zones
router.get('/zones', authenticate, requirePermission('catalog.view'), listZones);
router.post('/zones', authenticate, requirePermission('catalog.create'), createZone);
router.patch('/zones/:id', authenticate, requirePermission('catalog.edit'), updateZone);
router.delete('/zones/:id', authenticate, requirePermission('catalog.delete'), deleteZone);

// Woredas
router.get('/woredas', authenticate, requirePermission('catalog.view'), listWoredas);
router.post('/woredas', authenticate, requirePermission('catalog.create'), createWoreda);
router.patch('/woredas/:id', authenticate, requirePermission('catalog.edit'), updateWoreda);
router.delete('/woredas/:id', authenticate, requirePermission('catalog.delete'), deleteWoreda);

// Exam Centers
router.get('/exam-centers', authenticate, requirePermission('catalog.view'), listExamCenters);
router.post('/exam-centers', authenticate, requirePermission('catalog.create'), createExamCenter);
router.patch('/exam-centers/:id', authenticate, requirePermission('catalog.edit'), updateExamCenter);
router.delete('/exam-centers/:id', authenticate, requirePermission('catalog.delete'), deleteExamCenter);

// Clusters
router.get('/power-clusters', authenticate, requirePermission('catalog.view'), listPowerClusters);
router.get('/internet-clusters', authenticate, requirePermission('catalog.view'), listInternetClusters);
router.get('/exam-rooms', authenticate, requirePermission('catalog.view'), listExamRooms);

export default router;
