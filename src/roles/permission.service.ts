import { getRedis } from '../db/redis';
import { AppError } from '../middleware/errorHandler';
import { roleRepository } from './role.repository';

const CACHE_KEY = (userId: string) => `perm:${userId}`;
const CACHE_TTL = 300; // 5 minutes

/**
 * Central permission resolver used by both the middleware and the login flow.
 *
 * Resolves a user's effective permission set by checking Redis first,
 * falling back to the database on a cache miss.
 */
export class PermissionService {
  /**
   * Returns the effective permission set for a user.
   * Checks Redis first; falls back to DB on cache miss.
   * Throws AppError(503) if both Redis and DB are unavailable.
   *
   * Requirements: 5, 11
   */
  async resolvePermissions(userId: string): Promise<string[]> {
    try {
      const redis = getRedis();
      const cached = await redis.get(CACHE_KEY(userId));
      if (cached) {
        return JSON.parse(cached) as string[];
      }

      const permissions = await roleRepository.resolvePermissionsForUser(userId);
      await redis.setex(CACHE_KEY(userId), CACHE_TTL, JSON.stringify(permissions));
      return permissions;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        503,
        'PERMISSION_SERVICE_UNAVAILABLE',
        'Permission service is temporarily unavailable',
      );
    }
  }

  /**
   * Invalidates the permission cache for a single user.
   *
   * Requirements: 11
   */
  async invalidateUser(userId: string): Promise<void> {
    await getRedis().del(CACHE_KEY(userId));
  }

  /**
   * Invalidates the permission cache for all users assigned to a role.
   * Uses a single Redis DEL call for all keys (one round-trip).
   *
   * Requirements: 11
   */
  async invalidateRole(roleId: string): Promise<void> {
    const users = await roleRepository.getUsersForRole(roleId);
    if (users.length === 0) return;
    const keys = users.map((u) => CACHE_KEY(u.id));
    await getRedis().del(...keys);
  }
}

export const permissionService = new PermissionService();
