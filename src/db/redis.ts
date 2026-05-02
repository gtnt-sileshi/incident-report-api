import Redis from 'ioredis';
import { config } from '../config';

let _redis: Redis | null = null;

/**
 * Returns the singleton ioredis client.
 * Creates the connection on first call.
 */
export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    _redis.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[Redis] Connection error:', err.message);
    });

    _redis.on('connect', () => {
      // eslint-disable-next-line no-console
      console.info('[Redis] Connected');
    });
  }

  return _redis;
}

/**
 * Gracefully closes the Redis connection.
 * Should be called during application shutdown.
 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
    // eslint-disable-next-line no-console
    console.info('[Redis] Connection closed');
  }
}
