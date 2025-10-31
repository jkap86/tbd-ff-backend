import { Request, Response } from "express";
import { rolloverSeason } from "../services/dynastyService";
import { getLeagueById } from "../models/League";
import pool from "../config/database";

/**
 * Rollover dynasty league to new season
 * POST /api/v1/leagues/:leagueId/season/rollover
 */
export async function rolloverSeasonHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    // Verify league exists and is dynasty
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({ success: false, message: "League not found" });
      return;
    }

    if (league.league_type !== 'dynasty') {
      res.status(400).json({
        success: false,
        message: "Season rollover only available for dynasty leagues"
      });
      return;
    }

    // Verify user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can rollover the season"
      });
      return;
    }

    // Perform rollover
    const result = await rolloverSeason(parseInt(leagueId), userId);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: { newSeason: result.newSeason }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error("Error rolling over season:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to rollover season"
    });
  }
}

/**
 * Get season history for a league
 * GET /api/v1/leagues/:leagueId/season/history
 */
export async function getSeasonHistoryHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;

    const query = `
      SELECT
        sh.*,
        r.settings->>'team_name' as team_name,
        u.username
      FROM season_history sh
      INNER JOIN rosters r ON sh.roster_id = r.id
      INNER JOIN users u ON r.user_id = u.id
      WHERE sh.league_id = $1
      ORDER BY sh.season DESC, sh.final_rank ASC NULLS LAST
    `;

    const result = await pool.query(query, [parseInt(leagueId)]);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error("Error getting season history:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get season history"
    });
  }
}

/**
 * Get dynasty league status (current season, keeper deadline, etc.)
 * GET /api/v1/leagues/:leagueId/dynasty/status
 */
export async function getDynastyStatusHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;

    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({ success: false, message: "League not found" });
      return;
    }

    if (league.league_type !== 'dynasty') {
      res.status(400).json({
        success: false,
        message: "This is not a dynasty league"
      });
      return;
    }

    // Get keeper count for current season
    const currentSeason = league.current_season || league.season;
    const keeperCountQuery = await pool.query(
      `SELECT COUNT(*) as total_keepers, COUNT(*) FILTER (WHERE is_finalized = TRUE) as finalized_keepers
       FROM keeper_selections k
       INNER JOIN rosters r ON k.roster_id = r.id
       WHERE r.league_id = $1 AND k.season = $2`,
      [parseInt(leagueId), currentSeason]
    );

    const keeperStats = keeperCountQuery.rows[0];

    // Get season count
    const seasonCountQuery = await pool.query(
      `SELECT COUNT(DISTINCT season) as total_seasons
       FROM season_history
       WHERE league_id = $1`,
      [parseInt(leagueId)]
    );

    const totalSeasons = parseInt(seasonCountQuery.rows[0].total_seasons) + 1; // +1 for current season

    res.status(200).json({
      success: true,
      data: {
        league_type: league.league_type,
        current_season: currentSeason,
        total_seasons: totalSeasons,
        keeper_stats: {
          total_keepers: parseInt(keeperStats.total_keepers),
          finalized_keepers: parseInt(keeperStats.finalized_keepers)
        },
        status: league.status
      }
    });
  } catch (error: any) {
    console.error("Error getting dynasty status:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get dynasty status"
    });
  }
}
