import { Request, Response } from "express";
import { getLeagueMedianSettings, updateLeagueMedianSettings } from "../models/LeagueMedianSettings";
import {
  calculateWeekMedian,
  generateMedianMatchups,
  updateMedianMatchupResults,
  generateSeasonMedianMatchups,
} from "../services/leagueMedianService";
import { getLeagueById } from "../models/League";

/**
 * GET /api/league-median/league/:leagueId/settings
 * Get league median settings for a league
 */
export async function getLeagueMedianSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    const settings = await getLeagueMedianSettings(parseInt(leagueId));

    if (!settings) {
      res.status(404).json({
        success: false,
        message: "League median settings not found for this league",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error("Error getting league median settings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting league median settings",
    });
  }
}

/**
 * POST /api/league-median/league/:leagueId/settings
 * Update league median settings (commissioner only)
 */
export async function updateLeagueMedianSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can update league median settings",
      });
      return;
    }

    // Validate request body
    const { enable_league_median, median_matchup_week_start, median_matchup_week_end } = req.body;

    // Validate week range
    if (median_matchup_week_start !== undefined) {
      if (typeof median_matchup_week_start !== "number" || median_matchup_week_start < 1 || median_matchup_week_start > 18) {
        res.status(400).json({
          success: false,
          message: "median_matchup_week_start must be between 1 and 18",
        });
        return;
      }
    }

    if (median_matchup_week_end !== undefined) {
      if (typeof median_matchup_week_end !== "number" || median_matchup_week_end < 1 || median_matchup_week_end > 18) {
        res.status(400).json({
          success: false,
          message: "median_matchup_week_end must be between 1 and 18",
        });
        return;
      }
    }

    // Validate week_end >= week_start
    if (median_matchup_week_start !== undefined && median_matchup_week_end !== undefined) {
      if (median_matchup_week_start > median_matchup_week_end) {
        res.status(400).json({
          success: false,
          message: "median_matchup_week_end must be greater than or equal to median_matchup_week_start",
        });
        return;
      }
    }

    // Update settings
    const updatedSettings = await updateLeagueMedianSettings(parseInt(leagueId), {
      enable_league_median,
      median_matchup_week_start,
      median_matchup_week_end,
    });

    res.status(200).json({
      success: true,
      data: updatedSettings,
      message: "League median settings updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating league median settings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating league median settings",
    });
  }
}

/**
 * POST /api/league-median/league/:leagueId/generate
 * Generate median matchups for a week or entire season (commissioner only)
 */
export async function generateMedianMatchupsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season, week } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    // Verify commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can generate median matchups",
      });
      return;
    }

    // Check if league median is enabled
    const settings = await getLeagueMedianSettings(parseInt(leagueId));
    if (!settings || !settings.enable_league_median) {
      res.status(400).json({
        success: false,
        message: "League median must be enabled before generating matchups",
      });
      return;
    }

    // Generate matchups for single week or full season
    if (week !== undefined) {
      // Validate week
      if (typeof week !== "number" || week < 1 || week > 18) {
        res.status(400).json({
          success: false,
          message: "Week must be between 1 and 18",
        });
        return;
      }

      const matchupsCreated = await generateMedianMatchups(parseInt(leagueId), week, season);

      res.status(201).json({
        success: true,
        data: {
          weeks_generated: 1,
          matchups_created: matchupsCreated,
        },
        message: `Median matchups generated for week ${week}`,
      });
    } else {
      // Generate for full season
      const result = await generateSeasonMedianMatchups(parseInt(leagueId), season);

      res.status(201).json({
        success: true,
        data: {
          weeks_generated: result.weeks_generated,
          matchups_created: result.matchups_created,
        },
        message: "Median matchups generated for entire season",
      });
    }
  } catch (error: any) {
    console.error("Error generating median matchups:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating median matchups",
    });
  }
}

/**
 * GET /api/league-median/league/:leagueId/week/:week/median
 * Get the median score for a specific week
 */
export async function getWeekMedianHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId, week } = req.params;

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!week || isNaN(parseInt(week))) {
      res.status(400).json({
        success: false,
        message: "Invalid week",
      });
      return;
    }

    const weekNum = parseInt(week);
    if (weekNum < 1 || weekNum > 18) {
      res.status(400).json({
        success: false,
        message: "Week must be between 1 and 18",
      });
      return;
    }

    const medianScore = await calculateWeekMedian(parseInt(leagueId), weekNum);

    res.status(200).json({
      success: true,
      data: {
        league_id: parseInt(leagueId),
        week: weekNum,
        median_score: medianScore,
      },
    });
  } catch (error: any) {
    console.error("Error calculating week median:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error calculating week median",
    });
  }
}

/**
 * POST /api/league-median/league/:leagueId/week/:week/update-results
 * Update median matchup results for a specific week (commissioner only)
 */
export async function updateMedianResultsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId, week } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!week || isNaN(parseInt(week))) {
      res.status(400).json({
        success: false,
        message: "Invalid week",
      });
      return;
    }

    const weekNum = parseInt(week);
    if (weekNum < 1 || weekNum > 18) {
      res.status(400).json({
        success: false,
        message: "Week must be between 1 and 18",
      });
      return;
    }

    // Verify commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can update median results",
      });
      return;
    }

    const matchupsUpdated = await updateMedianMatchupResults(parseInt(leagueId), weekNum);

    res.status(200).json({
      success: true,
      data: {
        matchups_updated: matchupsUpdated,
      },
      message: `Median matchup results updated for week ${weekNum}`,
    });
  } catch (error: any) {
    console.error("Error updating median results:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating median results",
    });
  }
}
