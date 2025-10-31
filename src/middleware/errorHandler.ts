import { Request, Response, NextFunction } from 'express';
import { DraftError } from '../errors/DraftErrors';
import { logger } from '../utils/logger';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log error with redacted sensitive data
  logger.error('Request error occurred', {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    url: req.url,
    method: req.method,
    params: req.params,
    // Note: req.body is excluded to prevent logging passwords/tokens
  });

  if (error instanceof DraftError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  // Default error response
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
