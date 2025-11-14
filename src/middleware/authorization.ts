import { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "./authFactory";
import { ApiResponse } from "../utils/ApiResponse";
import { logger } from "../utils/logger";
import {
  checkLeagueMembership,
  checkLeagueCommissioner,
  checkRosterOwnership,
  checkTradeParticipation,
  checkCommissionerOrRosterOwner,
} from "../services/authorizationService";

/**
 * Check if user has system-wide admin privileges
 * Used for global operations like data sync, recalculations, etc.
 * Note: This is kept as a custom function since it doesn't follow the resource-based pattern
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const isAdmin = req.user?.isAdmin;

    if (!userId) {
      ApiResponse.unauthorized(res, "Authentication required");
      return;
    }

    if (!isAdmin) {
      ApiResponse.forbidden(
        res,
        "Admin privileges required. This operation is restricted to system administrators."
      );
      return;
    }

    // User is admin, proceed
    next();
  } catch (error: any) {
    logger.error("Authorization error:", error);
    ApiResponse.error(res, "Authorization check failed");
  }
}

/**
 * Check if user is commissioner of a league
 */
export const requireCommissioner = createAuthMiddleware({
  check: checkLeagueCommissioner,
  errorMessage: "Only the league commissioner can perform this action",
  resourceName: "League ID",
});

/**
 * Check if user is a member of a league
 */
export const requireLeagueMember = createAuthMiddleware({
  check: checkLeagueMembership,
  errorMessage: "You are not a member of this league",
  resourceName: "League ID",
});

/**
 * Check if user owns a specific roster
 */
export const requireRosterOwnership = createAuthMiddleware({
  check: checkRosterOwnership,
  errorMessage: "You do not own this roster",
  resourceName: "Roster ID",
});

/**
 * Check if user is involved in a trade (proposer or receiver)
 */
export const requireTradeParticipant = createAuthMiddleware({
  check: checkTradeParticipation,
  errorMessage: "You are not a participant in this trade",
  resourceName: "Trade ID",
});

/**
 * Check if user is commissioner OR owner of the roster
 * Useful for operations that either role can perform
 */
export const requireCommissionerOrRosterOwner = createAuthMiddleware({
  check: checkCommissionerOrRosterOwner,
  errorMessage: "You must be the roster owner or league commissioner",
  resourceName: "Roster ID",
});
