// REFACTORED: Using BaseController pattern to eliminate repetitive try-catch blocks
// Before: 556 lines | After: 318 lines | Saved: 238 lines

import { Request, Response } from "express";
import {
  getMatchupsByLeagueAndWeek,
  getMatchupsByLeague,
  generateMatchupsForWeek,
  deleteMatchupsForWeek,
  deleteMatchupsForLeague,
  getMatchupDetails,
  getMatchupDetailsWithScores,
} from "../models/Matchup";
import { updateMatchupScoresForWeek } from "../services/scoringService";
import { syncSleeperStatsForWeek } from "../services/sleeperStatsService";
import { finalizeWeekScores, recalculateAllRecords } from "../services/recordService";
import { generateFullSeasonSchedule } from "../services/scheduleGeneratorService";
import { getLeagueById } from "../models/League";
import { getOrCreateWeeklyLineup, updateWeeklyLineup } from "../models/WeeklyLineup";
import { getRostersByLeagueId } from "../models/Roster";
import { logger } from "../config/logger";
import { BaseController } from "./BaseController";

// Simple in-memory cache for last update times
const lastUpdateCache = new Map<string, number>();
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

class MatchupController extends BaseController {
  /**
   * Get all matchups for a league and specific week
   * GET /api/matchups/league/:leagueId/week/:week
   * Automatically updates scores when loading (with rate limiting)
   */
  getMatchupsForWeek = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { leagueId, week } = req.params;
    const { season, season_type = "regular", force_update = "false" } = req.query;

    const leagueIdNum = this.validateId(leagueId, "League ID");
    const weekNum = this.validatePositiveInteger(week, "Week");

    // Check if we should update scores
    const cacheKey = `${leagueIdNum}-${weekNum}-${season}`;
    const lastUpdate = lastUpdateCache.get(cacheKey) || 0;
    const now = Date.now();
    const shouldUpdate = force_update === "true" || now - lastUpdate > UPDATE_INTERVAL;

    // Auto-update scores if season is provided and enough time has passed
    if (season && shouldUpdate) {
      // Trigger update in background (don't wait for it)
      updateScoresInBackground(
        leagueIdNum,
        weekNum,
        season as string,
        season_type as string,
        cacheKey
      ).catch((error) => {
        logger.error("[AutoUpdate] Background update failed:", error);
      });
    }

    // Return matchups immediately (don't wait for score update)
    const matchups = await getMatchupsByLeagueAndWeek(leagueIdNum, weekNum);

