import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  regions,
  zones,
  woredas,
  examCenters,
  examRooms,
  powerClusters,
  internetClusters
} from '../db/schema';

export const locationRepository = {
  // Regions
  async listRegions() {
    const db = getDb();
    return db.select().from(regions);
  },

  async createRegion(data: any) {
    const db = getDb();
    const [region] = await db.insert(regions).values(data).returning();
    return region;
  },

  async updateRegion(id: string, data: any) {
    const db = getDb();
    const [region] = await db.update(regions).set(data).where(eq(regions.id, id)).returning();
    return region;
  },

  async deleteRegion(id: string) {
    const db = getDb();
    await db.delete(regions).where(eq(regions.id, id));
  },

  // Zones
  async listZones(regionId?: string) {
    const db = getDb();
    const query = db.select({
      id: zones.id,
      name: zones.name,
      code: zones.code,
      regionId: zones.regionId,
      regionName: regions.name,
    })
      .from(zones)
      .leftJoin(regions, eq(zones.regionId, regions.id));

    if (regionId) {
      return query.where(eq(zones.regionId, regionId));
    }
    return query;
  },

  async createZone(data: any) {
    const db = getDb();
    const [zone] = await db.insert(zones).values(data).returning();
    return zone;
  },

  async updateZone(id: string, data: any) {
    const db = getDb();
    const [zone] = await db.update(zones).set(data).where(eq(zones.id, id)).returning();
    return zone;
  },

  async deleteZone(id: string) {
    const db = getDb();
    await db.delete(zones).where(eq(zones.id, id));
  },

  // Woredas
  async listWoredas(zoneId?: string) {
    const db = getDb();
    const query = db.select({
      id: woredas.id,
      name: woredas.name,
      code: woredas.code,
      zoneId: woredas.zoneId,
      zoneName: zones.name,
    })
      .from(woredas)
      .leftJoin(zones, eq(woredas.zoneId, zones.id));

    if (zoneId) {
      return query.where(eq(woredas.zoneId, zoneId));
    }
    return query;
  },

  async createWoreda(data: any) {
    const db = getDb();
    const [woreda] = await db.insert(woredas).values(data).returning();
    return woreda;
  },

  async updateWoreda(id: string, data: any) {
    const db = getDb();
    const [woreda] = await db.update(woredas).set(data).where(eq(woredas.id, id)).returning();
    return woreda;
  },

  async deleteWoreda(id: string) {
    const db = getDb();
    await db.delete(woredas).where(eq(woredas.id, id));
  },

  // Exam Centers
  async listExamCenters(_regionId?: string) {
    const db = getDb();
    const query = db.select({
      id: examCenters.id,
      name: examCenters.name,
      code: examCenters.code,
      isActive: examCenters.isActive,
      woredaId: examCenters.woredaId,
      woredaName: woredas.name,
    })
      .from(examCenters)
      .leftJoin(woredas, eq(examCenters.woredaId, woredas.id));

    return query;
  },

  async createExamCenter(data: any) {
    const db = getDb();
    const [center] = await db.insert(examCenters).values(data).returning();
    return center;
  },

  async updateExamCenter(id: string, data: any) {
    const db = getDb();
    const [center] = await db.update(examCenters).set(data).where(eq(examCenters.id, id)).returning();
    return center;
  },

  async deleteExamCenter(id: string) {
    const db = getDb();
    await db.delete(examCenters).where(eq(examCenters.id, id));
  },

  // Rooms
  async listRooms(centerId: string) {
    const db = getDb();
    return db.select().from(examRooms).where(eq(examRooms.examCenterId, centerId));
  },

  // Clusters
  async listPowerClusters() {
    const db = getDb();
    return db.select().from(powerClusters);
  },

  async listInternetClusters() {
    const db = getDb();
    return db.select().from(internetClusters);
  }
};
