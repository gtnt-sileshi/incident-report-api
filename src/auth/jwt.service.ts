import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getRedis } from '../db/redis';
import { AppError } from '../middleware/errorHandler';

export interface JwtPayload {
  sub: string;       // user ID
  email: string;
  role: string;
  orgId: string;
  deviceId?: string; // only for IT Rep device tokens
  type: 'user' | 'device';
}

/**
 * Parses the JWT_EXPIRES_IN string (e.g. "8h", "1d") into seconds.
 * Used to set Redis TTLs that match the token lifetime.
 */
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

// Buffer added to Redis TTL so revocation entries outlive the tokens themselves
const REVOCATION_BUFFER_SECONDS = 60 * 60; // 1 hour

export class JwtService {
  /**
   * Signs a JWT with the application secret and configured expiry.
   */
  issueToken(payload: JwtPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN,
    });
  }

  /**
   * Verifies and decodes a JWT.
   * Throws AppError(401, 'INVALID_TOKEN') if the token is invalid or expired.
   */
  verifyToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      return decoded;
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token');
    }
  }

  /**
   * Adds a userId to the Redis revoked-users set with individual key TTL.
   * Uses a key pattern: revoked:user:{userId} with TTL = JWT_EXPIRES_IN + buffer.
   */
  async revokeUserSessions(userId: string): Promise<void> {
    const redis = getRedis();
    const ttl = parseDurationToSeconds(config.JWT_EXPIRES_IN) + REVOCATION_BUFFER_SECONDS;
    const key = `revoked:user:${userId}`;
    await redis.setex(key, ttl, '1');
  }

  /**
   * Adds an orgId to the Redis revoked-orgs set with individual key TTL.
   * Uses a key pattern: revoked:org:{orgId} with TTL = JWT_EXPIRES_IN + buffer.
   */
  async revokeOrgSessions(orgId: string): Promise<void> {
    const redis = getRedis();
    const ttl = parseDurationToSeconds(config.JWT_EXPIRES_IN) + REVOCATION_BUFFER_SECONDS;
    const key = `revoked:org:${orgId}`;
    await redis.setex(key, ttl, '1');
  }

  /**
   * Removes the revocation entry for a user so a freshly issued token is accepted.
   * Called on login to clear any stale revocation from a previous logout.
   */
  async clearRevocation(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`revoked:user:${userId}`);
  }

  /**
   * Returns true if the token's userId OR orgId has been revoked.
   * Checks individual keys: revoked:user:{userId} and revoked:org:{orgId}
   */
  async isRevoked(payload: JwtPayload): Promise<boolean> {
    const redis = getRedis();
    const [userRevoked, orgRevoked] = await Promise.all([
      redis.exists(`revoked:user:${payload.sub}`),
      redis.exists(`revoked:org:${payload.orgId}`),
    ]);
    return userRevoked === 1 || orgRevoked === 1;
  }
}

export const jwtService = new JwtService();
export default JwtService;
