// BEFORE refactor: 386 lines
// AFTER refactor: 227 lines
// LINES SAVED: 159 lines

import { Request, Response } from "express";
import { getLeagueMedianSettings, updateLeagueMedianSettings } from "../models/LeagueMedianSettings";
import {
  calculateWeekMedian,
  generateMedianMatchups,
  updateMedianMatchupResults,
  generateSeasonMedianMatchups,
} from "../services/leagueMedianService";
import { getLeagueById } from "../models/League";
import { BaseController } from "./BaseController";

class LeagueMedianController extends BaseController {
  /**
   * GET /api/league-median/league/:leagueId/settings
   * Get league median settings for a league
   */
  getSettings = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const settings = await getLeagueMedianSettings(leagueId);

    if (!settings) {
      this.respondNotFound(res, "League median settings not found for this league");
      return;
    }

    this.respondSuccess(res, settings);
  });

  /**
   * POST /api/league-median/league/:leagueId/settings
   * Update league median settings (commissioner only)
   */
  updateSettings = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(leagueId);
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only the commissioner can update league median settings");
      return;
    }

    // Validate request body
    const { enable_league_median, median_matchup_week_start, median_matchup_week_end } = req.body;

    // Validate week range
    if (median_matchup_week_start !== undefined) {
      if (typeof median_matchup_week_start !== "number" || median_matchup_week_start < 1 || median_matchup_week_start > 18) {
        this.respondBadRequest(res, "median_matchup_week_start must be between 1 and 18");
        return;
      }
    }

    if (median_matchup_week_end !== undefined) {
      if (typeof median_matchup_week_end !== "number" || median_matchup_week_end < 1 || median_matchup_week_end > 18) {
        this.respondBadRequest(res, "median_matchup_week_end must be between 1 and 18");
        return;
      }
    }

    // Validate week_end >= week_start
    if (median_matchup_week_start !== undefined && median_matchup_week_end !== undefined) {
      if (median_matchup_week_start > median_matchup_week_end) {
        this.respondBadRequest(res, "median_matchup_week_end must be greater than or equal to median_matchup_week_start");
        return;
      }
    }

    // Update settings
    const updatedSettings = await updateLeagueMedianSettings(leagueId, {
      enable_league_median,
      median_matchup_week_start,
      median_matchup_week_end,
    });

    this.respondSuccess(res, updatedSettings, "League median settings updated successfully");
  });

  /**
   * POST /api/league-median/league/:leagueId/generate
   * Generate median matchups for a week or entire season (commissioner only)
   */
  generateMatchups = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { season, week } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    // Verify commissioner
    const league = await getLeagueById(leagueId);
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only the commissioner can generate median matchups");
      return;
    }

    // Check if league median is enabled
    const settings = await getLeagueMedianSettings(leagueId);
    if (!settings || !settings.enable_league_median) {
      this.respondBadRequest(res, "League median must be enabled before generating matchups");
      return;
    }

    // Generate matchups for single week or full season
    if (week !== undefined) {
      // Validate week
      if (typeof week !== "number" || week < 1 || week > 18) {
        this.respondBadRequest(res, "Week must be between 1 and 18");
        return;
      }

      const matchupsCreated = await generateMedianMatchups(leagueId, week, season);

      this.respondCreated(res, {
        weeks_generated: 1,
        matchups_created: matchupsCreated,
      }, `Median matchups generated for week ${week}`);
    } else {
      // Generate for full season
      const result = await generateSeasonMedianMatchups(leagueId, season);

      this.respondCreated(res, {
        weeks_generated: result.weeks_generated,
        matchups_created: result.matchups_created,
      }, "Median matchups generated for entire season");
    }
  });

  /**
   * GET /api/league-median/league/:leagueId/week/:week/median
   * Get the median score for a specific week
   */
  getWeekMedian = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const weekNum = this.validatePositiveInteger(req.params.week, "Week");

    if (weekNum < 1 || weekNum > 18) {
      this.respondBadRequest(res, "Week must be between 1 and 18");
      return;
    }

    const medianScore = await calculateWeekMedian(leagueId, weekNum);

    this.respondSuccess(res, {
      league_id: leagueId,
      week: weekNum,
      median_score: medianScore,
    });
  });

  /**
   * POST /api/league-median/league/:leagueId/week/:week/update-results
   * Update median matchup results for a specific week (commissioner only)
   */
  updateResults = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const weekNum = this.validatePositiveInteger(req.params.week, "Week");
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    if (weekNum < 1 || weekNum > 18) {
      this.respondBadRequest(res, "Week must be between 1 and 18");
      return;
    }

    // Verify commissioner
    const league = await getLeagueById(leagueId);
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only the commissioner can update median results");
      return;
    }

    const matchupsUpdated = await updateMedianMatchupResults(leagueId, weekNum);

    this.respondSuccess(res, {
      matchups_updated: matchupsUpdated,
    }, `Median matchup results updated for week ${weekNum}`);
  });
}

const controller = new LeagueMedianController();

export const getLeagueMedianSettingsHandler = controller.getSettings;
export const updateLeagueMedianSettingsHandler = controller.updateSettings;
export const generateMedianMatchupsHandler = controller.generateMatchups;
export const getWeekMedianHandler = controller.getWeekMedian;
export const updateMedianResultsHandler = controller.updateResults;
