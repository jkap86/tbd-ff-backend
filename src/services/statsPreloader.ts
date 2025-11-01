import cron from "node-cron";
import axios from "axios";
import NodeCache from "node-cache";

/**
 * Stats Preloader Service
 * Precomputes and caches aggregated player stats/projections in the background
 * to ensure instant API responses
 */

const SLEEPER_API_BASE = "https://api.sleeper.com";
const API_TIMEOUT = 30000; // 30 seconds

// Cache references (same instances used by playerStatsController)
// Export these so the controller can import them
export const statsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
export const projectionsCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });

// Preload every 5 minutes for stats, every 15 minutes for projections
const STATS_PRELOAD_SCHEDULE = "*/5 * * * *"; // Every 5 minutes
const PROJECTIONS_PRELOAD_SCHEDULE = "*/15 * * * *"; // Every 15 minutes

const SEASON_TYPE = "regular";

/**
 * Get current season year
 */
function getCurrentSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  // NFL season typically starts in September
  // If we're before September, we're still in the previous season
  return now.getMonth() >= 8 ? year : year - 1;
}

/**
 * Get current NFL week (simplified - you may want to make this more robust)
 */
function getCurrentWeek(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  // Adjust season start based on year
  const seasonStart = new Date(`${currentYear}-09-05`); // NFL season typically starts early September
  const diffTime = Math.abs(now.getTime() - seasonStart.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 1), 18); // Week 1-18
}

/**
 * Preload and index season stats
 * OPTIMIZED: Only cache current season + index (not raw array)
 */
