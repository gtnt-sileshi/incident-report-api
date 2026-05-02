/**
 * Property-Based Test: QR Credential Sign-Verify Round Trip (P7)
 *
 * **Validates: Requirements 4.7**
 *
 * Property 7: QR Credential Sign-Verify Round Trip
 *
 * For any valid QR credential payload (containing userId, name, role, orgId,
 * examFieldIds, issuedAt, credentialId), signing the payload with the system's
 * private key and then verifying the resulting signature with the corresponding
 * public key SHALL return true. A payload with any field modified after signing
 * SHALL fail verification.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as fc from 'fast-check';

// ─── Mock config and DB (not needed for pure crypto tests) ───────────────────

jest.mock('../../src/config', () => ({
  config: {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
    JWT_EXPIRES_IN: '8h',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
    FCM_SERVER_KEY: 'test-fcm-server-key',
    SMS_GATEWAY_URL: 'https://test-sms-gateway.com',
    SMS_GATEWAY_API_KEY: 'test-sms-api-key',
    SMS_GATEWAY_SENDER_ID: 'TEST',
    ATTACHMENT_STORAGE_PATH: './test-attachments',
    MAX_FILE_SIZE_MB: 50,
    // Point to the real key files for actual ECDSA testing
    QR_PRIVATE_KEY_PATH: path.resolve(__dirname, '../../ec-private.pem'),
    QR_PUBLIC_KEY_PATH: path.resolve(__dirname, '../../ec-public.pem'),
    ESCALATION_HIGH_PRIORITY_MINUTES: 30,
    ESCALATION_MEDIUM_PRIORITY_MINUTES: 90,
    LOG_LEVEL: 'error',
  },
}));

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// Mock repositories — we only test the crypto layer here
jest.mock('../../src/users/user.repository');
jest.mock('../../src/devices/exam-center-assignment.repository');
jest.mock('../../src/qr/qr-credential.repository');

// ─── Load real key files ──────────────────────────────────────────────────────

const PRIVATE_KEY_PATH = path.resolve(__dirname, '../../ec-private.pem');
const PUBLIC_KEY_PATH = path.resolve(__dirname, '../../ec-public.pem');

const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const publicKeyPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

// ─── Helpers (mirrors qr.service.ts logic) ───────────────────────────────────

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function fromBase64Url(input: string): string {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function signPayload(encodedPayload: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(encodedPayload);
  sign.end();
  return sign.sign(privateKeyPem, 'hex');
}

function verifyPayload(encodedPayload: string, signature: string): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(encodedPayload);
    verify.end();
    return verify.verify(publicKeyPem, signature, 'hex');
  } catch {
    return false;
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a valid UUID-like string */
const uuidArbitrary = fc.uuid();

/** Generates a non-empty name string */
const nameArbitrary = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0,
);

/** Generates a valid role string */
const roleArbitrary = fc.constantFrom(
  'super_admin',
  'org_admin',
  'bureau_staff',
  'it_rep',
  'moe',
  'aa_edu',
  'external',
);

/** Generates an array of 0–5 exam field UUIDs */
const examFieldIdsArbitrary = fc.array(uuidArbitrary, { minLength: 0, maxLength: 5 });

/** Generates a valid ISO date string */
const issuedAtArbitrary = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .map((d) => d.toISOString());

