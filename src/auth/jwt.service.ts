import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getRedis } from '../db/redis';
import { AppError } from '../middleware/errorHandler';

export interface JwtPayload {
  sub: string;       // user ID
  email?: string;
  role: string;
  regionId?: string;
  examCenterId?: string;
  examRoomId?: string;
  powerClusterId?: string;
  internetClusterId?: string;
  deviceId?: string; // only for IT Rep device tokens
  type: 'user' | 'device';
}

function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 8 * 60 * 60; // default 8 hours

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default:  return 8 * 60 * 60;
  }
}

const REVOCATION_BUFFER_SECONDS = 60 * 60; // 1 hour

export class JwtService {
  issueToken(payload: JwtPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN,
    });
  }

  verifyToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      return decoded;
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token');
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const redis = getRedis();
    const ttl = parseDurationToSeconds(config.JWT_EXPIRES_IN) + REVOCATION_BUFFER_SECONDS;
    const key = `revoked:user:${userId}`;
    await redis.setex(key, ttl, '1');
  }

  async revokeRegionSessions(regionId: string): Promise<void> {
    const redis = getRedis();
    const ttl = parseDurationToSeconds(config.JWT_EXPIRES_IN) + REVOCATION_BUFFER_SECONDS;
    const key = `revoked:region:${regionId}`;
    await redis.setex(key, ttl, '1');
  }

  async clearRevocation(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`revoked:user:${userId}`);
  }

  async isRevoked(payload: JwtPayload): Promise<boolean> {
    const redis = getRedis();
    
    // Check user revocation
    const userRevoked = await redis.exists(`revoked:user:${payload.sub}`);
    if (userRevoked === 1) return true;

    // Check region revocation if applicable
    if (payload.regionId) {
      const regionRevoked = await redis.exists(`revoked:region:${payload.regionId}`);
      if (regionRevoked === 1) return true;
    }

    return false;
  }
}

export const jwtService = new JwtService();
export default JwtService;