async function preloadSeasonStats(): Promise<void> {
  try {
    const currentSeason = getCurrentSeason();
    // OPTIMIZATION: Only cache current season (not previous)
    // Previous season can be fetched on-demand if needed

    const cacheKey = `season_stats_${currentSeason}_${SEASON_TYPE}`;
    const indexCacheKey = `${cacheKey}_index`;

    console.log(`[StatsPreloader] Preloading season stats for ${currentSeason}...`);

    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${currentSeason}?season_type=${SEASON_TYPE}`,
      { timeout: API_TIMEOUT }
    );
    const allStats = response.data;

    // OPTIMIZATION: Only store indexed version, not the raw array
    // This saves 50% memory by not duplicating data
    const statsIndex: Record<string, any> = {};
    if (allStats) {
      for (const stat of allStats) {
        if (stat.player_id) {
          statsIndex[stat.player_id] = stat;
        }
      }
    }

    // Only cache the index
    statsCache.set(indexCacheKey, statsIndex);
    console.log(
      `[StatsPreloader] Cached season stats for ${currentSeason} with ${Object.keys(statsIndex).length} players`
    );
  } catch (error: any) {
    console.error("[StatsPreloader] Error preloading season stats:", error.message);
  }
}

/**
 * Preload and aggregate week range projections
 * OPTIMIZED: Caches multiple common week ranges:
 * 1. Current week to end of season (most common for season-long leagues)
 * 2. Week 1 to end of season (for full season analysis)
 * 3. Current week to end (for remaining games analysis)
 */
async function preloadWeekRangeProjections(): Promise<void> {
  try {
    const currentWeek = getCurrentWeek();
    const endWeek = 18; // End of regular season
    const season = getCurrentSeason();

    // Only preload if we're still in the season
    if (currentWeek > endWeek) {
      console.log(`[StatsPreloader] Season ended, skipping week range preload`);
      return;
    }

    console.log(
      `[StatsPreloader] Preloading week range projections...`
    );
    console.log(
      `[StatsPreloader] - Full season: weeks 1-${endWeek}`
    );
    console.log(
      `[StatsPreloader] - Remaining: weeks ${currentWeek}-${endWeek}`
    );

    // Fetch ALL weeks from 1 to end of season
    // This allows us to cache both "full season" and "remaining weeks" aggregates
    const weekPromises = [];
    for (let week = 1; week <= endWeek; week++) {
      weekPromises.push(
        (async () => {
          try {
            const response = await axios.get(
              `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${SEASON_TYPE}`,
              { timeout: API_TIMEOUT }
            );
            const weekData = response.data;

            // Create indexed version
            const weekIndex: Record<string, any> = {};
            if (weekData) {
              for (const proj of weekData) {
                if (proj.player_id) {
                  weekIndex[proj.player_id] = proj;
                }
              }
            }

            // OPTIMIZATION: Only cache the current week individually (most accessed)
            // Other weeks are only used for aggregation
            if (week === currentWeek) {
              const weekIndexCacheKey = `week_projections_${season}_${week}_${SEASON_TYPE}_index`;
              projectionsCache.set(weekIndexCacheKey, weekIndex);
              console.log(`[StatsPreloader] Cached projections for current week ${week}`);
            } else {
              console.log(`[StatsPreloader] Fetched projections for week ${week} (not cached individually)`);
            }

            return { week, index: weekIndex };
          } catch (error: any) {
            console.error(
              `[StatsPreloader] Error fetching week ${week}:`,
              error.message
            );
            return { week, index: {} };
          }
        })()
      );
    }

    const weekResponses = await Promise.all(weekPromises);

    // Collect all unique player IDs across all weeks
    const allPlayerIds = new Set<string>();
    for (const response of weekResponses) {
      const weekIndex = response.index;
      for (const playerId of Object.keys(weekIndex)) {
        allPlayerIds.add(playerId);
      }
    }

    // Helper function to aggregate for a specific week range
    const aggregateRange = (startWeek: number, endWeek: number): Record<string, any> => {
      const aggregates: Record<string, any> = {};

      for (const playerId of allPlayerIds) {
        const aggregatedStats: Record<string, number> = {};
        let weeksFound = 0;

        // Sum up stats for weeks in range
        for (const response of weekResponses) {
          if (response.week >= startWeek && response.week <= endWeek) {
            const weekIndex = response.index;
            const playerWeekProjection = weekIndex[playerId];

            if (playerWeekProjection && playerWeekProjection.stats) {
              weeksFound++;
              const stats = playerWeekProjection.stats;

              for (const [key, value] of Object.entries(stats)) {
                if (typeof value === "number") {
                  aggregatedStats[key] = (aggregatedStats[key] || 0) + value;
                }
              }
            }
          }
        }

        if (weeksFound > 0) {
          aggregates[playerId] = {
            player_id: playerId,
            stats: aggregatedStats,
            weeks_included: weeksFound,
            week_range: `${startWeek}-${endWeek}`,
          };
        }
      }

      return aggregates;
    };

    // Cache 1: Full season (weeks 1 to end)
    console.log(`[StatsPreloader] Aggregating full season: weeks 1-${endWeek}...`);
    const fullSeasonAggregates = aggregateRange(1, endWeek);
    const fullSeasonCacheKey = `week_range_aggregated_${season}_1_${endWeek}_${SEASON_TYPE}`;
    projectionsCache.set(fullSeasonCacheKey, fullSeasonAggregates);
    console.log(
      `[StatsPreloader] Cached full season (1-${endWeek}) with ${Object.keys(fullSeasonAggregates).length} players`
    );

    // Cache 2: Remaining weeks (current week to end) - only if different from full season
    if (currentWeek > 1) {
      console.log(`[StatsPreloader] Aggregating remaining weeks: ${currentWeek}-${endWeek}...`);
      const remainingAggregates = aggregateRange(currentWeek, endWeek);
      const remainingCacheKey = `week_range_aggregated_${season}_${currentWeek}_${endWeek}_${SEASON_TYPE}`;
      projectionsCache.set(remainingCacheKey, remainingAggregates);
      console.log(
        `[StatsPreloader] Cached remaining weeks (${currentWeek}-${endWeek}) with ${Object.keys(remainingAggregates).length} players`
      );
    }
  } catch (error: any) {
    console.error(
      "[StatsPreloader] Error preloading week range projections:",
      error.message
    );
  }
}

/**
 * Preload season projections (fallback when week range not applicable)
 * OPTIMIZED: Only cache index, not raw array
 */
async function preloadSeasonProjections(): Promise<void> {
  try {
    const season = getCurrentSeason();
    const indexCacheKey = `season_projections_${season}_${SEASON_TYPE}_index`;

    console.log(`[StatsPreloader] Preloading season projections for ${season}...`);

    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}?season_type=${SEASON_TYPE}`,
      { timeout: API_TIMEOUT }
    );
    const allProjections = response.data;

    // OPTIMIZATION: Only store indexed version, not the raw array
    // This saves 50% memory by not duplicating data
    const projectionsIndex: Record<string, any> = {};
    if (allProjections) {
      for (const proj of allProjections) {
        if (proj.player_id) {
          projectionsIndex[proj.player_id] = proj;
        }
      }
    }

    // Only cache the index
    projectionsCache.set(indexCacheKey, projectionsIndex);
    console.log(
      `[StatsPreloader] Cached season projections for ${season} with ${Object.keys(projectionsIndex).length} players`
    );
  } catch (error: any) {
    console.error(
      "[StatsPreloader] Error preloading season projections:",
      error.message
    );
  }
}

/**
 * Run all preload tasks
 */
async function runAllPreloadTasks(): Promise<void> {
  console.log("[StatsPreloader] Running preload tasks...");
  await Promise.all([
    preloadSeasonStats(),
    preloadWeekRangeProjections(),
    preloadSeasonProjections(),
  ]);
  console.log("[StatsPreloader] All preload tasks completed");
}

/**
 * Start the stats preloader scheduler
 */
export function startStatsPreloader(): void {
  console.log("[StatsPreloader] Starting stats preloader service");

  // Run immediately on startup
  runAllPreloadTasks();

  // Schedule stats preload every 5 minutes
  cron.schedule(STATS_PRELOAD_SCHEDULE, async () => {
    console.log("[StatsPreloader] Running scheduled stats preload");
    await preloadSeasonStats();
  });

  // Schedule projections preload every 15 minutes
  cron.schedule(PROJECTIONS_PRELOAD_SCHEDULE, async () => {
    console.log("[StatsPreloader] Running scheduled projections preload");
    await Promise.all([
      preloadWeekRangeProjections(),
      preloadSeasonProjections(),
    ]);
  });

  console.log(
    "[StatsPreloader] Scheduled: stats every 5 minutes, projections every 15 minutes"
  );
}
