import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { qrService } from './qr.service';
import { qrCredentialRepository } from './qr-credential.repository';
import { userRepository } from '../users/user.repository';

// ─── Validation schemas ───────────────────────────────────────────────────────

const verifyCredentialSchema = z.object({
  payload: z.string().min(1, 'payload is required'),
  signature: z.string().min(1, 'signature is required'),
});

// ─── GET /api/qr/:userId ──────────────────────────────────────────────────────

/**
 * Returns the current valid QR credential (payload + signature) for a user.
 * If no valid credential exists, issues a new one.
 * Requirements: 4.1, 4.3
 */
export async function getCredential(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params;

    // Try to find an existing valid credential
    let credential = await qrCredentialRepository.findValidByUserId(userId);

    // If none exists, issue a new one
    if (!credential) {
      credential = await qrService.issueCredential(userId);
    }

    res.status(200).json({
      credential: {
        id: credential.id,
        userId: credential.userId,
        payload: credential.payload,
        signature: credential.signature,
        isValid: credential.isValid,
        issuedAt: credential.issuedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/qr/verify ──────────────────────────────────────────────────────

/**
 * Verifies a QR credential's ECDSA signature and returns user info + active status.
 * Requirements: 4.4, 4.5, 4.7
 */
export async function verifyCredential(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = verifyCredentialSchema.parse(req.body);

    const result = await qrService.verifyCredential(body.payload, body.signature);

    if (!result.valid || !result.data) {
      res.status(200).json({
        valid: false,
        message: 'Invalid or tampered QR credential',
      });
      return;
    }

    // Fetch the user to check active status
    const user = await userRepository.findById(result.data.userId);
    const isActive = user?.isActive ?? false;

    // Check if the credential is still marked valid in the database
    const storedCredential = await qrCredentialRepository.findValidByUserId(result.data.userId);
    const isCredentialValid = storedCredential !== null &&
      storedCredential.payload === body.payload &&
      storedCredential.signature === body.signature;

    res.status(200).json({
      valid: result.valid,
      credentialActive: isCredentialValid,
      userActive: isActive,
      data: {
        userId: result.data.userId,
        name: result.data.name,
        role: result.data.role,
        orgId: result.data.orgId,
        examFieldIds: result.data.examFieldIds,
        issuedAt: result.data.issuedAt,
        credentialId: result.data.credentialId,
      },
      // Clear "Access Revoked" indicator if account is deactivated (Req 4.5)
      accessRevoked: !isActive || !isCredentialValid,
    });
  } catch (err) {
    next(err);
  }
}
