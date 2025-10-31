import { Request, Response } from "express";
import {
  selectKeeper,
  removeKeeper,
  getKeepersByRoster,
  getKeepersByLeague
} from "../services/keeperService";
import { finalizeKeepers } from "../services/dynastyService";
import { getLeagueById } from "../models/League";

/**
 * Select a keeper for a roster
 * POST /api/v1/leagues/:leagueId/keepers
 */
export async function selectKeeperHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { roster_id, player_id, season, kept_from_season, draft_round_penalty } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    // Validate required fields
    if (!roster_id || !player_id || !season || !kept_from_season) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: roster_id, player_id, season, kept_from_season"
      });
      return;
    }

    // Verify league is dynasty/keeper type
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({ success: false, message: "League not found" });
      return;
    }

    if (league.league_type !== 'dynasty' && league.league_type !== 'keeper') {
      res.status(400).json({
        success: false,
        message: "Keeper selections only available for dynasty and keeper leagues"
      });
      return;
    }

    // Select keeper
    const keeper = await selectKeeper({
      roster_id,
      player_id,
      season,
      kept_from_season,
      draft_round_penalty: draft_round_penalty || null
    });

    res.status(201).json({
      success: true,
      message: "Keeper selected successfully",
      data: keeper
    });
  } catch (error: any) {
    console.error("Error selecting keeper:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to select keeper"
    });
  }
}

/**
 * Remove a keeper selection
 * DELETE /api/v1/leagues/:leagueId/keepers/:playerId
 */
export async function removeKeeperHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { playerId } = req.params;
    const { roster_id, season } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    if (!roster_id || !season) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: roster_id, season"
      });
      return;
    }

    const removed = await removeKeeper(roster_id, playerId, season);

    if (removed) {
      res.status(200).json({
        success: true,
        message: "Keeper removed successfully"
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Keeper not found"
      });
    }
  } catch (error: any) {
    console.error("Error removing keeper:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to remove keeper"
    });
  }
}

/**
 * Get all keepers for a league
 * GET /api/v1/leagues/:leagueId/keepers
 */
export async function getLeagueKeepersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season } = req.query;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season query parameter required"
      });
      return;
    }

    const keepers = await getKeepersByLeague(parseInt(leagueId), season as string);

    res.status(200).json({
      success: true,
      data: keepers
    });
  } catch (error: any) {
    console.error("Error getting league keepers:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get keepers"
    });
  }
}

/**
 * Get keepers for a specific roster
 * GET /api/v1/rosters/:rosterId/keepers
 */
export async function getRosterKeepersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { rosterId } = req.params;
    const { season } = req.query;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season query parameter required"
      });
      return;
    }

    const keepers = await getKeepersByRoster(parseInt(rosterId), season as string);

    res.status(200).json({
      success: true,
      data: keepers
    });
  } catch (error: any) {
    console.error("Error getting roster keepers:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get keepers"
    });
  }
}

/**
 * Finalize all keeper selections for a league (commissioner only)
 * POST /api/v1/leagues/:leagueId/keepers/finalize
 */
export async function finalizeKeepersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required"
      });
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({ success: false, message: "League not found" });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can finalize keepers"
      });
      return;
    }

    const result = await finalizeKeepers(parseInt(leagueId), season);

    res.status(200).json({
      success: result.success,
      message: result.message,
      data: { keeperCount: result.keeperCount }
    });
  } catch (error: any) {
    console.error("Error finalizing keepers:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to finalize keepers"
    });
  }
}
