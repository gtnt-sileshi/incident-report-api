import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Request logging middleware.
 * Logs incoming requests and their responses with timing information.
 *
 * Log format:
 *   --> METHOD /path
 *   <-- METHOD /path STATUS DURATIONms
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip logging in test environment to keep test output clean
  if (config.NODE_ENV === 'test') {
    next();
    return;
  }

  const start = Date.now();
  const { method, originalUrl } = req;

  // Log the incoming request
  // eslint-disable-next-line no-console
  console.info(`--> ${method} ${originalUrl}`);

  // Intercept the response to log the status code and duration
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    const logFn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.info;

    // eslint-disable-next-line no-console
    logFn(`<-- ${method} ${originalUrl} ${statusCode} ${duration}ms`);
  });

  next();
}
