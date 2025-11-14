import cron from "node-cron";
import pool from "../config/database";
import { logger } from "../config/logger";
import { processWaivers } from "./waiverService";
import { withCronLogging } from "../utils/cronHelper";

/**
 * Waiver Scheduler Service
 * Processes waivers daily at 3 AM UTC for all leagues
 */

// Run at 3:00 AM UTC every day
const SCHEDULE = "0 3 * * *";

/**
 * Process waivers for all leagues that have pending claims
 */
async function processAllLeagueWaivers(): Promise<void> {
  logger.info("[WaiverScheduler] Starting scheduled waiver processing");

  // Get all leagues that have pending waiver claims
  const query = `
    SELECT DISTINCT league_id
    FROM waiver_claims
    WHERE status = 'pending'
  `;

  const result = await pool.query(query);
  const leagueIds = result.rows.map((row) => row.league_id);

  if (leagueIds.length === 0) {
    logger.info("[WaiverScheduler] No leagues with pending claims");
    return;
  }

  logger.info(`[WaiverScheduler] Processing waivers for ${leagueIds.length} leagues`);

  // Process waivers for each league with retry logic
  for (const leagueId of leagueIds) {
    try {
      logger.info(`[WaiverScheduler] Processing league ${leagueId}`);

      // Wrap each league's waiver processing with retry logic
      await withCronLogging(
        async () => await processWaivers(leagueId),
        `Waiver Processing for League ${leagueId}`,
        { maxAttempts: 3, baseDelayMs: 2000 }
      );

      logger.info(`[WaiverScheduler] Completed processing for league ${leagueId}`);
    } catch (error: any) {
      logger.error(
        `[WaiverScheduler] Error processing waivers for league ${leagueId} after all retries:`,
        { error }
      );
      // Continue with other leagues even if one fails permanently
    }
  }

  logger.info("[WaiverScheduler] Finished scheduled waiver processing");
}

/**
 * Start the waiver scheduler
 */
export function startWaiverScheduler(): void {
  logger.info("[WaiverScheduler] Starting waiver scheduler (daily at 3:00 AM UTC)");

  // Schedule the job
  cron.schedule(SCHEDULE, async () => {
    await processAllLeagueWaivers();
  });

  // Also run immediately on startup (optional, for testing)
  // Uncomment the line below if you want to process waivers on startup
  // processAllLeagueWaivers();
}

/**
 * Manually trigger waiver processing for testing
 */
export async function triggerWaiverProcessing(): Promise<void> {
  logger.info("[WaiverScheduler] Manually triggering waiver processing");
  await processAllLeagueWaivers();
}
