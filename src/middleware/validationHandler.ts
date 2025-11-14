import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { logger } from '../config/logger';

/**
 * Middleware to handle validation errors from express-validator
 *
 * This middleware should be used after validation chains to catch and format validation errors.
 * It returns a 400 Bad Request with detailed field-level error messages.
 *
 * @example
 * router.post('/register',
 *   registerValidator,
 *   handleValidationErrors,
 *   authController.register
 * );
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Extract error messages
    const errorMessages = errors.array().map((error: ValidationError) => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
    }));

    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      errors: errorMessages,
      ip: req.ip,
    });

    res.status(400).json({
      error: 'Validation failed',
      details: errorMessages,
    });
    return;
  }

  next();
};

/**
 * Alternative validation handler that stops at the first error
 *
 * This version returns only the first validation error encountered,
 * which can be useful for forms that validate field-by-field.
 */
export const handleValidationErrorsFirstOnly = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const firstError = errors.array()[0] as ValidationError;

    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      error: {
        field: firstError.type === 'field' ? firstError.path : 'unknown',
        message: firstError.msg,
      },
      ip: req.ip,
    });

    res.status(400).json({
      error: firstError.msg,
      field: firstError.type === 'field' ? firstError.path : 'unknown',
    });
    return;
  }

  next();
};
