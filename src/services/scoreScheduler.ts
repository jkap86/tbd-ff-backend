import cron from "node-cron";
import pool from "../config/database";
import { syncSleeperStatsForWeek } from "./sleeperStatsService";
import { updateMatchupScoresForWeek } from "./scoringService";
import { finalizeWeekScores } from "./recordService";
import { getWeekSchedule } from "./sleeperScheduleService";

interface ActiveLeague {
  league_id: number;
  season: string;
  current_week: number;
  season_type: string;
}

/**
 * Get all active leagues that need score updates
 * Active = leagues with current season/week
 */
async function getActiveLeagues(): Promise<ActiveLeague[]> {
  try {
    const query = `
      SELECT DISTINCT l.id as league_id, l.season, l.season_type
      FROM leagues l
      WHERE l.season IS NOT NULL
      ORDER BY l.id
    `;
    const result = await pool.query(query);

    // For each league, determine current week based on season
    const activeLeagues: ActiveLeague[] = [];
    for (const row of result.rows) {
      const currentWeek = getCurrentNFLWeek(row.season);
      if (currentWeek > 0 && currentWeek <= 18) {
        activeLeagues.push({
          league_id: row.league_id,
          season: row.season,
          current_week: currentWeek,
          season_type: row.season_type || "regular",
        });
      }
    }

    return activeLeagues;
  } catch (error) {
    console.error("[Scheduler] Error getting active leagues:", error);
    return [];
  }
}

/**
 * Estimate current NFL week based on season and current date
 * NFL typically starts first Thursday of September
 */
function getCurrentNFLWeek(season: string): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const seasonYear = parseInt(season);

  // Only process current season
  if (seasonYear !== currentYear) {
    return 0;
  }

  // NFL season roughly: Week 1 starts first Thu of Sept, ends early Jan
  const seasonStart = new Date(currentYear, 8, 1); // Sept 1
  const firstThursday = new Date(seasonStart);
  firstThursday.setDate(
    seasonStart.getDate() + ((4 - seasonStart.getDay() + 7) % 7)
  );

  const weeksSinceStart = Math.floor(
    (now.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  const week = weeksSinceStart + 1;

  // Regular season is weeks 1-18
  if (week < 1) return 0;
  if (week > 18) return 0;

  return week;
}

/**
 * Check if there are any live or upcoming games in the current week
 * Returns true if games are in_progress, or will start within the next hour
 */
async function hasLiveOrUpcomingGames(
  season: string,
  week: number,
  seasonType: string
): Promise<boolean> {
  try {
    const schedule = await getWeekSchedule(season, week, seasonType);

    if (schedule.length === 0) {
      return false; // No games scheduled
    }

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    for (const game of schedule) {
      // Game is currently in progress
      if (game.status === "in_progress") {
        return true;
      }

      // Game hasn't started yet - check if it starts within next hour
      if (game.status === "pre_game" && game.start_time) {
        const gameStart = new Date(parseInt(game.start_time));
        if (gameStart <= oneHourFromNow) {
          return true; // Game starts soon
        }
      }
    }

    return false; // No live or upcoming games
  } catch (error) {
    console.error("[Scheduler] Error checking for live games:", error);
    // Default to true on error to avoid missing updates
    return true;
  }
}

/**
 * Update scores for all active leagues (only if games are live)
 */
async function updateAllLeagueScores(): Promise<void> {
  const startTime = Date.now();
  console.log("[Scheduler] Checking for live games...");

  try {
    const activeLeagues = await getActiveLeagues();

    if (activeLeagues.length === 0) {
      console.log("[Scheduler] No active leagues to update");
      return;
    }

    // Check if there are live games for the current week
    const currentWeek = activeLeagues[0]?.current_week;
    const season = activeLeagues[0]?.season;
    const seasonType = activeLeagues[0]?.season_type || "regular";

    if (!currentWeek || !season) {
      console.log("[Scheduler] No current week/season found");
      return;
    }

    const hasLiveGames = await hasLiveOrUpcomingGames(
      season,
      currentWeek,
      seasonType
    );

    if (!hasLiveGames) {
      console.log(
        `[Scheduler] No live games for week ${currentWeek}, skipping update`
      );
      return;
    }

    console.log(
      `[Scheduler] Live games detected for week ${currentWeek}, updating ${activeLeagues.length} leagues...`
    );

    // Sync stats once for current week (shared across all leagues)
    console.log(`[Scheduler] Syncing stats for ${season} week ${currentWeek}...`);
    await syncSleeperStatsForWeek(season, currentWeek, seasonType);

    // Update each league's matchup scores
    for (const league of activeLeagues) {
      try {
        console.log(
          `[Scheduler] Updating league ${league.league_id} week ${league.current_week}...`
        );

        await updateMatchupScoresForWeek(
          league.league_id,
          league.current_week,
          league.season,
          league.season_type
        );

        // Try to finalize if week is complete
        await finalizeWeekScores(
          league.league_id,
          league.current_week,
          league.season,
          league.season_type
        );
      } catch (error) {
        console.error(
          `[Scheduler] Error updating league ${league.league_id}:`,
          error
        );
        // Continue with other leagues even if one fails
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Scheduler] Score update completed in ${duration}ms for ${activeLeagues.length} leagues`
    );
  } catch (error) {
    console.error("[Scheduler] Error in scheduled update:", error);
  }
}

/**
 * Start the score update scheduler
 * Checks every 10 minutes if there are live games, and updates if so
 */
export function startScoreScheduler(): void {
  console.log("[Scheduler] Starting smart score update scheduler...");
  console.log(
    "[Scheduler] Will check for live games every 10 minutes and update when needed"
  );

  // Run every 10 minutes, any day of the week
  // The function itself will check if there are live games before updating
  cron.schedule("*/10 * * * *", updateAllLeagueScores, {
    timezone: "UTC",
  });

  console.log("[Scheduler] ✓ Live game detection scheduled (every 10 min)");
  console.log(
    "[Scheduler] ✓ Supports Thursday, Saturday, Sunday, and Monday games"
  );
  console.log("[Scheduler] ✓ Auto-detects game times from Sleeper schedule");
  console.log("[Scheduler] Score scheduler started successfully");
}

/**
 * Stop all scheduled tasks (for testing/shutdown)
 */
export function stopScoreScheduler(): void {
  cron.getTasks().forEach((task) => task.stop());
  console.log("[Scheduler] Score scheduler stopped");
}
