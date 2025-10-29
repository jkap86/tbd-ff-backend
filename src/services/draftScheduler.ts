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
 * All times are in UTC
 */
function shouldBePaused(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): boolean {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
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
    // Use ->> to get as text, or cast the boolean: (settings->>'auto_pause_enabled')::boolean = true
    const query = `
      SELECT * FROM drafts
      WHERE (status = 'in_progress' OR status = 'paused')
        AND (settings->>'auto_pause_enabled')::boolean = true
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
          `[DraftScheduler] Auto-pausing draft ${draft.id} for overnight (${startHour}:${startMinute.toString().padStart(2, '0')} - ${endHour}:${endMinute.toString().padStart(2, '0')} UTC)`
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

        // Calculate pick deadline based on timer mode
        let pickDeadline = new Date();

        if (draft.timer_mode === 'chess') {
          // Chess timer mode: Set reasonable buffer to prevent immediate auto-pick
          // The actual chess timer deadline should be managed separately
          pickDeadline.setSeconds(pickDeadline.getSeconds() + 300); // 5 min buffer
          console.log(`[DraftScheduler] Chess mode: Resuming with buffer time`);
        } else {
          // Traditional mode: Use standard pick time
          pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);
        }

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
 * Check and auto-pause a single draft immediately (e.g., when draft starts)
 */
export async function checkAndAutoPauseDraft(draftId: number): Promise<void> {
  try {
    const query = `SELECT * FROM drafts WHERE id = $1`;
    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) return;

    const draft: Draft = result.rows[0];

    // Only check if draft has auto-pause enabled and is in progress
    if (draft.status !== 'in_progress' || !draft.settings?.auto_pause_enabled) {
      return;
    }

    const settings = draft.settings;
    const startHour = settings.auto_pause_start_hour ?? 23;
    const startMinute = settings.auto_pause_start_minute ?? 0;
    const endHour = settings.auto_pause_end_hour ?? 8;
    const endMinute = settings.auto_pause_end_minute ?? 0;

    const shouldPause = shouldBePaused(startHour, startMinute, endHour, endMinute);

    if (shouldPause) {
      console.log(`[DraftScheduler] Immediately auto-pausing draft ${draftId} for overnight`);

      const updatedDraft = await pauseDraft(draftId);

      // Stop auto-pick monitoring when paused
      stopAutoPickMonitoring(draftId);

      // Emit status change via WebSocket (if io is available)
      if (ioInstance) {
        ioInstance.to(`draft_${draftId}`).emit("status_changed", {
          status: "paused",
          draft: updatedDraft,
          timestamp: new Date(),
        });
      }
    }
  } catch (error: any) {
    console.error("[DraftScheduler] Error checking draft for immediate pause:", error);
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
