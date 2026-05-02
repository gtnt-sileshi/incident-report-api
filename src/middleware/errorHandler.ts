import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';

/**
 * Structured error response shape returned to clients.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Application-level error class.
 * Use this to throw errors with a specific HTTP status code and error code.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    // Restore prototype chain (required when extending built-in classes in TypeScript)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handler middleware.
 * Must be registered LAST in the Express middleware chain (after all routes).
 *
 * Handles:
 * - AppError: application-level errors with known status codes
 * - ZodError: validation errors from zod schema parsing
 * - Generic Error: unexpected errors (500)
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Application-level errors (known, expected errors)
  if (err instanceof AppError) {
    const body: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const body: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  // Unexpected errors — log and return a generic 500
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';

  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Unhandled error:', err);

  const body: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        config.NODE_ENV === 'production'
          ? 'An internal server error occurred'
          : message,
      // Include stack trace in non-production environments for debugging
      ...(config.NODE_ENV !== 'production' &&
        err instanceof Error && { details: { stack: err.stack } }),
    },
  };

  res.status(500).json(body);
}
