import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { userRepository } from '../users/user.repository';
import { qrCredentialRepository } from './qr-credential.repository';
import { QrCredential } from '../db/schema';
import { AppError } from '../middleware/errorHandler';

export interface QrPayload {
  version: number;
  userId: string;
  name: string;
  role: string;
  regionId: string | null;
  examCenterId: string | null;
  issuedAt: string;
  credentialId: string;
}

/**
 * Encodes a string to base64url format (URL-safe base64 without padding).
 */
function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decodes a base64url string back to a UTF-8 string.
 */
function fromBase64Url(input: string): string {
  // Re-add padding
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Reads a PEM key file from the given path.
 * Resolves relative paths from the process working directory.
 */
function readKeyFile(keyPath: string): string {
  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(process.cwd(), keyPath);
  return fs.readFileSync(resolvedPath, 'utf8');
}

export class QrService {
  /**
   * Issues a new QR credential for the given user.
   * Invalidates any existing valid credential first.
   * Requirements: 4.1, 4.6
   */
  async issueCredential(userId: string): Promise<QrCredential> {
    // Fetch user
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', `User ${userId} not found`);
    }

    // Build payload
    const credentialId = crypto.randomUUID();
    const payload: QrPayload = {
      version: 1,
      userId: user.id,
      name: user.name,
      role: user.role,
      regionId: user.regionId,
      examCenterId: user.examCenterId,
      issuedAt: new Date().toISOString(),
      credentialId,
    };

    // Encode payload as base64url
    const payloadJson = JSON.stringify(payload);
    const encodedPayload = toBase64Url(payloadJson);

    // Sign with ECDSA P-256 using the private key
    const privateKeyPem = readKeyFile(config.QR_PRIVATE_KEY_PATH);
    const sign = crypto.createSign('SHA256');
    sign.update(encodedPayload);
    sign.end();
    const signature = sign.sign(privateKeyPem, 'hex');

    // Invalidate any existing credential, then store the new one
    await qrCredentialRepository.invalidateByUserId(userId);
    const stored = await qrCredentialRepository.create({
      userId,
      payload: encodedPayload,
      signature,
    });

    return stored;
  }

  /**
   * Invalidates all valid credentials for the given user.
   * Requirements: 4.6, 13.5
   */
  async invalidateCredential(userId: string): Promise<void> {
    await qrCredentialRepository.invalidateByUserId(userId);
  }

  /**
   * Verifies an ECDSA-signed QR credential.
   * Returns { valid: true, data } if the signature is valid, { valid: false } otherwise.
   * Requirements: 4.7
   */
  async verifyCredential(
    payload: string,
    signature: string,
  ): Promise<{ valid: boolean; data?: QrPayload }> {
    try {
      const publicKeyPem = readKeyFile(config.QR_PUBLIC_KEY_PATH);
      const verify = crypto.createVerify('SHA256');
      verify.update(payload);
      verify.end();

      const isValid = verify.verify(publicKeyPem, signature, 'hex');
      if (!isValid) {
        return { valid: false };
      }

      // Decode and parse the payload
      const decoded = fromBase64Url(payload);
      const data: QrPayload = JSON.parse(decoded);
      return { valid: true, data };
    } catch {
      return { valid: false };
    }
  }
}

export const qrService = new QrService();
export default QrService;
