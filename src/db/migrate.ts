/**
 * Database migration runner.
 *
 * Migrations are stored as numbered SQL files in src/db/migrations/.
 * This script tracks which migrations have been applied in a `schema_migrations` table
 * and runs any pending migrations in order.
 *
 * Usage:
 *   npm run migrate
 *   ts-node src/db/migrate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PoolClient } from 'pg';
import * as dotenv from 'dotenv';

// Load .env before config is imported
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { getClient, closePool } from './index';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface MigrationRow {
  version: string;
  applied_at: Date;
}

/**
 * Ensures the schema_migrations tracking table exists.
 */
async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Returns the list of migration versions already applied to the database.
 */
async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<MigrationRow>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  return new Set(result.rows.map((row) => row.version));
}

/**
 * Returns all migration files from the migrations directory, sorted by version.
 */
function getMigrationFiles(): Array<{ version: string; filePath: string }> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !file.startsWith('.'))
    .sort()
    .map((file) => ({
      version: file.replace('.sql', ''),
      filePath: path.join(MIGRATIONS_DIR, file),
    }));
}

/**
 * Runs all pending migrations in a single transaction per migration file.
 */
async function runMigrations(): Promise<void> {
  const client = await getClient();

  try {
    // Ensure the tracking table exists (outside any migration transaction)
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const migrationFiles = getMigrationFiles();

    const pending = migrationFiles.filter((m) => !applied.has(m.version));

    if (pending.length === 0) {
      console.info('[Migrate] No pending migrations. Database is up to date.');
      return;
    }

    console.info(`[Migrate] Found ${pending.length} pending migration(s).`);

    for (const migration of pending) {
      console.info(`[Migrate] Applying migration: ${migration.version}`);

      const sql = fs.readFileSync(migration.filePath, 'utf-8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [migration.version],
        );
        await client.query('COMMIT');
        console.info(`[Migrate] ✓ Applied: ${migration.version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${migration.version} failed: ${message}`);
      }
    }

    console.info('[Migrate] All migrations applied successfully.');
  } finally {
    client.release();
  }
}

// Run migrations when this script is executed directly
runMigrations()
  .then(() => closePool())
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Migrate] Fatal error:', message);
    process.exit(1);
  });
