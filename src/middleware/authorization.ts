import { Request, Response, NextFunction } from "express";
import { getLeagueById } from "../models/League";
import { getRosterById } from "../models/Roster";
import { getTrade } from "../models/Trade";
import pool from "../config/database";
import { createAuthMiddleware, createOrAuthMiddleware } from "./authFactory";
import { ApiResponse } from "../utils/ApiResponse";

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
    console.error("Authorization error:", error);
    ApiResponse.error(res, "Authorization check failed");
  }
}

/**
 * Check if user is commissioner of a league
 */
export const requireCommissioner = createAuthMiddleware({
  check: async (userId, leagueId) => {
    const league = await getLeagueById(leagueId);
    if (!league) return false;
    return league.settings?.commissioner_id === userId;
  },
  errorMessage: "Only the league commissioner can perform this action",
  resourceName: "League ID",
});

/**
 * Check if user is a member of a league
 */
export const requireLeagueMember = createAuthMiddleware({
  check: async (userId, leagueId) => {
    const query = `
      SELECT COUNT(*) as count
      FROM rosters
      WHERE league_id = $1 AND user_id = $2
    `;
    const result = await pool.query(query, [leagueId, userId]);
    return parseInt(result.rows[0].count) > 0;
  },
  errorMessage: "You are not a member of this league",
  resourceName: "League ID",
});

/**
 * Check if user owns a specific roster
 */
export const requireRosterOwnership = createAuthMiddleware({
  check: async (userId, rosterId) => {
    const roster = await getRosterById(rosterId);
    if (!roster) return false;
    return roster.user_id === userId;
  },
  errorMessage: "You do not own this roster",
  resourceName: "Roster ID",
});

/**
 * Check if user is involved in a trade (proposer or receiver)
 */
export const requireTradeParticipant = createAuthMiddleware({
  check: async (userId, tradeId) => {
    const trade = await getTrade(tradeId);
    if (!trade) return false;

    // Get rosters involved in trade
    const result = await pool.query(
      \`SELECT user_id FROM rosters WHERE id IN ($1, $2)\`,
      [trade.proposer_roster_id, trade.receiver_roster_id]
    );

    const participantUserIds = result.rows.map((row) => row.user_id);
    return participantUserIds.includes(userId);
  },
  errorMessage: "You are not a participant in this trade",
  resourceName: "Trade ID",
});

/**
 * Check if user is commissioner OR owner of the roster
 * Useful for operations that either role can perform
 */
export const requireCommissionerOrRosterOwner = createOrAuthMiddleware(
  [
    {
      // Check if user owns the roster
      check: async (userId, rosterId) => {
        const roster = await getRosterById(rosterId);
        if (!roster) return false;
        return roster.user_id === userId;
      },
      resourceName: "Roster ID",
    },
    {
      // Check if user is league commissioner
      check: async (userId, rosterId) => {
        const roster = await getRosterById(rosterId);
        if (!roster) return false;
        const league = await getLeagueById(roster.league_id);
        if (!league) return false;
        return league.settings?.commissioner_id === userId;
      },
      resourceName: "Roster ID",
    },
  ],
  "You must be the roster owner or league commissioner"
);
