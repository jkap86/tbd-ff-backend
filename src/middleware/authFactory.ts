import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/ApiResponse";

/**
 * Configuration for creating authorization middleware
 */
interface AuthorizationConfig {
  /**
   * The authorization check function
   * @param userId The authenticated user's ID
   * @param resourceId The resource ID being accessed (league, roster, trade, etc.)
   * @param req The full request object for complex checks
   * @returns true if authorized, false otherwise
   */
  check: (userId: number, resourceId: number, req: Request) => Promise<boolean>;

  /**
   * Error message to display when authorization fails
   */
  errorMessage: string;

  /**
   * Function to extract resource ID from request
   * Defaults to checking common parameter names
   */
  getResourceId?: (req: Request) => number | undefined;

  /**
   * Custom resource name for validation errors (default: "Resource ID")
   */
  resourceName?: string;
}

/**
 * Default function to extract resource ID from common request locations
 */
const defaultGetResourceId = (req: Request): number | undefined => {
  const id =
    req.params.leagueId ||
    req.params.rosterId ||
    req.params.tradeId ||
    req.params.id ||
    req.body.leagueId ||
    req.body.rosterId ||
    req.body.tradeId;

  if (!id) return undefined;

  const parsed = parseInt(id, 10);
  return isNaN(parsed) ? undefined : parsed;
};

/**
 * Factory function to create standardized authorization middleware
 * Eliminates repetitive authentication checks, ID validation, and error handling
 *
 * @param config Authorization configuration
 * @returns Express middleware function
 *
 * @example
 * export const requireCommissioner = createAuthMiddleware({
 *   check: async (userId, leagueId) => {
 *     const league = await getLeagueById(leagueId);
 *     return league?.settings?.commissioner_id === userId;
 *   },
 *   errorMessage: "Only the league commissioner can perform this action",
 * });
 */
export const createAuthMiddleware = (config: AuthorizationConfig) => {
  const {
    check,
    errorMessage,
    getResourceId = defaultGetResourceId,
    resourceName = "Resource ID",
  } = config;

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if user is authenticated
      const userId = req.user?.userId;
      if (!userId) {
        ApiResponse.unauthorized(res, "Authentication required");
        return;
      }

      // Extract and validate resource ID
      const resourceId = getResourceId(req);
      if (resourceId === undefined || isNaN(resourceId) || resourceId <= 0) {
        ApiResponse.badRequest(res, `Invalid ${resourceName}`);
        return;
      }

      // Perform authorization check
      const isAuthorized = await check(userId, resourceId, req);

      if (!isAuthorized) {
        ApiResponse.forbidden(res, errorMessage);
        return;
      }

      // Authorization successful, proceed to next middleware
      next();
    } catch (error: any) {
      console.error("Authorization error:", error);
      ApiResponse.error(res, "Authorization check failed");
    }
  };
};

/**
 * Creates authorization middleware that checks multiple conditions
 * User is authorized if ANY of the conditions pass (OR logic)
 *
 * @param configs Array of authorization configurations
 * @param errorMessage Error message if all conditions fail
 * @returns Express middleware function
 *
 * @example
 * export const requireCommissionerOrRosterOwner = createOrAuthMiddleware(
 *   [
 *     {
 *       check: async (userId, rosterId) => {
 *         const roster = await getRosterById(rosterId);
 *         return roster?.user_id === userId;
 *       }
 *     },
 *     {
 *       check: async (userId, rosterId) => {
 *         const roster = await getRosterById(rosterId);
 *         const league = await getLeagueById(roster.league_id);
 *         return league?.settings?.commissioner_id === userId;
 *       }
 *     }
 *   ],
 *   "You must be the roster owner or league commissioner"
 * );
 */
export const createOrAuthMiddleware = (
  configs: Omit<AuthorizationConfig, "errorMessage">[],
  errorMessage: string
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ApiResponse.unauthorized(res, "Authentication required");
        return;
      }

      const getResourceId =
        configs[0].getResourceId || defaultGetResourceId;
      const resourceId = getResourceId(req);

      if (resourceId === undefined || isNaN(resourceId) || resourceId <= 0) {
        ApiResponse.badRequest(
          res,
          `Invalid ${configs[0].resourceName || "Resource ID"}`
        );
        return;
      }

      // Check each condition until one passes
      for (const config of configs) {
        const isAuthorized = await config.check(userId, resourceId, req);
        if (isAuthorized) {
          next();
          return;
        }
      }

      // None of the conditions passed
      ApiResponse.forbidden(res, errorMessage);
    } catch (error: any) {
      console.error("Authorization error:", error);
      ApiResponse.error(res, "Authorization check failed");
    }
  };
};
