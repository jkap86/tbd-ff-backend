import pool from '../config/database';
import { getDraftById } from '../models/Draft';
import { io } from '../index';

// Track active derby timers
const derbyTimers = new Map<number, NodeJS.Timeout>();

/**
 * Schedule automatic timeout handling for derby turns
 */
export function scheduleDerbyTimeout(draftId: number, deadline: Date) {
  // Clear any existing timer for this draft
  const existingTimer = derbyTimers.get(draftId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const now = new Date();
  const delay = deadline.getTime() - now.getTime();

  if (delay <= 0) {
    // Deadline already passed
    console.log(`[DerbyTimer] Deadline already passed for draft ${draftId}`);
    return;
  }

  console.log(`[DerbyTimer] Scheduled timeout for draft ${draftId} in ${delay}ms`);

  const timer = setTimeout(async () => {
    await processDerbyTimeout(draftId);
  }, delay);

  derbyTimers.set(draftId, timer);
}

/**
 * Cancel derby timer (when selection is made or derby completes)
 */
export function cancelDerbyTimer(draftId: number) {
  const existingTimer = derbyTimers.get(draftId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    derbyTimers.delete(draftId);
    console.log(`[DerbyTimer] Cancelled timer for draft ${draftId}`);
  }
}

/**
 * Process derby timeout - auto-assign or skip based on settings
 */
async function processDerbyTimeout(draftId: number) {
  try {
    console.log(`[DerbyTimer] Processing timeout for draft ${draftId}`);

    // Import DraftDerby model functions
    const { getDraftDerbyByDraftId, autoAssignDerbyPosition, skipDerbyTurn, getDraftDerbyWithDetails } = await import('../models/DraftDerby');

    // Get derby status
    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      console.log(`[DerbyTimer] No derby found for draft ${draftId}`);
      return;
    }

    // Check if derby is still in progress
    if (derby.status !== 'in_progress') {
      console.log(`[DerbyTimer] Derby ${derby.id} not in progress (status: ${derby.status})`);
      return;
    }

    const currentRosterId = derby.current_turn_roster_id;
    const onlySkippedRemaining = !currentRosterId && derby.skipped_roster_ids.length > 0;

    if (onlySkippedRemaining) {
      console.log(`[DerbyTimer] No current roster on the clock (only skipped users remain)`);
    }

    // Get draft to check timeout behavior
    const draft = await getDraftById(draftId);
    const timeoutBehavior = draft?.derby_timeout_behavior || 'auto';

    let derbyWithDetails;
    let autoAssignedPosition = null;
    let timedOutRosterId = currentRosterId; // Track which roster timed out

    // When only skipped remain, ALWAYS auto-assign (can't skip to anyone)
    if (timeoutBehavior === 'auto' || onlySkippedRemaining) {
      // Auto-assign a random available position
      const selection = await autoAssignDerbyPosition(draftId);
      autoAssignedPosition = selection.draft_position;
      timedOutRosterId = selection.roster_id;

      // Update draft_order table
      await pool.query(
        `INSERT INTO draft_order (draft_id, roster_id, draft_position)
         VALUES ($1, $2, $3)
         ON CONFLICT (draft_id, roster_id)
         DO UPDATE SET draft_position = $3`,
        [draftId, timedOutRosterId, autoAssignedPosition]
      );

      console.log(`[DerbyTimer] Auto-assigned position ${autoAssignedPosition} to roster ${timedOutRosterId}`);

      // Emit selection made event for auto-assign
      io.to(`draft_${draftId}`).emit('derby:selection_made', {
        draftId,
        rosterId: timedOutRosterId,
        draftPosition: autoAssignedPosition,
        isComplete: false, // We'll check this after getting updated derby
        selection: {
          id: selection.id,
          derby_id: selection.derby_id,
          roster_id: selection.roster_id,
          draft_position: selection.draft_position,
          selected_at: selection.selected_at,
        },
      });
    } else {
      // Skip: NFL-style skip (roster can still pick later)
      // Note: This only happens when there's a current roster on the clock
      await skipDerbyTurn(draftId);
      console.log(`[DerbyTimer] Skipped roster ${currentRosterId} (can still pick later)`);
    }

    // Get updated derby details
    derbyWithDetails = await getDraftDerbyWithDetails(draftId);

    if (!derbyWithDetails) {
      console.error(`[DerbyTimer] Could not get updated derby details`);
      return;
    }

    const isComplete = derbyWithDetails.status === 'completed';
    const nextRosterId = derbyWithDetails.current_turn_roster_id;
    const skippedRosterIds = derbyWithDetails.skipped_roster_ids;
    const updatedOnlySkippedRemaining = nextRosterId === null && skippedRosterIds.length > 0;

    if (isComplete) {
      // Emit completion event
      io.to(`draft_${draftId}`).emit('derby:completed', {
        draftId,
        message: 'Derby completed - all positions assigned',
      });

      console.log(`[DerbyTimer] Derby ${derby.id} completed`);
    } else {
      // Determine which timer to use for the next turn
      let timerDuration = draft?.derby_time_limit_seconds || 60;

      if (updatedOnlySkippedRemaining) {
        // Use skipped user timer if configured, otherwise use normal timer
        timerDuration = draft?.derby_skipped_user_time_limit_seconds || timerDuration;
        console.log(`[DerbyTimer] Only skipped users remain, using timer: ${timerDuration}s`);
      }

      const newDeadline = new Date(Date.now() + timerDuration * 1000);

      // Emit timeout event
      const timeoutEventData = {
        draftId,
        rosterId: timedOutRosterId,
        timeoutBehavior,
        autoAssignedPosition,
        skippedRosterIds,
        onlySkippedRemaining: updatedOnlySkippedRemaining,
      };
      console.log(`[DerbyTimer] Emitting derby:timeout to draft_${draftId}:`, timeoutEventData);
      io.to(`draft_${draftId}`).emit('derby:timeout', timeoutEventData);

      // Emit turn changed event
      const turnChangedEventData = {
        draftId,
        currentRosterId: nextRosterId,
        skippedRosterIds,
        onlySkippedRemaining: updatedOnlySkippedRemaining,
        turnDeadline: newDeadline.toISOString(),
      };
      console.log(`[DerbyTimer] Emitting derby:turn_changed to draft_${draftId}:`, turnChangedEventData);
      io.to(`draft_${draftId}`).emit('derby:turn_changed', turnChangedEventData);

      // Schedule next timeout
      scheduleDerbyTimeout(draftId, newDeadline);

      console.log(`[DerbyTimer] Moved to next turn for draft ${draftId}, nextRosterId: ${nextRosterId}, onlySkippedRemaining: ${onlySkippedRemaining}`);
    }
  } catch (error: any) {
    console.error('[DerbyTimer] Error processing timeout:', error);
  }
}

export function setupDerbySocket() {
  // Socket handlers can be added here if needed
  console.log('[DerbySocket] Derby socket handlers initialized');
}
