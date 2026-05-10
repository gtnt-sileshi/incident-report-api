import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env file before validating environment variables
loadDotenv();

/**
 * Environment configuration schema.
 * All environment variables are validated at startup using zod.
 * The application will fail fast with a descriptive error if any required variable is missing or invalid.
 */
const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection URL'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // VAPID Keys for Web Push
  VAPID_PUBLIC_KEY: z.string().min(1, 'VAPID_PUBLIC_KEY is required'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'VAPID_PRIVATE_KEY is required'),
  VAPID_SUBJECT: z.string().refine(
    (val) => val.startsWith('mailto:') || z.string().url().safeParse(val).success,
    { message: 'VAPID_SUBJECT must be a URL or mailto: address' }
  ),

  // Firebase Cloud Messaging
  FCM_SERVER_KEY: z.string().min(1, 'FCM_SERVER_KEY is required'),

  // SMS Gateway
  SMS_GATEWAY_URL: z.string().url('SMS_GATEWAY_URL must be a valid URL'),
  SMS_GATEWAY_API_KEY: z.string().min(1, 'SMS_GATEWAY_API_KEY is required'),
  SMS_GATEWAY_SENDER_ID: z.string().default('ITDB'),

  // File Storage
  ATTACHMENT_STORAGE_PATH: z.string().default('/data/attachments'),
  MAX_FILE_SIZE_MB: z
    .string()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(500)),

  // QR Credential ECDSA Keys
  QR_PRIVATE_KEY_PATH: z.string().min(1, 'QR_PRIVATE_KEY_PATH is required'),
  QR_PUBLIC_KEY_PATH: z.string().min(1, 'QR_PUBLIC_KEY_PATH is required'),

  // Escalation thresholds (minutes)
  ESCALATION_HIGH_PRIORITY_MINUTES: z
    .string()
    .default('30')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1)),
  ESCALATION_MEDIUM_PRIORITY_MINUTES: z
    .string()
    .default('90')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1)),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and parses environment variables.
 * Throws a descriptive error at startup if any required variable is missing or invalid.
 */
function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  return result.data;
}

// Export a singleton config object — validated once at module load time
export const config = loadConfig();
