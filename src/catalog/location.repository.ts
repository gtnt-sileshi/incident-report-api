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

  // Exam Centers
  async listExamCenters(regionId?: string) {
    const db = getDb();
    // Simplified for now: list all centers. In a real app, you'd join with woreda/zone/region.
    return db.select().from(examCenters);
  },

  async createExamCenter(data: any) {
    const db = getDb();
    const [center] = await db.insert(examCenters).values(data).returning();
    return center;
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
