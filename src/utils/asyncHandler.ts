import { Request, Response, NextFunction } from "express";

/**
 * Async handler wrapper for Express route handlers
 * Automatically catches errors and forwards them to Express error handling middleware
 * Eliminates the need for try-catch blocks in every controller function
 *
 * @param fn Async route handler function
 * @returns Wrapped function that handles errors
 *
 * @example
 * export const getLeagues = asyncHandler(async (req, res) => {
 *   const leagues = await getLeaguesForUser(req.params.userId);
 *   ApiResponse.success(res, leagues);
 * });
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
