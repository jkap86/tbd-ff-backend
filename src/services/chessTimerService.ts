import { getDraftById } from "../models/Draft";
import {
  getRosterTimeRemaining,
  updateRosterTimeRemaining
} from "../models/DraftOrder";
import { io } from "../index";

/**
 * Map to track when each pick started (draftId -> timestamp)
 * Used to calculate elapsed time for the current pick
 */
const pickStartTimes: Map<number, Date> = new Map();

/**
 * Map to track active monitoring intervals for each draft
 */
const activeMonitors: Map<number, NodeJS.Timeout> = new Map();

/**
 * Start the chess timer for the current pick
 * Records when the pick started so we can calculate time used later
 */
export function startChessTimer(draftId: number): void {
  const now = new Date();
  pickStartTimes.set(draftId, now);
  console.log(`[ChessTimer] Started timer for draft ${draftId} at ${now.toISOString()}`);
}

/**
 * Pause/Stop the chess timer for the current pick
 * Calculates time used and deducts it from the roster's time budget
 * Returns the time used in seconds
 */
export async function pauseChessTimer(
  draftId: number,
  rosterId: number
): Promise<number> {
  try {
    const startTime = pickStartTimes.get(draftId);

    if (!startTime) {
      console.warn(`[ChessTimer] No start time found for draft ${draftId}, assuming 0 seconds used`);
      return 0;
    }

    // Calculate elapsed time in seconds
    const now = new Date();
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    console.log(`[ChessTimer] Pausing timer for draft ${draftId}, roster ${rosterId}: ${elapsedSeconds}s elapsed`);

    // Update the roster's time remaining in the database
    await updateRosterTimeRemaining(draftId, rosterId, elapsedSeconds);

    // Clear the start time
    pickStartTimes.delete(draftId);

    // Emit final time update to all clients
    const timeRemaining = await getRosterTimeRemaining(draftId, rosterId);
    if (timeRemaining !== null) {
      emitTimeUpdate(draftId, rosterId, timeRemaining);
    }

    return elapsedSeconds;
  } catch (error) {
    console.error(`[ChessTimer] Error pausing chess timer:`, error);
    throw error;
  }
}

/**
 * Get the current time remaining for a roster
 * If the roster is currently picking, calculates real-time remaining time
 * Otherwise, returns the stored time remaining from database
 */
export async function getRosterTimeRemainingLive(
  draftId: number,
  rosterId: number
): Promise<number | null> {
  try {
    // Get stored time remaining from database
    const storedTimeRemaining = await getRosterTimeRemaining(draftId, rosterId);

    if (storedTimeRemaining === null) {
      return null;
    }

    // Check if this roster is currently picking (has active timer)
    const startTime = pickStartTimes.get(draftId);
    if (!startTime) {
      // Not currently picking, return stored value
      return storedTimeRemaining;
    }

    // Check if this is the roster currently picking
    const draft = await getDraftById(draftId);
    if (!draft || draft.current_roster_id !== rosterId) {
      // Different roster is picking, return stored value
      return storedTimeRemaining;
    }

    // Calculate real-time remaining
    const now = new Date();
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const realTimeRemaining = Math.max(0, storedTimeRemaining - elapsedSeconds);

    return realTimeRemaining;
  } catch (error) {
    console.error(`[ChessTimer] Error getting roster time remaining:`, error);
    return null;
  }
}

/**
 * Check if a roster has timed out (0 seconds remaining)
 */
export async function hasRosterTimedOut(
  draftId: number,
  rosterId: number
): Promise<boolean> {
  try {
    const timeRemaining = await getRosterTimeRemainingLive(draftId, rosterId);

    if (timeRemaining === null) {
      // Traditional mode or time not initialized
      return false;
    }

    const hasTimedOut = timeRemaining <= 0;

    if (hasTimedOut) {
      console.log(`[ChessTimer] Roster ${rosterId} in draft ${draftId} has TIMED OUT (0s remaining)`);
    }

    return hasTimedOut;
  } catch (error) {
    console.error(`[ChessTimer] Error checking roster timeout:`, error);
    return false;
  }
}

/**
 * Emit a time update via Socket.io to all clients in the draft room
 */
export function emitTimeUpdate(
  draftId: number,
  rosterId: number,
  timeRemaining: number
): void {
  io.to(`draft_${draftId}`).emit("chess_timer_update", {
    draft_id: draftId,
    roster_id: rosterId,
    time_remaining_seconds: timeRemaining,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Start monitoring chess timer for a draft
 * Emits updates every second to all connected clients
 * Automatically handles roster timeouts
 */
export async function startChessTimerMonitoring(draftId: number): Promise<void> {
  try {
    // Stop any existing monitoring
    stopChessTimerMonitoring(draftId);

    console.log(`[ChessTimer] Starting monitoring for draft ${draftId}`);

    // Check every second and emit updates
    const interval = setInterval(async () => {
      try {
        const draft = await getDraftById(draftId);

        // Stop monitoring if draft is no longer in progress
        if (!draft || draft.status !== "in_progress") {
          console.log(`[ChessTimer] Draft ${draftId} is not in progress, stopping monitoring`);
          stopChessTimerMonitoring(draftId);
          return;
        }

        // Only emit updates in chess mode
        if (draft.timer_mode !== "chess") {
          return;
        }

        // Get current roster
        const currentRosterId = draft.current_roster_id;
        if (!currentRosterId) {
          return;
        }

        // Get real-time remaining for current roster
        const timeRemaining = await getRosterTimeRemainingLive(draftId, currentRosterId);
        if (timeRemaining === null) {
          return;
        }

        // Emit time update
        emitTimeUpdate(draftId, currentRosterId, timeRemaining);

        // Check for timeout (will be handled by autopick service)
        if (timeRemaining <= 0) {
          console.log(`[ChessTimer] Roster ${currentRosterId} has run out of time!`);
          // Note: Actual auto-pick logic should be handled by autoPickService
          // We just emit the timeout event here
          io.to(`draft_${draftId}`).emit("chess_timer_timeout", {
            draft_id: draftId,
            roster_id: currentRosterId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(`[ChessTimer] Error in monitoring loop for draft ${draftId}:`, error);
      }
    }, 1000); // Update every second

    activeMonitors.set(draftId, interval);
  } catch (error) {
    console.error(`[ChessTimer] Error starting monitoring for draft ${draftId}:`, error);
    throw error;
  }
}

/**
 * Stop monitoring chess timer for a draft
 * Cleans up interval and removes from active monitors
 */
export function stopChessTimerMonitoring(draftId: number): void {
  const interval = activeMonitors.get(draftId);
  if (interval) {
    clearInterval(interval);
    activeMonitors.delete(draftId);
    console.log(`[ChessTimer] Stopped monitoring for draft ${draftId}`);
  }

  // Also clear pick start time if exists
  if (pickStartTimes.has(draftId)) {
    pickStartTimes.delete(draftId);
    console.log(`[ChessTimer] Cleared pick start time for draft ${draftId}`);
  }
}

/**
 * Stop all chess timer monitoring (called on server shutdown)
 */
export function stopAllChessTimerMonitoring(): void {
  console.log(`[ChessTimer] Stopping all chess timer monitoring (${activeMonitors.size} active)`);

  for (const draftId of activeMonitors.keys()) {
    stopChessTimerMonitoring(draftId);
  }

  // Clear all pick start times
  pickStartTimes.clear();

  console.log(`[ChessTimer] All chess timer monitoring stopped`);
}

/**
 * Get all currently active draft monitors (for debugging)
 */
export function getActiveMonitors(): number[] {
  return Array.from(activeMonitors.keys());
}
