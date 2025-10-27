import cron from "node-cron";
import pool from "../config/database";
import { syncSleeperStatsForWeek } from "./sleeperStatsService";
import { updateMatchupScoresForWeek } from "./scoringService";
import { finalizeWeekScores } from "./recordService";

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
      // Simple logic: use current date to estimate week
      // You can make this more sophisticated by checking actual NFL schedule
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
  // This is a simplified calculation - you can make it more accurate
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
 * Update scores for all active leagues
 */
async function updateAllLeagueScores(): Promise<void> {
  const startTime = Date.now();
  console.log("[Scheduler] Starting scheduled score update...");

  try {
    const activeLeagues = await getActiveLeagues();
    console.log(`[Scheduler] Found ${activeLeagues.length} active leagues`);

    if (activeLeagues.length === 0) {
      console.log("[Scheduler] No active leagues to update");
      return;
    }

    // Sync stats once for current week (shared across all leagues)
    const currentWeek = activeLeagues[0]?.current_week;
    const season = activeLeagues[0]?.season;
    const seasonType = activeLeagues[0]?.season_type || "regular";

    if (currentWeek && season) {
      console.log(
        `[Scheduler] Syncing stats for ${season} week ${currentWeek}...`
      );
      await syncSleeperStatsForWeek(season, currentWeek, seasonType);
    }

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
 * Updates every 10 minutes during NFL game windows
 */
export function startScoreScheduler(): void {
  console.log("[Scheduler] Starting score update scheduler...");

  // NFL game times (all times in UTC):
  // - Sunday early games: 6pm UTC (1pm ET) - midnight UTC (7pm ET)
  // - Sunday night: midnight-3am UTC (7pm-10pm ET)
  // - Monday night: midnight-3am UTC (7pm-10pm ET) (next day)
  // - Thursday night: midnight-3am UTC (7pm-10pm ET)

  // Run every 10 minutes during peak NFL times
  // Sunday: 6pm-3am UTC (covers all Sunday games)
  cron.schedule("*/10 * * * 0", updateAllLeagueScores, {
    timezone: "UTC",
  });
  console.log("[Scheduler] ✓ Sunday updates scheduled (every 10 min)");

  // Monday: midnight-4am UTC (covers Monday Night Football)
  cron.schedule("*/10 0-4 * * 1", updateAllLeagueScores, {
    timezone: "UTC",
  });
  console.log("[Scheduler] ✓ Monday updates scheduled (every 10 min 0-4am UTC)");

  // Thursday: midnight-4am UTC (covers Thursday Night Football)
  cron.schedule("*/10 0-4 * * 4", updateAllLeagueScores, {
    timezone: "UTC",
  });
  console.log(
    "[Scheduler] ✓ Thursday updates scheduled (every 10 min 0-4am UTC)"
  );

  // Also run once at 9am UTC Tuesday (finalize Monday night games)
  cron.schedule("0 9 * * 2", updateAllLeagueScores, {
    timezone: "UTC",
  });
  console.log("[Scheduler] ✓ Tuesday finalization scheduled (9am UTC)");

  console.log("[Scheduler] Score scheduler started successfully");
}

/**
 * Stop all scheduled tasks (for testing/shutdown)
 */
export function stopScoreScheduler(): void {
  cron.getTasks().forEach((task) => task.stop());
  console.log("[Scheduler] Score scheduler stopped");
}
