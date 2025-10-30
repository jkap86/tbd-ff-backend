import { Request, Response } from "express";
import {
  getMatchupsByLeagueAndWeek,
  getMatchupsByLeague,
  generateMatchupsForWeek,
  deleteMatchupsForWeek,
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

// Simple in-memory cache for last update times
const lastUpdateCache = new Map<string, number>();
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all matchups for a league and specific week
 * GET /api/matchups/league/:leagueId/week/:week
 * Automatically updates scores when loading (with rate limiting)
 */
export async function getMatchupsForWeek(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId, week } = req.params;
    const { season, season_type = "regular", force_update = "false" } = req.query;

    // Check if we should update scores
    const cacheKey = `${leagueId}-${week}-${season}`;
    const lastUpdate = lastUpdateCache.get(cacheKey) || 0;
    const now = Date.now();
    const shouldUpdate =
      force_update === "true" || now - lastUpdate > UPDATE_INTERVAL;

    // Auto-update scores if season is provided and enough time has passed
    if (season && shouldUpdate) {
      // Trigger update in background (don't wait for it)
      updateScoresInBackground(
        parseInt(leagueId),
        parseInt(week),
        season as string,
        season_type as string,
        cacheKey
      ).catch((error) => {
        console.error("[AutoUpdate] Background update failed:", error);
      });
    }

    // Return matchups immediately (don't wait for score update)
    const matchups = await getMatchupsByLeagueAndWeek(
      parseInt(leagueId),
      parseInt(week)
    );

    res.status(200).json({
      success: true,
      data: matchups,
      meta: {
        last_updated: lastUpdate,
        cache_age_seconds: Math.floor((now - lastUpdate) / 1000),
      },
    });
  } catch (error: any) {
    console.error("Error getting matchups:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting matchups",
    });
  }
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
    console.log(`[AutoUpdate] Background update started for week ${week}...`);

    // Sync stats from Sleeper
    await syncSleeperStatsForWeek(season, week, seasonType);

    // Update matchup scores
    await updateMatchupScoresForWeek(leagueId, week, season, seasonType);

    // Finalize scores if week is complete
    await finalizeWeekScores(leagueId, week, season, seasonType);

    // Update cache
    lastUpdateCache.set(cacheKey, Date.now());

    console.log(`[AutoUpdate] Background update completed for week ${week}`);
  } catch (error) {
    console.error("[AutoUpdate] Error in background update:", error);
    throw error;
  }
}

/**
 * Get all matchups for a league (all weeks)
 * GET /api/matchups/league/:leagueId
 */
export async function getAllMatchupsForLeague(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;

    const matchups = await getMatchupsByLeague(parseInt(leagueId));

    res.status(200).json({
      success: true,
      data: matchups,
    });
  } catch (error: any) {
    console.error("Error getting matchups:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting matchups",
    });
  }
}

/**
 * Generate matchups for a specific week
 * POST /api/matchups/league/:leagueId/week/:week/generate
 */
export async function generateMatchups(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId, week } = req.params;
    const { season } = req.body;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    // Delete existing matchups for this week (if regenerating)
    await deleteMatchupsForWeek(parseInt(leagueId), parseInt(week));

    // Generate new matchups
    const matchups = await generateMatchupsForWeek(
      parseInt(leagueId),
      parseInt(week),
      season
    );

    res.status(201).json({
      success: true,
      data: matchups,
      message: `Generated ${matchups.length} matchups for week ${week}`,
    });
  } catch (error: any) {
    console.error("Error generating matchups:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating matchups",
    });
  }
}

/**
 * Sync stats and update scores for a specific week
 * POST /api/matchups/league/:leagueId/week/:week/update-scores
 */
export async function updateScoresForWeek(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId, week } = req.params;
    const { season, season_type = "regular" } = req.body;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    // First, sync stats from Sleeper
    console.log(`Syncing stats for week ${week}...`);
    const statsResult = await syncSleeperStatsForWeek(
      season,
      parseInt(week),
      season_type
    );

    // Then, update matchup scores
    console.log(`Updating matchup scores for week ${week}...`);
    await updateMatchupScoresForWeek(
      parseInt(leagueId),
      parseInt(week),
      season,
      season_type
    );

    // Finally, finalize scores if week is complete
    console.log(`Checking if week ${week} should be finalized...`);
    await finalizeWeekScores(
      parseInt(leagueId),
      parseInt(week),
      season,
      season_type
    );

    res.status(200).json({
      success: true,
      message: `Updated scores for week ${week}`,
      stats: {
        synced: statsResult.synced,
        failed: statsResult.failed,
      },
    });
  } catch (error: any) {
    console.error("Error updating scores:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating scores",
    });
  }
}

/**
 * Get detailed matchup information with rosters and players
 * GET /api/matchups/:matchupId/details
 */
export async function getMatchupDetailsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { matchupId } = req.params;

    const details = await getMatchupDetails(parseInt(matchupId));

    if (!details) {
      res.status(404).json({
        success: false,
        message: "Matchup not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error: any) {
    console.error("Error getting matchup details:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting matchup details",
    });
  }
}

/**
 * Get detailed matchup information with player scores
 * GET /api/matchups/:matchupId/scores
 */
export async function getMatchupScoresHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { matchupId } = req.params;

    const details = await getMatchupDetailsWithScores(parseInt(matchupId));

    if (!details) {
      res.status(404).json({
        success: false,
        message: "Matchup not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error: any) {
    console.error("Error getting matchup scores:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting matchup scores",
    });
  }
}

/**
 * Recalculate all records for a league from completed matchups
 * POST /api/matchups/league/:leagueId/recalculate-records
 */
export async function recalculateRecordsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season } = req.body;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    console.log(`Recalculating records for league ${leagueId}, season ${season}...`);
    await recalculateAllRecords(parseInt(leagueId), season);

    res.status(200).json({
      success: true,
      message: "Records recalculated successfully",
    });
  } catch (error: any) {
    console.error("Error recalculating records:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error recalculating records",
    });
  }
}

/**
 * Generate matchups for entire regular season using round-robin algorithm
 * POST /api/matchups/league/:leagueId/generate-season
 */
export async function generateFullSeasonMatchups(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season, regenerate = false } = req.body;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    // Get league to access settings
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const settings = league.settings || {};
    const startWeek = settings.start_week || 1;
    const playoffWeekStart = settings.playoff_week_start || 15;
    const endWeek = playoffWeekStart - 1; // Regular season ends before playoffs

    console.log(
      `[GenerateFullSeason] Generating matchups for league ${leagueId}, weeks ${startWeek}-${endWeek}...`
    );

    // Generate the full season schedule
    const result = await generateFullSeasonSchedule(
      parseInt(leagueId),
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
    console.log(`[GenerateFullSeason] Auto-populating weekly lineups for all weeks...`);
    const rosters = await getRostersByLeagueId(parseInt(leagueId));

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

    console.log(
      `[GenerateFullSeason] Successfully generated ${result.matchups.length} matchups and populated lineups`
    );

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        matchups: result.matchups,
        weeks_generated: endWeek - startWeek + 1,
        start_week: startWeek,
        end_week: endWeek,
      },
    });
  } catch (error: any) {
    console.error("Error generating full season matchups:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating full season matchups",
    });
  }
}
