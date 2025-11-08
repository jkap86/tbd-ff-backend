import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { validateId as utilValidateId, validatePositiveInteger } from "../utils/validation";

/**
 * Base Controller Class
 *
 * Provides common functionality for all controllers to eliminate repetitive code:
 * - Async error handling wrapper
 * - Standardized success/error responses
 * - Common validation helpers
 *
 * @example
 * export class MyController extends BaseController {
 *   getItems = this.asyncHandler(async (req, res) => {
 *     const id = this.validateId(req.params.id, "Item ID");
 *     const data = await getItemsById(id);
 *     this.respondSuccess(res, data);
 *   });
 * }
 */
export abstract class BaseController {
  /**
   * Wraps async route handlers to automatically catch and forward errors
   * to Express error handling middleware
   *
   * @param fn Async route handler function
   * @returns Wrapped function with automatic error handling
   *
   * @example
   * getItem = this.asyncHandler(async (req, res) => {
   *   const data = await fetchItem(req.params.id);
   *   this.respondSuccess(res, data);
   * });
   */
  protected asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Send a successful 200 OK response
   *
   * @param res Express response object
   * @param data Data to send in response
   * @param message Optional success message
   *
   * @example
   * this.respondSuccess(res, users, "Users fetched successfully");
   */
  protected respondSuccess(
    res: Response,
    data: any,
    message?: string
  ): void {
    ApiResponse.success(res, data, message);
  }

  /**
   * Send a successful 201 Created response
   *
   * @param res Express response object
   * @param data Data to send in response
   * @param message Optional success message
   *
   * @example
   * this.respondCreated(res, newUser, "User created successfully");
   */
  protected respondCreated(
    res: Response,
    data: any,
    message?: string
  ): void {
    ApiResponse.created(res, data, message);
  }

  /**
   * Send an error response with appropriate status code
   *
   * @param res Express response object
   * @param message Error message
   * @param status HTTP status code (default: 500)
   *
   * @example
   * this.respondError(res, "Item not found", 404);
   */
  protected respondError(
    res: Response,
    message: string,
    status: number = 500
  ): void {
    ApiResponse.error(res, message, status);
  }

  /**
   * Send a 400 Bad Request response
   *
   * @param res Express response object
   * @param message Error message
   *
   * @example
   * this.respondBadRequest(res, "Invalid parameters");
   */
  protected respondBadRequest(res: Response, message: string): void {
    ApiResponse.badRequest(res, message);
  }

  /**
   * Send a 404 Not Found response
   *
   * @param res Express response object
   * @param message Error message (default: "Resource not found")
   *
   * @example
   * this.respondNotFound(res, "User not found");
   */
  protected respondNotFound(res: Response, message?: string): void {
    ApiResponse.notFound(res, message);
  }

  /**
   * Send a 401 Unauthorized response
   *
   * @param res Express response object
   * @param message Error message (default: "Unauthorized")
   *
   * @example
   * this.respondUnauthorized(res, "Invalid token");
   */
  protected respondUnauthorized(res: Response, message?: string): void {
    ApiResponse.unauthorized(res, message);
  }

  /**
   * Send a 403 Forbidden response
   *
   * @param res Express response object
   * @param message Error message (default: "Forbidden")
   *
   * @example
   * this.respondForbidden(res, "You do not have permission");
   */
  protected respondForbidden(res: Response, message?: string): void {
    ApiResponse.forbidden(res, message);
  }

  /**
   * Validate and parse an ID parameter
   *
   * @param value Value to validate
   * @param fieldName Name of the field for error messages
   * @returns Validated numeric ID
   * @throws Error if validation fails
   *
   * @example
   * const userId = this.validateId(req.params.userId, "User ID");
   */
  protected validateId(value: string | undefined, fieldName: string): number {
    return utilValidateId(value, fieldName);
  }

  /**
   * Validate and parse a positive integer
   *
   * @param value Value to validate
   * @param fieldName Name of the field for error messages
   * @returns Validated positive integer
   * @throws Error if validation fails
   *
   * @example
   * const week = this.validatePositiveInteger(req.params.week, "Week");
   */
  protected validatePositiveInteger(
    value: string | undefined,
    fieldName: string
  ): number {
    return validatePositiveInteger(value, fieldName);
  }

  /**
   * Validate required fields are present in request body
   *
   * @param body Request body object
   * @param fields Array of required field names
   * @returns Object with validated fields or null if validation fails
   *
   * @example
   * const validated = this.validateRequiredFields(req.body, ['name', 'email']);
   * if (!validated) {
   *   this.respondBadRequest(res, "Missing required fields");
   *   return;
   * }
   */
  protected validateRequiredFields(
    body: any,
    fields: string[]
  ): { [key: string]: any } | null {
    const missing = fields.filter((field) => {
      const value = body[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
      return null;
    }

    const validated: { [key: string]: any } = {};
    fields.forEach((field) => {
      validated[field] = body[field];
    });

    return validated;
  }

  /**
   * Check if error is a validation error based on message content
   *
   * @param error Error object
   * @returns true if error appears to be a validation error
   *
   * @example
   * if (this.isValidationError(error)) {
   *   this.respondBadRequest(res, error.message);
   * } else {
   *   this.respondError(res, error.message);
   * }
   */
  protected isValidationError(error: any): boolean {
    return (
      error.message &&
      (error.message.includes(" ID") ||
        error.message.includes("must be") ||
        error.message.includes("required") ||
        error.message.includes("Invalid"))
    );
  }

  /**
   * Get authenticated user ID from request
   *
   * @param req Express request object
   * @returns User ID or null if not authenticated
   *
   * @example
   * const userId = this.getAuthenticatedUserId(req);
   * if (!userId) {
   *   this.respondUnauthorized(res);
   *   return;
   * }
   */
  protected getAuthenticatedUserId(req: Request): number | null {
    return req.user?.userId || null;
  }
}
