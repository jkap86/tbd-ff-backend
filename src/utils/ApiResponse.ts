import { Response } from "express";

/**
 * Standardized API response utility class
 * Eliminates repetitive res.status().json() calls across controllers
 */
export class ApiResponse {
  /**
   * Send a successful response
   * @param res Express response object
   * @param data Data to send in response
   * @param message Optional success message
   * @param status HTTP status code (default: 200)
   */
  static success(
    res: Response,
    data: any,
    message?: string,
    status: number = 200
  ): void {
    res.status(status).json({
      success: true,
      data,
      ...(message && { message }),
    });
  }

  /**
   * Send an error response
   * @param res Express response object
   * @param message Error message
   * @param status HTTP status code (default: 500)
   */
  static error(res: Response, message: string, status: number = 500): void {
    res.status(status).json({
      success: false,
      message,
    });
  }

  /**
   * Send a 400 Bad Request response
   * @param res Express response object
   * @param message Error message
   */
  static badRequest(res: Response, message: string): void {
    this.error(res, message, 400);
  }

  /**
   * Send a 401 Unauthorized response
   * @param res Express response object
   * @param message Error message (default: "Unauthorized")
   */
  static unauthorized(
    res: Response,
    message: string = "Unauthorized"
  ): void {
    this.error(res, message, 401);
  }

  /**
   * Send a 403 Forbidden response
   * @param res Express response object
   * @param message Error message (default: "Forbidden")
   */
  static forbidden(res: Response, message: string = "Forbidden"): void {
    this.error(res, message, 403);
  }

  /**
   * Send a 404 Not Found response
   * @param res Express response object
   * @param message Error message (default: "Resource not found")
   */
  static notFound(
    res: Response,
    message: string = "Resource not found"
  ): void {
    this.error(res, message, 404);
  }

  /**
   * Send a 201 Created response
   * @param res Express response object
   * @param data Data to send in response
   * @param message Optional success message
   */
  static created(res: Response, data: any, message?: string): void {
    this.success(res, data, message, 201);
  }

  /**
   * Send a 204 No Content response
   * @param res Express response object
   */
  static noContent(res: Response): void {
    res.status(204).send();
  }
}
