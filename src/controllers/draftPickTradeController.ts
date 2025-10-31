import { Request, Response } from "express";
import {
  proposeTrade,
  acceptTrade,
  declineTrade,
  getTradeablePicksByRoster,
  getTradesByLeague
} from "../services/draftPickTradeService";
import { getLeagueById } from "../models/League";

/**
 * Propose a draft pick trade
 * POST /api/v1/leagues/:leagueId/draft-picks/trade
 */
export async function proposeDraftPickTradeHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { from_roster_id, to_roster_id, season, round, original_roster_id } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    // Validate required fields
    if (!from_roster_id || !to_roster_id || !season || !round) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: from_roster_id, to_roster_id, season, round"
      });
      return;
    }

    // Verify league is dynasty
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({ success: false, message: "League not found" });
      return;
    }

    if (league.league_type !== 'dynasty') {
      res.status(400).json({
        success: false,
        message: "Draft pick trading only available for dynasty leagues"
      });
      return;
    }

    // Propose trade
    const trade = await proposeTrade({
      league_id: parseInt(leagueId),
      from_roster_id,
      to_roster_id,
      season,
      round,
      original_roster_id
    });

    res.status(201).json({
      success: true,
      message: "Draft pick trade proposed successfully",
      data: trade
    });
  } catch (error: any) {
    console.error("Error proposing draft pick trade:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to propose trade"
    });
  }
}

/**
 * Accept a draft pick trade
 * POST /api/v1/draft-picks/trade/:tradeId/accept
 */
export async function acceptDraftPickTradeHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { tradeId } = req.params;
    const { roster_id } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    if (!roster_id) {
      res.status(400).json({
        success: false,
        message: "roster_id is required"
      });
      return;
    }

    const trade = await acceptTrade(parseInt(tradeId), roster_id);

    res.status(200).json({
      success: true,
      message: "Draft pick trade accepted",
      data: trade
    });
  } catch (error: any) {
    console.error("Error accepting draft pick trade:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to accept trade"
    });
  }
}

/**
 * Decline a draft pick trade
 * POST /api/v1/draft-picks/trade/:tradeId/decline
 */
export async function declineDraftPickTradeHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { tradeId } = req.params;
    const { roster_id } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    if (!roster_id) {
      res.status(400).json({
        success: false,
        message: "roster_id is required"
      });
      return;
    }

    const trade = await declineTrade(parseInt(tradeId), roster_id);

    res.status(200).json({
      success: true,
      message: "Draft pick trade declined",
      data: trade
    });
  } catch (error: any) {
    console.error("Error declining draft pick trade:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to decline trade"
    });
  }
}

/**
 * Get all draft pick trades for a league
 * GET /api/v1/leagues/:leagueId/draft-picks/trades
 */
export async function getLeagueDraftPickTradesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;

    const trades = await getTradesByLeague(parseInt(leagueId));

    res.status(200).json({
      success: true,
      data: trades
    });
  } catch (error: any) {
    console.error("Error getting draft pick trades:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get trades"
    });
  }
}

/**
 * Get tradeable picks for a roster
 * GET /api/v1/rosters/:rosterId/draft-picks/tradeable
 */
export async function getTradeablePicksHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { rosterId } = req.params;
    const { league_id, season } = req.query;

    if (!league_id || !season) {
      res.status(400).json({
        success: false,
        message: "league_id and season query parameters required"
      });
      return;
    }

    const picks = await getTradeablePicksByRoster(
      parseInt(rosterId),
      parseInt(league_id as string),
      season as string
    );

    res.status(200).json({
      success: true,
      data: picks
    });
  } catch (error: any) {
    console.error("Error getting tradeable picks:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get tradeable picks"
    });
  }
}
