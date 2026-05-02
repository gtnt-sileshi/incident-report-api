import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../auth/jwt.service';
import { AppError } from './errorHandler';

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

/**
 * Middleware: validates the Bearer JWT, checks Redis revocation, and attaches
 * the decoded payload to `req.user`.
 *
 * Throws AppError(401) if the token is missing, invalid, expired, or revoked.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new AppError(401, 'MISSING_TOKEN', 'Authentication token is required');
    }

    const payload = jwtService.verifyToken(token);

    const revoked = await jwtService.isRevoked(payload);
    if (revoked) {
      throw new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked');
    }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: same as `authenticate` but additionally requires the token type
 * to be 'device'. Used to protect device-only endpoints.
 *
 * Throws AppError(401) if the token is not a device token.
 */
export async function authenticateDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await authenticate(req, res, async (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }

    if (req.user?.type !== 'device') {
      next(new AppError(401, 'DEVICE_TOKEN_REQUIRED', 'A device token is required for this endpoint'));
      return;
    }

    next();
  });
}
