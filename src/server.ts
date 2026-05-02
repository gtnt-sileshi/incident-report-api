/**
 * HTTP server entry point.
 *
 * Responsibilities:
 * 1. Load and validate environment configuration (fails fast on invalid config)
 * 2. Test database connectivity
 * 3. Create the Express application
 * 4. Start the HTTP server
 * 5. Handle graceful shutdown on SIGTERM / SIGINT
 */

import './types/express-augmentation'; // Load Express type augmentation
import * as http from 'http';
import { config } from './config';
import { createApp } from './app';
import { testConnection, closePool } from './db/index';
import { startSmsRetryScheduler } from './scheduler/sms-retry.scheduler';
import { startEscalationScheduler } from './scheduler/escalation.scheduler';
import { websocketServer } from './websocket/websocket.server';

async function main(): Promise<void> {
  // Verify database connectivity before accepting traffic
  console.info('[Server] Testing database connection...');
  await testConnection();

  // Create the Express application
  const app = createApp();

  // Create the HTTP server (kept separate from the app for WebSocket upgrade support)
  const server = http.createServer(app);

  // Initialize WebSocket server
  websocketServer.initialize(server);

  // Start listening
  await new Promise<void>((resolve) => {
    server.listen(config.PORT, () => {
      console.info(
        `[Server] Exam Incident & Support Portal API running on port ${config.PORT} (${config.NODE_ENV})`,
      );
      resolve();
    });
  });

  // Start background schedulers
  startSmsRetryScheduler();
  startEscalationScheduler();

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[Server] Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      console.info('[Server] HTTP server closed.');

      // Shutdown WebSocket server
      await websocketServer.shutdown();

      // Close database pool
      await closePool();

      console.info('[Server] Shutdown complete.');
      process.exit(0);
    });

    // Force shutdown after 30 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[Server] Unhandled promise rejection:', reason);
    // In production, exit so the process manager can restart
    if (config.NODE_ENV === 'production') {
      process.exit(1);
    }
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[Server] Fatal startup error:', message);
  process.exit(1);
});
