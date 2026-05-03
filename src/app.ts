import express, { Application, Request, Response } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './auth/auth.router';
import organizationsRouter from './organizations/organization.router';
import usersRouter from './users/user.router';
import devicesRouter from './devices/device.router';
import examFieldsRouter from './devices/exam-field.router';
import catalogRouter from './catalog/catalog.router';
import routingRulesRouter from './routing/routing-rule.router';
import incidentsRouter from './incidents/incident.router';
import auditLogRouter from './audit/audit-log.router';
import qrRouter from './qr/qr.router';
import pushRouter from './push/push.router';
import syncRouter from './sync/sync.router';
import reportsRouter from './reports/report.router';
import notificationsRouter from './notifications/notification.router';

/**
 * Creates and configures the Express application.
 *
 * The app and server are separated so that:
 * - Tests can import the app without starting a server
 * - The server can be started independently in server.ts
 * - Integration tests can use supertest with the app directly
 */
export function createApp(): Application {
  const app = express();

  // ─── Core Middleware ────────────────────────────────────────────────────────

  // Parse JSON request bodies (limit to 10mb to accommodate base64-encoded attachments in sync)
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded form bodies
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // Security headers (basic hardening without a full helmet dependency for now)
  app.use((_req: Request, res: Response, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // ─── Health Check ───────────────────────────────────────────────────────────

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Welcome to the Exam Incident & Support Portal API',
      version: '1.0.0',
      health: '/health',
      docs: '/api-docs', // Placeholder if you have Swagger
    });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ─── API Routes ─────────────────────────────────────────────────────────────

  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      message: 'Exam Incident & Support Portal API is running',
      endpoints: [
        '/api/auth',
        '/api/organizations',
        '/api/users',
        '/api/incidents',
        // ... add more as needed
      ],
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/exam-fields', examFieldsRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/routing-rules', routingRulesRouter);
  app.use('/api/incidents', incidentsRouter);
  app.use('/api/audit-log', auditLogRouter);
  app.use('/api/qr', qrRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/notifications', notificationsRouter);

  // ─── 404 Handler ────────────────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
  });

  // ─── Global Error Handler ───────────────────────────────────────────────────
  // Must be registered last — after all routes and other middleware
  app.use(errorHandler);

  return app;
}
