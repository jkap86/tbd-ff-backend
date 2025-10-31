import cron from "node-cron";
import pool from "../config/database";
import { syncSleeperStatsForWeek } from "./sleeperStatsService";
import { updateMatchupScoresForWeek } from "./scoringService";
import { finalizeWeekScores } from "./recordService";
import { getWeekSchedule } from "./sleeperScheduleService";
import { getCurrentNFLWeek } from "./currentWeekService";
import { syncPlayers } from "../controllers/playerController";
import { withCronLogging } from "../utils/cronHelper";

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
      const currentWeek = await getCurrentNFLWeek(row.season, row.season_type || "regular");
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

  // Sync stats once for current week with retry logic (shared across all leagues)
  console.log(`[Scheduler] Syncing stats for ${season} week ${currentWeek}...`);
  await withCronLogging(
    async () => await syncSleeperStatsForWeek(season, currentWeek, seasonType),
    `Stats Sync - Week ${currentWeek}`,
    { maxAttempts: 3, baseDelayMs: 2000 }
  );

  // Update each league's matchup scores with retry logic
  for (const league of activeLeagues) {
    try {
      console.log(
        `[Scheduler] Updating league ${league.league_id} week ${league.current_week}...`
      );

      await withCronLogging(
        async () => {
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
        },
        `Score Update - League ${league.league_id}`,
        { maxAttempts: 3, baseDelayMs: 1000 }
      );
    } catch (error) {
      console.error(
        `[Scheduler] Error updating league ${league.league_id} after all retries:`,
        error
      );
      // Continue with other leagues even if one fails permanently
    }
  }

  const duration = Date.now() - startTime;
  console.log(
    `[Scheduler] Score update completed in ${duration}ms for ${activeLeagues.length} leagues`
  );
}

/**
 * Sync players from Sleeper daily
 */
async function syncPlayersDaily(): Promise<void> {
  await withCronLogging(
    async () => {
      const syncedCount = await syncPlayers();
      console.log(`[Scheduler] ${syncedCount} players synced`);
    },
    'Daily Player Sync',
    { maxAttempts: 3, baseDelayMs: 2000 }
  );
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

  // Run daily at 3:00 AM UTC to sync players from Sleeper
  cron.schedule("0 3 * * *", syncPlayersDaily, {
    timezone: "UTC",
  });

  console.log("[Scheduler] ✓ Daily player sync scheduled (3:00 AM UTC)");
  console.log("[Scheduler] Score scheduler started successfully");
}

/**
 * Stop all scheduled tasks (for testing/shutdown)
 */
export function stopScoreScheduler(): void {
  cron.getTasks().forEach((task) => task.stop());
  console.log("[Scheduler] Score scheduler stopped");
}
