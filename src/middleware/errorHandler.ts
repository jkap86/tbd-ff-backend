import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";

export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  // Log unexpected errors
  console.error("[Unexpected Error]", error);

  // Don't leak error details in production
  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : error.message;

  return res.status(500).json({
    success: false,
    message,
  });
}
