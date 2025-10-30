import { Request, Response, NextFunction } from "express";
import { getLeagueById } from "../models/League";
import { getRosterById } from "../models/Roster";
import { getTrade } from "../models/Trade";
import pool from "../config/database";

/**
 * Check if user is commissioner of a league
 */
export async function requireCommissioner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId || req.body.leagueId);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!leagueId || isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Extract commissioner_id from league settings
    const commissionerId = league.settings?.commissioner_id;

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the league commissioner can perform this action",
      });
      return;
    }

    // User is commissioner, proceed
    next();
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user is a member of a league
 */
export async function requireLeagueMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId || req.body.leagueId || req.params.id);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!leagueId || isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Check if user has a roster in this league
    const query = `
      SELECT COUNT(*) as count
      FROM rosters
      WHERE league_id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [leagueId, userId]);
    const isMember = parseInt(result.rows[0].count) > 0;

    if (!isMember) {
      res.status(403).json({
        success: false,
        message: "You are not a member of this league",
      });
      return;
    }

    // User is member, proceed
    next();
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user owns a specific roster
 */
export async function requireRosterOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rosterId = parseInt(req.params.rosterId || req.params.id || req.body.rosterId);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!rosterId || isNaN(rosterId)) {
      res.status(400).json({
        success: false,
        message: "Invalid roster ID",
      });
      return;
    }

    const roster = await getRosterById(rosterId);

    if (!roster) {
      res.status(404).json({
        success: false,
        message: "Roster not found",
      });
      return;
    }

    if (roster.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "You do not own this roster",
      });
      return;
    }

    // User owns roster, proceed
    next();
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user is involved in a trade (proposer or receiver)
 */
export async function requireTradeParticipant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tradeId = parseInt(req.params.tradeId || req.params.id || req.body.tradeId);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!tradeId || isNaN(tradeId)) {
      res.status(400).json({
        success: false,
        message: "Invalid trade ID",
      });
      return;
    }

    const trade = await getTrade(tradeId);

    if (!trade) {
      res.status(404).json({
        success: false,
        message: "Trade not found",
      });
      return;
    }

    // Get rosters involved in trade
    const result = await pool.query(
      `SELECT user_id FROM rosters WHERE id IN ($1, $2)`,
      [trade.proposer_roster_id, trade.receiver_roster_id]
    );

    const participantUserIds = result.rows.map((row) => row.user_id);

    if (!participantUserIds.includes(userId)) {
      res.status(403).json({
        success: false,
        message: "You are not a participant in this trade",
      });
      return;
    }

    // User is participant, proceed
    next();
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user is commissioner OR owner of the roster
 * Useful for operations that either role can perform
 */
export async function requireCommissionerOrRosterOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rosterId = parseInt(req.params.rosterId || req.params.id || req.body.rosterId);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!rosterId || isNaN(rosterId)) {
      res.status(400).json({
        success: false,
        message: "Invalid roster ID",
      });
      return;
    }

    const roster = await getRosterById(rosterId);

    if (!roster) {
      res.status(404).json({
        success: false,
        message: "Roster not found",
      });
      return;
    }

    // Check if user owns the roster
    if (roster.user_id === userId) {
      next();
      return;
    }

    // Check if user is league commissioner
    const league = await getLeagueById(roster.league_id);
    if (league && league.settings?.commissioner_id === userId) {
      next();
      return;
    }

    // User is neither owner nor commissioner
    res.status(403).json({
      success: false,
      message: "You must be the roster owner or league commissioner",
    });
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}