/** Generates a complete valid QR payload object */
const qrPayloadArbitrary = fc.record({
  version: fc.constant(1),
  userId: uuidArbitrary,
  name: nameArbitrary,
  role: roleArbitrary,
  orgId: uuidArbitrary,
  examFieldIds: examFieldIdsArbitrary,
  issuedAt: issuedAtArbitrary,
  credentialId: uuidArbitrary,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property Test: QR Credential Sign-Verify Round Trip (P7)', () => {
  /**
   * Property 7a: Sign then verify returns true for any valid payload.
   *
   * **Validates: Requirements 4.7**
   */
  it('P7a: signing a payload and verifying with the matching public key always returns true', () => {
    fc.assert(
      fc.property(qrPayloadArbitrary, (payload) => {
        const payloadJson = JSON.stringify(payload);
        const encodedPayload = toBase64Url(payloadJson);
        const signature = signPayload(encodedPayload);

        const isValid = verifyPayload(encodedPayload, signature);
        expect(isValid).toBe(true);
      }),
      { numRuns: 50, verbose: true },
    );
  });

  /**
   * Property 7b: Mutating any field in the payload after signing causes verification to fail.
   *
   * **Validates: Requirements 4.7**
   */
  it('P7b: mutating any field in the payload after signing causes verification to fail', () => {
    fc.assert(
      fc.property(
        qrPayloadArbitrary,
        // Pick which field to mutate
        fc.constantFrom(
          'userId',
          'name',
          'role',
          'orgId',
          'examFieldIds',
          'issuedAt',
          'credentialId',
          'version',
        ),
        // Provide a replacement value for the mutated field
        fc.oneof(
          uuidArbitrary,
          nameArbitrary,
          roleArbitrary,
          fc.constant('mutated-value'),
          fc.constant(999),
          fc.array(uuidArbitrary, { minLength: 1, maxLength: 3 }),
        ),
        (payload, fieldToMutate, mutatedValue) => {
          // Sign the original payload
          const originalJson = JSON.stringify(payload);
          const encodedOriginal = toBase64Url(originalJson);
          const signature = signPayload(encodedOriginal);

          // Mutate the payload — ensure the mutated value is actually different
          const mutatedPayload = { ...payload } as Record<string, unknown>;

          // Apply a mutation that is guaranteed to change the field
          if (fieldToMutate === 'examFieldIds') {
            // Add a sentinel UUID to the array to ensure it changes
            mutatedPayload[fieldToMutate] = [
              ...(payload.examFieldIds as string[]),
              '00000000-0000-0000-0000-000000000001',
            ];
          } else if (fieldToMutate === 'version') {
            mutatedPayload[fieldToMutate] = (payload.version as number) + 1;
          } else {
            // For string fields, append a suffix to guarantee a change
            const original = payload[fieldToMutate as keyof typeof payload];
            mutatedPayload[fieldToMutate] =
              typeof original === 'string' ? original + '_mutated' : mutatedValue;
          }

          // Re-encode the mutated payload
          const mutatedJson = JSON.stringify(mutatedPayload);
          const encodedMutated = toBase64Url(mutatedJson);

          // The mutated payload must differ from the original
          if (encodedMutated === encodedOriginal) {
            // Skip this case — mutation produced no change (shouldn't happen with our strategy)
            return;
          }

          // Verifying the mutated payload with the original signature must fail
          const isValid = verifyPayload(encodedMutated, signature);
          expect(isValid).toBe(false);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  /**
   * Property 7c: A tampered signature (wrong hex) always fails verification.
   *
   * **Validates: Requirements 4.7**
   */
  it('P7c: a tampered signature always fails verification', () => {
    fc.assert(
      fc.property(
        qrPayloadArbitrary,
        // Generate a random hex string of the same length as a real signature (64 bytes = 128 hex chars)
        fc.hexaString({ minLength: 128, maxLength: 128 }),
        (payload, tamperedSig) => {
          const payloadJson = JSON.stringify(payload);
          const encodedPayload = toBase64Url(payloadJson);
          const realSignature = signPayload(encodedPayload);

          // Only test when the tampered sig is actually different from the real one
          if (tamperedSig === realSignature) return;

          const isValid = verifyPayload(encodedPayload, tamperedSig);
          expect(isValid).toBe(false);
        },
      ),
      { numRuns: 50, verbose: true },
    );
  });

  /**
   * Property 7d: base64url encode/decode round-trip is lossless for any payload.
   *
   * **Validates: Requirements 4.7** (encoding correctness is a prerequisite for sign-verify)
   */
  it('P7d: base64url encode then decode is lossless for any JSON payload', () => {
    fc.assert(
      fc.property(qrPayloadArbitrary, (payload) => {
        const json = JSON.stringify(payload);
        const encoded = toBase64Url(json);
        const decoded = fromBase64Url(encoded);
        expect(decoded).toBe(json);
      }),
      { numRuns: 100, verbose: true },
    );
  });
});
