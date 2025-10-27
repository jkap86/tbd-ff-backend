import cron from "node-cron";
import pool from "../config/database";
import { Draft, pauseDraft, updateDraft } from "../models/Draft";
import { startAutoPickMonitoring, stopAutoPickMonitoring } from "./autoPickService";

/**
 * Draft Scheduler Service
 * Handles automatic pause/resume of drafts based on overnight settings
 */

// Check and update draft pause/resume status every minute
const SCHEDULE = "* * * * *"; // Every minute

// Store io reference
let ioInstance: any = null;

/**
 * Check if current time is within the pause window for a draft
 */
function shouldBePaused(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = startHour * 60 + startMinute;
  const endTimeInMinutes = endHour * 60 + endMinute;

  // Handle case where pause window crosses midnight
  if (startTimeInMinutes > endTimeInMinutes) {
    // Pause window crosses midnight (e.g., 11 PM to 8 AM)
    return (
      currentTimeInMinutes >= startTimeInMinutes ||
      currentTimeInMinutes < endTimeInMinutes
    );
  } else {
    // Pause window is within same day (e.g., 2 AM to 8 AM)
    return (
      currentTimeInMinutes >= startTimeInMinutes &&
      currentTimeInMinutes < endTimeInMinutes
    );
  }
}

/**
 * Check all drafts and pause/resume based on their overnight settings
 */
async function checkAndUpdateDraftStatuses(): Promise<void> {
  try {
    // Get all drafts that are either in_progress or paused with auto_pause settings
    const query = `
      SELECT * FROM drafts
      WHERE (status = 'in_progress' OR status = 'paused')
        AND settings->>'auto_pause_enabled' = 'true'
    `;

    const result = await pool.query(query);
    const drafts: Draft[] = result.rows;

    for (const draft of drafts) {
      const settings = draft.settings;

      if (!settings || settings.auto_pause_enabled !== true) {
        continue;
      }

      const startHour = settings.auto_pause_start_hour ?? 23;
      const startMinute = settings.auto_pause_start_minute ?? 0;
      const endHour = settings.auto_pause_end_hour ?? 8;
      const endMinute = settings.auto_pause_end_minute ?? 0;

      const shouldPause = shouldBePaused(
        startHour,
        startMinute,
        endHour,
        endMinute
      );

      // If draft should be paused but is currently in_progress
      if (shouldPause && draft.status === "in_progress") {
        console.log(
          `[DraftScheduler] Auto-pausing draft ${draft.id} for overnight (${startHour}:${startMinute.toString().padStart(2, '0')} - ${endHour}:${endMinute.toString().padStart(2, '0')})`
        );

        const updatedDraft = await pauseDraft(draft.id);

        // Stop auto-pick monitoring when paused
        stopAutoPickMonitoring(draft.id);

        // Emit status change via WebSocket (if io is available)
        if (ioInstance) {
          ioInstance.to(`draft_${draft.id}`).emit("status_changed", {
            status: "paused",
            draft: updatedDraft,
            timestamp: new Date(),
          });
        }
      }
      // If draft should be active but is currently paused
      else if (!shouldPause && draft.status === "paused") {
        console.log(
          `[DraftScheduler] Auto-resuming draft ${draft.id} after overnight pause`
        );

        // Reset pick deadline when resuming
        const pickDeadline = new Date();
        pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

        const updatedDraft = await updateDraft(draft.id, {
          status: "in_progress",
          pick_deadline: pickDeadline,
        });

        // Restart auto-pick monitoring when resumed
        startAutoPickMonitoring(draft.id);

        // Emit status change via WebSocket (if io is available)
        if (ioInstance) {
          ioInstance.to(`draft_${draft.id}`).emit("status_changed", {
            status: "in_progress",
            draft: updatedDraft,
            timestamp: new Date(),
          });
        }
      }
    }
  } catch (error: any) {
    console.error("[DraftScheduler] Error checking draft statuses:", error);
  }
}

/**
 * Start the draft scheduler
 */
export function startDraftScheduler(io?: any): void {
  console.log("[DraftScheduler] Starting draft scheduler (checking every minute)");

  // Store io instance if provided
  if (io) {
    ioInstance = io;
  }

  cron.schedule(SCHEDULE, async () => {
    await checkAndUpdateDraftStatuses();
  });
}
