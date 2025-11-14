import cron from "node-cron";
import { logger } from "../config/logger";
import { syncAllSeasons } from "./statsSync";
import { syncWeekRange } from "./projectionsSync";

/**
 * Schedule automatic stats and projections syncing
 */
export function startStatsScheduler(): void {
  logger.info("[StatsScheduler] Starting stats sync scheduler...");

  // Sync stats daily at 3 AM (after games are finalized)
  // Run in parallel for multiple seasons
  cron.schedule("0 3 * * *", async () => {
    logger.info("[StatsScheduler] Running daily stats sync...");
    try {
      // Sync last 3 seasons in parallel
      await syncAllSeasons(["2023", "2024", "2025"]);
      logger.info("[StatsScheduler] Daily stats sync completed");
    } catch (error) {
      logger.error("[StatsScheduler] Error in daily stats sync:", { error });
    }
  });

  // Sync projections every 6 hours during season
  cron.schedule("0 */6 * * *", async () => {
    logger.info("[StatsScheduler] Running projections sync...");
    try {
      const currentSeason = "2025";
      const currentWeek = 1; // TODO: Get actual current week
      const endWeek = 18;

      // Sync current week through end of season in parallel
      await syncWeekRange(currentSeason, currentWeek, endWeek);
      logger.info("[StatsScheduler] Projections sync completed");
    } catch (error) {
      logger.error("[StatsScheduler] Error in projections sync:", { error });
    }
  });

  logger.info("[StatsScheduler] Scheduler started successfully");
  logger.info("  - Stats sync: Daily at 3 AM");
  logger.info("  - Projections sync: Every 6 hours");
}

/**
 * Warm cache on server startup by syncing recent data
 */
export async function warmCache(): Promise<void> {
  logger.info("[StatsScheduler] Warming cache on startup...");

  try {
    // Sync stats for current and previous season in parallel
    await syncAllSeasons(["2024", "2025"]);

    // Sync projections for current season
    const currentSeason = "2025";
    const currentWeek = 1; // TODO: Get actual current week
    const endWeek = 18;
    await syncWeekRange(currentSeason, currentWeek, endWeek);

    logger.info("[StatsScheduler] Cache warmed successfully");
  } catch (error) {
    logger.error("[StatsScheduler] Error warming cache:", { error });
  }
}
