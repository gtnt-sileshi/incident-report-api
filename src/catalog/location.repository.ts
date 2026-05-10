import { eq, count } from 'drizzle-orm';
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

  async findRegionById(id: string) {
    const db = getDb();
    const [region] = await db.select().from(regions).where(eq(regions.id, id));
    return region ?? null;
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

  // Child-count helpers for DELETE protection
  async countZonesByRegion(regionId: string): Promise<number> {
    const db = getDb();
    const [row] = await db.select({ count: count() }).from(zones).where(eq(zones.regionId, regionId));
    return Number(row?.count ?? 0);
  },

  async countWoredasByZone(zoneId: string): Promise<number> {
    const db = getDb();
    const [row] = await db.select({ count: count() }).from(woredas).where(eq(woredas.zoneId, zoneId));
    return Number(row?.count ?? 0);
  },

  async countExamCentersByWoreda(woredaId: string): Promise<number> {
    const db = getDb();
    const [row] = await db.select({ count: count() }).from(examCenters).where(eq(examCenters.woredaId, woredaId));
    return Number(row?.count ?? 0);
  },

  async countExamRoomsByCenter(centerId: string): Promise<number> {
    const db = getDb();
    const [row] = await db.select({ count: count() }).from(examRooms).where(eq(examRooms.examCenterId, centerId));
    return Number(row?.count ?? 0);
  },

  // Full nested hierarchy (active records only)
  async getHierarchy() {
    const db = getDb();

    // Fetch all active regions
    const allRegions = await db.select({
      id: regions.id,
      name: regions.name,
      code: regions.code,
    }).from(regions).where(eq(regions.isActive, true));

    // Fetch all zones (zones table has no isActive column — include all)
    const allZones = await db.select({
      id: zones.id,
      name: zones.name,
      regionId: zones.regionId,
    }).from(zones);

    // Fetch all woredas (woredas table has no isActive column — include all)
    const allWoredas = await db.select({
      id: woredas.id,
      name: woredas.name,
      zoneId: woredas.zoneId,
    }).from(woredas);

    // Fetch all active exam centers
    const allExamCenters = await db.select({
      id: examCenters.id,
      name: examCenters.name,
      code: examCenters.code,
      woredaId: examCenters.woredaId,
    }).from(examCenters).where(eq(examCenters.isActive, true));

    // Build nested structure in memory
    const examCentersByWoreda = new Map<string, { id: string; name: string; code: string | null }[]>();
    for (const ec of allExamCenters) {
      const list = examCentersByWoreda.get(ec.woredaId) ?? [];
      list.push({ id: ec.id, name: ec.name, code: ec.code ?? null });
      examCentersByWoreda.set(ec.woredaId, list);
    }

    const woredasByZone = new Map<string, { id: string; name: string; examCenters: { id: string; name: string; code: string | null }[] }[]>();
    for (const w of allWoredas) {
      const list = woredasByZone.get(w.zoneId) ?? [];
      list.push({ id: w.id, name: w.name, examCenters: examCentersByWoreda.get(w.id) ?? [] });
      woredasByZone.set(w.zoneId, list);
    }

    const zonesByRegion = new Map<string, { id: string; name: string; woredas: { id: string; name: string; examCenters: { id: string; name: string; code: string | null }[] }[] }[]>();
    for (const z of allZones) {
      const list = zonesByRegion.get(z.regionId) ?? [];
      list.push({ id: z.id, name: z.name, woredas: woredasByZone.get(z.id) ?? [] });
      zonesByRegion.set(z.regionId, list);
    }

    return allRegions.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code ?? null,
      zones: zonesByRegion.get(r.id) ?? [],
    }));
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

  async findZoneById(id: string) {
    const db = getDb();
    const [zone] = await db.select().from(zones).where(eq(zones.id, id));
    return zone ?? null;
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

  async findWoredaById(id: string) {
    const db = getDb();
    const [woreda] = await db.select().from(woredas).where(eq(woredas.id, id));
    return woreda ?? null;
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

  async findExamCenterById(id: string) {
    const db = getDb();
    const [center] = await db.select().from(examCenters).where(eq(examCenters.id, id));
    return center ?? null;
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

  async createPowerCluster(data: any) {
    const db = getDb();
    const [cluster] = await db.insert(powerClusters).values(data).returning();
    return cluster;
  },

  async updatePowerCluster(id: string, data: any) {
    const db = getDb();
    const [cluster] = await db.update(powerClusters).set(data).where(eq(powerClusters.id, id)).returning();
    return cluster;
  },

  async deletePowerCluster(id: string) {
    const db = getDb();
    await db.delete(powerClusters).where(eq(powerClusters.id, id));
  },

  async findPowerClusterById(id: string) {
    const db = getDb();
    const [cluster] = await db.select().from(powerClusters).where(eq(powerClusters.id, id));
    return cluster ?? null;
  },

  async findExamCentersByPowerCluster(clusterId: string) {
    const db = getDb();
    return db.select({ id: examCenters.id, name: examCenters.name })
      .from(examCenters)
      .where(eq(examCenters.powerClusterId, clusterId));
  },

  async listInternetClusters() {
    const db = getDb();
    return db.select().from(internetClusters);
  },

  async createInternetCluster(data: any) {
    const db = getDb();
    const [cluster] = await db.insert(internetClusters).values(data).returning();
    return cluster;
  },

  async updateInternetCluster(id: string, data: any) {
    const db = getDb();
    const [cluster] = await db.update(internetClusters).set(data).where(eq(internetClusters.id, id)).returning();
    return cluster;
  },

  async deleteInternetCluster(id: string) {
    const db = getDb();
    await db.delete(internetClusters).where(eq(internetClusters.id, id));
  },

  async findInternetClusterById(id: string) {
    const db = getDb();
    const [cluster] = await db.select().from(internetClusters).where(eq(internetClusters.id, id));
    return cluster ?? null;
  },

  async findExamCentersByInternetCluster(clusterId: string) {
    const db = getDb();
    return db.select({ id: examCenters.id, name: examCenters.name })
      .from(examCenters)
      .where(eq(examCenters.internetClusterId, clusterId));
  },

  // Exam Rooms write methods
  async createExamRoom(data: any) {
    const db = getDb();
    const [room] = await db.insert(examRooms).values(data).returning();
    return room;
  },

  async updateExamRoom(id: string, data: any) {
    const db = getDb();
    const [room] = await db.update(examRooms).set(data).where(eq(examRooms.id, id)).returning();
    return room;
  },

  async deleteExamRoom(id: string) {
    const db = getDb();
    await db.delete(examRooms).where(eq(examRooms.id, id));
  },

  async findExamRoomById(id: string) {
    const db = getDb();
    const [room] = await db.select().from(examRooms).where(eq(examRooms.id, id));
    return room ?? null;
  },
};
