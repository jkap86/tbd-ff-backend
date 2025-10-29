import cron from "node-cron";
import pool from "../config/database";
import { processWaivers } from "./waiverService";

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
  try {
    console.log("[WaiverScheduler] Starting scheduled waiver processing");

    // Get all leagues that have pending waiver claims
    const query = `
      SELECT DISTINCT league_id
      FROM waiver_claims
      WHERE status = 'pending'
    `;

    const result = await pool.query(query);
    const leagueIds = result.rows.map((row) => row.league_id);

    if (leagueIds.length === 0) {
      console.log("[WaiverScheduler] No leagues with pending claims");
      return;
    }

    console.log(`[WaiverScheduler] Processing waivers for ${leagueIds.length} leagues`);

    // Process waivers for each league
    for (const leagueId of leagueIds) {
      try {
        console.log(`[WaiverScheduler] Processing league ${leagueId}`);
        await processWaivers(leagueId);
        console.log(`[WaiverScheduler] Completed processing for league ${leagueId}`);
      } catch (error: any) {
        console.error(
          `[WaiverScheduler] Error processing waivers for league ${leagueId}:`,
          error
        );
        // Continue with other leagues even if one fails
      }
    }

    console.log("[WaiverScheduler] Finished scheduled waiver processing");
  } catch (error: any) {
    console.error("[WaiverScheduler] Error in scheduled waiver processing:", error);
  }
}

/**
 * Start the waiver scheduler
 */
export function startWaiverScheduler(): void {
  console.log("[WaiverScheduler] Starting waiver scheduler (daily at 3:00 AM UTC)");

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
  console.log("[WaiverScheduler] Manually triggering waiver processing");
  await processAllLeagueWaivers();
}
