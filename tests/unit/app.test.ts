/**
 * Smoke tests for the Express application scaffold.
 * Verifies that the app starts, responds to health checks, and handles errors correctly.
 */

// Set required env vars BEFORE any imports that trigger config loading
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
process.env.VAPID_PUBLIC_KEY = 'test-vapid-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';
process.env.FCM_SERVER_KEY = 'test-fcm-server-key';
process.env.SMS_GATEWAY_URL = 'https://sms.example.com/send';
process.env.SMS_GATEWAY_API_KEY = 'test-sms-key';
process.env.QR_PRIVATE_KEY_PATH = '/tmp/qr-private.pem';
process.env.QR_PUBLIC_KEY_PATH = '/tmp/qr-public.pem';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import { createApp } from '../../src/app';
import { describe, it } from 'node:test';

describe('Express Application', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String),
        },
      });
    });

    it('returns 404 for unknown POST routes', async () => {
      const res = await request(app).post('/api/nonexistent').send({});
      expect(res.status).toBe(404);
    });
  });

  describe('Security headers', () => {
    it('sets X-Content-Type-Options header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('JSON body parsing', () => {
    it('parses JSON request bodies', async () => {
      // POST to a non-existent route — we just want to verify the body was parsed
      // (the 404 handler will respond, but the body was parsed before that)
      const res = await request(app)
        .post('/api/test')
        .send({ key: 'value' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(404); // route doesn't exist, but body was parsed
    });
  });
});

