import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { AppError } from './errorHandler';

/**
 * Multer configuration for incident attachment uploads.
 *
 * Storage:
 * - Files are stored to /data/attachments/{incidentId}/
 * - Original filename is preserved with timestamp prefix
 *
 * Validation:
 * - File type: photo (image/*), video (video/*), document (application/pdf, .doc, .docx, .xls, .xlsx)
 * - Size limit: configured via MAX_FILE_SIZE_MB environment variable
 *
 * Requirements: 5.3, 8.4, 8.5
 */

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Images (photos)
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',

  // Videos
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',

  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

/**
 * Determines the file type category based on MIME type.
 */
function getFileTypeCategory(mimetype: string): string {
  if (mimetype.startsWith('image/')) {
    return 'photo';
  }
  if (mimetype.startsWith('video/')) {
    return 'video';
  }
  return 'document';
}

/**
 * Multer storage configuration.
 * Files are stored to /data/attachments/{incidentId}/
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const incidentId = req.params.id;
    if (!incidentId) {
      return cb(new AppError(400, 'INCIDENT_ID_REQUIRED', 'Incident ID is required'), '');
    }

    const uploadDir = path.join(config.ATTACHMENT_STORAGE_PATH, incidentId);

    // Create directory if it doesn't exist
    fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Preserve original filename with timestamp prefix to avoid collisions
    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}-${sanitizedFilename}`);
  },
});

/**
 * File filter to validate MIME type.
 */
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        400,
        'INVALID_FILE_TYPE',
        `File type ${file.mimetype} is not allowed. Allowed types: photo, video, document`,
      ),
    );
  }
};

/**
 * Check available disk space before upload.
 * Returns 507 Insufficient Storage if disk is full.
 */
export function checkDiskSpace(_req: any, _res: any, next: any): void {
  try {
    const stats = fs.statfsSync(config.ATTACHMENT_STORAGE_PATH);
    const availableBytes = stats.bavail * stats.bsize;
    const requiredBytes = config.MAX_FILE_SIZE_MB * 1024 * 1024;

    if (availableBytes < requiredBytes) {
      throw new AppError(
        507,
        'INSUFFICIENT_STORAGE',
        'Server storage is full. Cannot accept file uploads at this time.',
      );
    }

    next();
  } catch (err: any) {
    if (err instanceof AppError) {
      next(err);
    } else {
      // If statfsSync is not available (e.g., on Windows), skip the check
      next();
    }
  }
}

/**
 * Multer upload middleware for incident attachments.
 *
 * Usage:
 *   router.post('/:id/attachments', checkDiskSpace, upload.array('files', 10), uploadAttachments);
 *
 * Configuration:
 * - Storage: /data/attachments/{incidentId}/
 * - File size limit: MAX_FILE_SIZE_MB (from config)
 * - Allowed types: photo, video, document
 * - Max files per request: 10 (configurable in route)
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024, // Convert MB to bytes
  },
});

/**
 * Export helper to get file type category.
 */
export { getFileTypeCategory };
