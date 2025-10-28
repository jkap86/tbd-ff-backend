import cron from "node-cron";
import axios from "axios";
import NodeCache from "node-cache";

/**
 * Stats Preloader Service
 * Precomputes and caches aggregated player stats/projections in the background
 * to ensure instant API responses
 */

const SLEEPER_API_BASE = "https://api.sleeper.com";

// Cache references (same instances used by playerStatsController)
// Export these so the controller can import them
export const statsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
export const projectionsCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });

// Preload every 5 minutes for stats, every 15 minutes for projections
const STATS_PRELOAD_SCHEDULE = "*/5 * * * *"; // Every 5 minutes
const PROJECTIONS_PRELOAD_SCHEDULE = "*/15 * * * *"; // Every 15 minutes

const CURRENT_SEASON = 2024;
const SEASON_TYPE = "regular";

/**
 * Get current NFL week (simplified - you may want to make this more robust)
 */
function getCurrentWeek(): number {
  const now = new Date();
  const seasonStart = new Date("2024-09-05"); // NFL season start
  const diffTime = Math.abs(now.getTime() - seasonStart.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 1), 18); // Week 1-18
}

/**
 * Preload and index season stats
 */
async function preloadSeasonStats(): Promise<void> {
  try {
    const currentSeason = CURRENT_SEASON;
    const previousSeason = currentSeason - 1;

    // Preload current and previous season
    for (const season of [currentSeason, previousSeason]) {
      const cacheKey = `season_stats_${season}_${SEASON_TYPE}`;
      const indexCacheKey = `${cacheKey}_index`;

      console.log(`[StatsPreloader] Preloading season stats for ${season}...`);

      const response = await axios.get(
        `${SLEEPER_API_BASE}/stats/nfl/${season}?season_type=${SEASON_TYPE}`
      );
      const allStats = response.data;

      // Store array in cache
      statsCache.set(cacheKey, allStats);

      // Create and store indexed version
      const statsIndex: Record<string, any> = {};
      if (allStats) {
        for (const stat of allStats) {
          if (stat.player_id) {
            statsIndex[stat.player_id] = stat;
          }
        }
      }

      statsCache.set(indexCacheKey, statsIndex);
      console.log(
        `[StatsPreloader] Cached season stats for ${season} with ${Object.keys(statsIndex).length} players`
      );
    }
  } catch (error: any) {
    console.error("[StatsPreloader] Error preloading season stats:", error.message);
  }
}

/**
 * Preload and aggregate week range projections
 */
async function preloadWeekRangeProjections(): Promise<void> {
  try {
    const currentWeek = getCurrentWeek();
    const endWeek = 18; // End of regular season
    const season = CURRENT_SEASON;

    // Only preload if we're still in the season
    if (currentWeek > endWeek) {
      console.log(`[StatsPreloader] Season ended, skipping week range preload`);
      return;
    }

    console.log(
      `[StatsPreloader] Preloading week range projections for weeks ${currentWeek}-${endWeek}...`
    );

    // Fetch projections for each week in parallel
    const weekPromises = [];
    for (let week = currentWeek; week <= endWeek; week++) {
      const weekCacheKey = `week_projections_${season}_${week}_${SEASON_TYPE}`;
      const weekIndexCacheKey = `${weekCacheKey}_index`;

      weekPromises.push(
        (async () => {
          try {
            const response = await axios.get(
              `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${SEASON_TYPE}`
            );
            const weekData = response.data;

            // Store array in cache
            projectionsCache.set(weekCacheKey, weekData);

            // Create and store indexed version
            const weekIndex: Record<string, any> = {};
            if (weekData) {
              for (const proj of weekData) {
                if (proj.player_id) {
                  weekIndex[proj.player_id] = proj;
                }
              }
            }

            projectionsCache.set(weekIndexCacheKey, weekIndex);
            console.log(`[StatsPreloader] Cached projections for week ${week}`);

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

    // Now aggregate across all weeks
    console.log(
      `[StatsPreloader] Aggregating projections for weeks ${currentWeek}-${endWeek}...`
    );

    const allPlayerAggregates: Record<string, any> = {};

    // Collect all unique player IDs across all weeks
    const allPlayerIds = new Set<string>();
    for (const response of weekResponses) {
      const weekIndex = response.index;
      for (const playerId of Object.keys(weekIndex)) {
        allPlayerIds.add(playerId);
      }
    }

    // Aggregate stats for ALL players
    for (const playerId of allPlayerIds) {
      const aggregatedStats: Record<string, number> = {};
      let weeksFound = 0;

      // Sum up stats across all weeks
      for (const response of weekResponses) {
        const weekIndex = response.index;
        const playerWeekProjection = weekIndex[playerId];

        if (playerWeekProjection && playerWeekProjection.stats) {
          weeksFound++;
          const stats = playerWeekProjection.stats;

          // Aggregate all numeric stats
          for (const [key, value] of Object.entries(stats)) {
            if (typeof value === "number") {
              aggregatedStats[key] = (aggregatedStats[key] || 0) + value;
            }
          }
        }
      }

      if (weeksFound > 0) {
        allPlayerAggregates[playerId] = {
          player_id: playerId,
          stats: aggregatedStats,
          weeks_included: weeksFound,
          week_range: `${currentWeek}-${endWeek}`,
        };
      }
    }

    // Cache the complete aggregated dataset
    const aggregateCacheKey = `week_range_aggregated_${season}_${currentWeek}_${endWeek}_${SEASON_TYPE}`;
    projectionsCache.set(aggregateCacheKey, allPlayerAggregates);
    console.log(
      `[StatsPreloader] Cached aggregated projections for weeks ${currentWeek}-${endWeek} with ${Object.keys(allPlayerAggregates).length} players`
    );
  } catch (error: any) {
    console.error(
      "[StatsPreloader] Error preloading week range projections:",
      error.message
    );
  }
}

/**
 * Preload season projections (fallback when week range not applicable)
 */
async function preloadSeasonProjections(): Promise<void> {
  try {
    const season = CURRENT_SEASON;
    const cacheKey = `season_projections_${season}_${SEASON_TYPE}`;
    const indexCacheKey = `${cacheKey}_index`;

    console.log(`[StatsPreloader] Preloading season projections for ${season}...`);

    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}?season_type=${SEASON_TYPE}`
    );
    const allProjections = response.data;

    // Store array in cache
    projectionsCache.set(cacheKey, allProjections);

    // Create and store indexed version
    const projectionsIndex: Record<string, any> = {};
    if (allProjections) {
      for (const proj of allProjections) {
        if (proj.player_id) {
          projectionsIndex[proj.player_id] = proj;
        }
      }
    }

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
