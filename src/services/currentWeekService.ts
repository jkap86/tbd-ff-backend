import { getWeekSchedule } from "./sleeperScheduleService";

interface CurrentWeekCache {
  season: string;
  week: number;
  lastUpdated: number;
}

// In-memory cache (refreshed every hour)
let currentWeekCache: CurrentWeekCache | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get the current NFL week by checking Sleeper's schedule
 * Checks weeks sequentially to find the first week with upcoming or in-progress games
 */
export async function getCurrentNFLWeek(
  season: string,
  seasonType: string = "regular"
): Promise<number> {
  // Check cache first
  const now = Date.now();
  if (
    currentWeekCache &&
    currentWeekCache.season === season &&
    now - currentWeekCache.lastUpdated < CACHE_TTL
  ) {
    console.log(`[CurrentWeek] Using cached week ${currentWeekCache.week}`);
    return currentWeekCache.week;
  }

  console.log(`[CurrentWeek] Detecting current week for ${season}...`);

  try {
    // Check weeks 1-18 to find current week
    for (let week = 1; week <= 18; week++) {
      const schedule = await getWeekSchedule(season, week, seasonType);

      if (schedule.length === 0) {
        // No games scheduled for this week, we've gone too far
        const currentWeek = Math.max(1, week - 1);
        currentWeekCache = { season, week: currentWeek, lastUpdated: now };
        console.log(`[CurrentWeek] Detected week ${currentWeek} (no more games)`);
        return currentWeek;
      }

      // Check if any games are upcoming or in progress
      const hasUpcomingOrLive = schedule.some(
        (game) => game.status === "in_progress" || game.status === "pre_game"
      );

      if (hasUpcomingOrLive) {
        // This is the current week
        currentWeekCache = { season, week, lastUpdated: now };
        console.log(`[CurrentWeek] Detected week ${week} (has upcoming/live games)`);
        return week;
      }

      // If all games are complete, check next week
    }

    // Fallback: if we checked all weeks, return week 18
    const fallbackWeek = 18;
    currentWeekCache = { season, week: fallbackWeek, lastUpdated: now };
    console.log(`[CurrentWeek] Using fallback week ${fallbackWeek}`);
    return fallbackWeek;
  } catch (error) {
    console.error("[CurrentWeek] Error detecting current week:", error);

    // Fallback to date-based estimation
    return estimateWeekByDate(season);
  }
}

/**
 * Estimate week based on calendar (fallback method)
 */
function estimateWeekByDate(season: string): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const seasonYear = parseInt(season);

  if (seasonYear !== currentYear) {
    return 1; // Default to week 1 for non-current seasons
  }

  // NFL season roughly: Week 1 starts first Thu of Sept
  const seasonStart = new Date(currentYear, 8, 1); // Sept 1
  const firstThursday = new Date(seasonStart);
  firstThursday.setDate(
    seasonStart.getDate() + ((4 - seasonStart.getDay() + 7) % 7)
  );

  const weeksSinceStart = Math.floor(
    (now.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  const week = weeksSinceStart + 1;

  if (week < 1) return 1;
  if (week > 18) return 18;

  return week;
}

/**
 * Force refresh the current week cache
 */
export function refreshCurrentWeekCache(): void {
  currentWeekCache = null;
  console.log("[CurrentWeek] Cache cleared");
}
