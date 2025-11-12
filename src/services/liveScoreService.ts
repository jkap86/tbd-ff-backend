import { Server } from "socket.io";
import pool from "../config/database";
import { syncSleeperStatsForWeek } from "./sleeperStatsService";
import { updateMatchupScoresForWeek } from "./scoringService";
import { getWeekSchedule } from "./sleeperScheduleService";
import { broadcastScoreUpdate } from "../socket/matchupSocket";
import { getCurrentNFLWeek } from "./currentWeekService";

interface ActiveLeague {
  league_id: number;
  season: string;
  current_week: number;
  season_type: string;
}

let liveUpdateInterval: NodeJS.Timeout | null = null;
let isUpdating = false;

/**
 * Get all active leagues that need score updates
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
    console.error("[LiveScore] Error getting active leagues:", error);
    return [];
  }
}


/**
 * Check if there are any games currently in progress
 */
async function hasGamesInProgress(
  season: string,
  week: number,
  seasonType: string
): Promise<boolean> {
  try {
    const schedule = await getWeekSchedule(season, week, seasonType);

    if (schedule.length === 0) {
      return false;
    }

    // Check if ANY game is currently in progress
    return schedule.some((game) => game.status === "in_progress");
  } catch (error) {
    console.error("[LiveScore] Error checking for live games:", error);
    return false;
  }
}

/**
 * Update live scores and broadcast to connected clients
 */
async function updateLiveScores(io: Server): Promise<void> {
  // Prevent concurrent updates
  if (isUpdating) {
    console.log("[LiveScore] Update already in progress, skipping...");
    return;
  }

  isUpdating = true;

  // Safety timeout: if update takes >30s, force reset to prevent deadlock
  const updateTimeout = setTimeout(() => {
    console.error("[LiveScore] Update exceeded 30s timeout, forcing reset");
    isUpdating = false;
  }, 30000);

  try {
    const activeLeagues = await getActiveLeagues();

    if (activeLeagues.length === 0) {
      isUpdating = false;
      return;
    }

    const currentWeek = activeLeagues[0]?.current_week;
    const season = activeLeagues[0]?.season;
    const seasonType = activeLeagues[0]?.season_type || "regular";

    if (!currentWeek || !season) {
      isUpdating = false;
      return;
    }

    // Check if games are actually in progress
    const hasLiveGames = await hasGamesInProgress(season, currentWeek, seasonType);

    if (!hasLiveGames) {
      console.log("[LiveScore] No games in progress, skipping update");
      isUpdating = false;
      return;
    }

    console.log(`[LiveScore] Updating scores for ${activeLeagues.length} leagues...`);

    // Sync stats once
    await syncSleeperStatsForWeek(season, currentWeek, seasonType);

    // Update and broadcast for each league
    for (const league of activeLeagues) {
      try {
        // Update scores in database
        await updateMatchupScoresForWeek(
          league.league_id,
          league.current_week,
          league.season,
          league.season_type
        );

        // Get updated matchups
        const { getMatchupsByLeagueAndWeek } = await import("../models/Matchup");
        const matchups = await getMatchupsByLeagueAndWeek(
          league.league_id,
          league.current_week
        );

        // Broadcast to all connected clients
        broadcastScoreUpdate(io, league.league_id, league.current_week, matchups);

        console.log(
          `[LiveScore] ✓ Updated and broadcast league ${league.league_id} week ${league.current_week}`
        );
      } catch (error) {
        console.error(
          `[LiveScore] Error updating league ${league.league_id}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("[LiveScore] Error in live score update:", error);
  } finally {
    clearTimeout(updateTimeout);
    isUpdating = false;
  }
}

/**
 * Start live score updates (every 10 seconds)
 */
export function startLiveScoreUpdates(io: Server): void {
  console.log("[LiveScore] Starting live score updates (10 second interval)");

  // Run immediately
  updateLiveScores(io);

  // Then run every 10 seconds
  liveUpdateInterval = setInterval(() => {
    updateLiveScores(io);
  }, 10 * 1000); // 10 seconds

  console.log("[LiveScore] ✓ Live score updates started");
}

/**
 * Stop live score updates
 */
export function stopLiveScoreUpdates(): void {
  if (liveUpdateInterval) {
    clearInterval(liveUpdateInterval);
    liveUpdateInterval = null;
    console.log("[LiveScore] Live score updates stopped");
  }
}
