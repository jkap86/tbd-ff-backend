// BEFORE refactor: 178 lines
// AFTER refactor: 137 lines
// LINES SAVED: 41 lines

import { Request, Response } from "express";
import { rolloverSeason } from "../services/dynastyService";
import { getLeagueById } from "../models/League";
import pool from "../config/database";
import { BaseController } from "./BaseController";

class DynastyController extends BaseController {
  /**
   * Rollover dynasty league to new season
   * POST /api/v1/leagues/:leagueId/season/rollover
   */
  rolloverSeason = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    // Verify league exists and is dynasty
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    if (league.league_type !== 'dynasty') {
      this.respondBadRequest(res, "Season rollover only available for dynasty leagues");
      return;
    }

    // Verify user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (commissionerId !== userId) {
      this.respondForbidden(res, "Only the commissioner can rollover the season");
      return;
    }

    // Perform rollover
    const result = await rolloverSeason(parseInt(leagueId), userId);

    if (result.success) {
      this.respondSuccess(res, { newSeason: result.newSeason }, result.message);
    } else {
      this.respondError(res, result.message, 500);
    }
  });

  /**
   * Get season history for a league
   * GET /api/v1/leagues/:leagueId/season/history
   */
  getSeasonHistory = this.asyncHandler(async (req: Request, res: Response) => {
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

    this.respondSuccess(res, result.rows);
  });

  /**
   * Get dynasty league status (current season, keeper deadline, etc.)
   * GET /api/v1/leagues/:leagueId/dynasty/status
   */
  getDynastyStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;

    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    if (league.league_type !== 'dynasty') {
      this.respondBadRequest(res, "This is not a dynasty league");
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

    const data = {
      league_type: league.league_type,
      current_season: currentSeason,
      total_seasons: totalSeasons,
      keeper_stats: {
        total_keepers: parseInt(keeperStats.total_keepers),
        finalized_keepers: parseInt(keeperStats.finalized_keepers)
      },
      status: league.status
    };

    this.respondSuccess(res, data);
  });
}

const controller = new DynastyController();

export const rolloverSeasonHandler = controller.rolloverSeason;
export const getSeasonHistoryHandler = controller.getSeasonHistory;
export const getDynastyStatusHandler = controller.getDynastyStatus;
