export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error") {
    super(500, message);
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

/**
 * Get a safe error message from any error type
 * @param error - The error object
 * @param defaultMessage - Default message if error has no message
 * @returns The error message string
 */
export function getErrorMessage(error: any, defaultMessage: string = "An error occurred"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return defaultMessage;
}

/**
 * Get the HTTP status code from an error
 * @param error - The error object
 * @param defaultStatusCode - Default status code if not available
 * @returns The HTTP status code
 */
export function getErrorStatusCode(error: any, defaultStatusCode: number = 500): number {
  if (isAppError(error)) {
    return error.statusCode;
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = Number(error.statusCode);
    return !isNaN(code) && code >= 100 && code < 600 ? code : defaultStatusCode;
  }
  return defaultStatusCode;
}