    res.status(200).json({
      success: true,
      data: matchups,
      meta: {
        last_updated: lastUpdate,
        cache_age_seconds: Math.floor((now - lastUpdate) / 1000),
      },
    });
  });

  /**
   * Get all matchups for a league (all weeks)
   * GET /api/matchups/league/:leagueId
   */
  getAllMatchupsForLeague = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueIdNum = this.validateId(req.params.leagueId, "League ID");
    const matchups = await getMatchupsByLeague(leagueIdNum);
    this.respondSuccess(res, matchups);
  });

  /**
   * Generate matchups for a specific week
   * POST /api/matchups/league/:leagueId/week/:week/generate
   */
  generateMatchups = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { leagueId, week } = req.params;
    const { season } = req.body;

    const leagueIdNum = this.validateId(leagueId, "League ID");
    const weekNum = this.validatePositiveInteger(week, "Week");

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    // Delete existing matchups for this week (if regenerating)
    await deleteMatchupsForWeek(leagueIdNum, weekNum);

    // Generate new matchups
    const matchups = await generateMatchupsForWeek(leagueIdNum, weekNum, season);

    this.respondCreated(res, matchups, `Generated ${matchups.length} matchups for week ${weekNum}`);
  });

  /**
   * Sync stats and update scores for a specific week
   * POST /api/matchups/league/:leagueId/week/:week/update-scores
   */
  updateScoresForWeek = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { leagueId, week } = req.params;
    const { season, season_type = "regular" } = req.body;

    const leagueIdNum = this.validateId(leagueId, "League ID");
    const weekNum = this.validatePositiveInteger(week, "Week");

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    // First, sync stats from Sleeper
    logger.info(`Syncing stats for week ${weekNum}...`);
    const statsResult = await syncSleeperStatsForWeek(season, weekNum, season_type);

    // Then, update matchup scores
    logger.info(`Updating matchup scores for week ${weekNum}...`);
    await updateMatchupScoresForWeek(leagueIdNum, weekNum, season, season_type);

    // Finally, finalize scores if week is complete
    logger.info(`Checking if week ${weekNum} should be finalized...`);
    await finalizeWeekScores(leagueIdNum, weekNum, season, season_type);

    res.status(200).json({
      success: true,
      message: `Updated scores for week ${weekNum}`,
      stats: {
        synced: statsResult.synced,
        failed: statsResult.failed,
      },
    });
  });

  /**
   * Get detailed matchup information with rosters and players
   * GET /api/matchups/:matchupId/details
   */
  getMatchupDetailsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const matchupIdNum = this.validateId(req.params.matchupId, "Matchup ID");
    const details = await getMatchupDetails(matchupIdNum);

    if (!details) {
      this.respondNotFound(res, "Matchup not found");
      return;
    }

    this.respondSuccess(res, details);
  });

  /**
   * Get detailed matchup information with player scores
   * GET /api/matchups/:matchupId/scores
   */
  getMatchupScoresHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const matchupIdNum = this.validateId(req.params.matchupId, "Matchup ID");
    const details = await getMatchupDetailsWithScores(matchupIdNum);

    if (!details) {
      this.respondNotFound(res, "Matchup not found");
      return;
    }

    this.respondSuccess(res, details);
  });

  /**
   * Recalculate all records for a league from completed matchups
   * POST /api/matchups/league/:leagueId/recalculate-records
   */
  recalculateRecordsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { season } = req.body;
    const leagueIdNum = this.validateId(req.params.leagueId, "League ID");

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    logger.info(`Recalculating records for league ${leagueIdNum}, season ${season}...`);
    await recalculateAllRecords(leagueIdNum, season);

    this.respondSuccess(res, null, "Records recalculated successfully");
  });

  /**
   * Generate matchups for entire regular season using round-robin algorithm
   * POST /api/matchups/league/:leagueId/generate-season
   */
  generateFullSeasonMatchups = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { season, regenerate = false } = req.body;
    const leagueIdNum = this.validateId(req.params.leagueId, "League ID");

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    // Get league to access settings
    const league = await getLeagueById(leagueIdNum);
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const settings = league.settings || {};
    const startWeek = settings.start_week || 1;
    const playoffWeekStart = settings.playoff_week_start || 15;
    const endWeek = playoffWeekStart - 1; // Regular season ends before playoffs

    logger.info(
      `[GenerateFullSeason] Generating matchups for league ${leagueIdNum}, weeks ${startWeek}-${endWeek}...`
    );

    // Generate the full season schedule
    const result = await generateFullSeasonSchedule(
      leagueIdNum,
      season,
      startWeek,
      endWeek,
      regenerate
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        errors: result.errors,
      });
      return;
    }

    // Auto-populate weekly lineups for all weeks
    logger.info(`[GenerateFullSeason] Auto-populating weekly lineups for all weeks...`);
    const rosters = await getRostersByLeagueId(leagueIdNum);

    for (let week = startWeek; week <= endWeek; week++) {
      for (const roster of rosters) {
        // Get or create weekly lineup
        await getOrCreateWeeklyLineup(roster.id, week, season);

        // Copy starters from default roster to weekly lineup (exclude BN slots)
        if (roster.starters && Array.isArray(roster.starters)) {
          const nonBenchStarters = roster.starters.filter((slot: any) => {
            const slotName = slot.slot || "";
            return !slotName.startsWith("BN");
          });
          await updateWeeklyLineup(roster.id, week, season, nonBenchStarters);
        }
      }
    }

    logger.info(
      `[GenerateFullSeason] Successfully generated ${result.matchups.length} matchups and populated lineups`
    );

    this.respondCreated(res, {
      matchups: result.matchups,
      weeks_generated: endWeek - startWeek + 1,
      start_week: startWeek,
      end_week: endWeek,
    }, result.message);
  });

  /**
   * DELETE /api/matchups/league/:leagueId
   * Delete all matchups for a league (Commissioner only)
   */
  deleteAllMatchupsForLeague = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueIdNum = this.validateId(req.params.leagueId, "League ID");

    logger.info(`[DeleteMatchups] Deleting all matchups for league ${leagueIdNum}...`);

    await deleteMatchupsForLeague(leagueIdNum);

    logger.info(`[DeleteMatchups] Successfully deleted all matchups for league ${leagueIdNum}`);

    this.respondSuccess(res, null, "Successfully deleted all matchups");
  });
}

/**
 * Update scores in background without blocking the response
 */
async function updateScoresInBackground(
  leagueId: number,
  week: number,
  season: string,
  seasonType: string,
  cacheKey: string
): Promise<void> {
  try {
    logger.info(`[AutoUpdate] Background update started for week ${week}...`);

    // Sync stats from Sleeper
    await syncSleeperStatsForWeek(season, week, seasonType);

    // Update matchup scores
    await updateMatchupScoresForWeek(leagueId, week, season, seasonType);

    // Finalize scores if week is complete
    await finalizeWeekScores(leagueId, week, season, seasonType);

    // Update cache
    lastUpdateCache.set(cacheKey, Date.now());

    logger.info(`[AutoUpdate] Background update completed for week ${week}`);
  } catch (error) {
    logger.error("[AutoUpdate] Error in background update:", error);
    throw error;
  }
}

// Export controller instance methods as standalone functions
const controller = new MatchupController();
export const getMatchupsForWeek = controller.getMatchupsForWeek;
export const getAllMatchupsForLeague = controller.getAllMatchupsForLeague;
export const generateMatchups = controller.generateMatchups;
export const updateScoresForWeek = controller.updateScoresForWeek;
export const getMatchupDetailsHandler = controller.getMatchupDetailsHandler;
export const getMatchupScoresHandler = controller.getMatchupScoresHandler;
export const recalculateRecordsHandler = controller.recalculateRecordsHandler;
export const generateFullSeasonMatchups = controller.generateFullSeasonMatchups;
export const deleteAllMatchupsForLeague = controller.deleteAllMatchupsForLeague;
