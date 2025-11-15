import pool from '../config/database';
import { getDraftById } from '../models/Draft';
import { eventBus } from '../index';
import { logger } from '../config/logger';

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
    logger.info("Deadline already passed for draft", { draft_id: draftId, context: 'DerbySocket' });
    return;
  }

  logger.info("Scheduled timeout for draft", { draft_id: draftId, delay_ms: delay, context: 'DerbySocket' });

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
    logger.info("Cancelled timer for draft", { draft_id: draftId, context: 'DerbySocket' });
  }
}

/**
 * Process derby timeout - auto-assign or skip based on settings
 */
async function processDerbyTimeout(draftId: number) {
  try {
    logger.info("Processing timeout for draft", { draft_id: draftId, context: 'DerbySocket' });

    // Import DraftDerby model functions
    const { getDraftDerbyByDraftId, autoAssignDerbyPosition, skipDerbyTurn, getDraftDerbyWithDetails } = await import('../models/DraftDerby');

    // Get derby status
    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      logger.info("No derby found for draft", { draft_id: draftId, context: 'DerbySocket' });
      return;
    }

    // Check if derby is still in progress
    if (derby.status !== 'in_progress') {
      logger.info("Derby not in progress", { derby_id: derby.id, status: derby.status, context: 'DerbySocket' });
      return;
    }

    const currentRosterId = derby.current_turn_roster_id;
    const onlySkippedRemaining = !currentRosterId && derby.skipped_roster_ids.length > 0;

    // Get draft to check timeout behavior
    const draft = await getDraftById(draftId);
    const timeoutBehavior = draft?.derby_timeout_behavior || 'auto';

    let derbyWithDetails;
    let autoAssignedPosition = null;
    let timedOutRosterId = currentRosterId; // Track which roster timed out

    // When only skipped remain, auto-assign ALL of them at once
    if (onlySkippedRemaining) {
      logger.info("Only skipped users remain - auto-assigning all remaining rosters", { draft_id: draftId, context: 'DerbySocket' });

      const { autoAssignAllSkippedRosters } = await import('../models/DraftDerby');
      const assignments = await autoAssignAllSkippedRosters(draftId);

      logger.info("Auto-assigned skipped rosters", { draft_id: draftId, count: assignments.length, context: 'DerbySocket' });

      // Update draft_order table for all assignments
      for (const assignment of assignments) {
        await pool.query(
          `INSERT INTO draft_order (draft_id, roster_id, draft_position)
           VALUES ($1, $2, $3)
           ON CONFLICT (draft_id, roster_id)
           DO UPDATE SET draft_position = $3`,
          [draftId, assignment.roster_id, assignment.draft_position]
        );

        // Emit selection made event for each assignment
        eventBus.emitToRoom(`draft_${draftId}`, 'derby:selection_made', {
          draftId,
          rosterId: assignment.roster_id,
          draftPosition: assignment.draft_position,
          isComplete: false, // Will check after
          selection: {
            id: assignment.id,
            derby_id: assignment.derby_id,
            roster_id: assignment.roster_id,
            draft_position: assignment.draft_position,
            selected_at: assignment.selected_at,
          },
        });
      }
    } else if (timeoutBehavior === 'auto') {
      // Normal timeout - auto-assign single roster
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

      logger.info("Auto-assigned position to roster", { draft_id: draftId, position: autoAssignedPosition, roster_id: timedOutRosterId, context: 'DerbySocket' });

      // Emit selection made event for auto-assign
      eventBus.emitToRoom(`draft_${draftId}`, 'derby:selection_made', {
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
      logger.info("Skipped roster turn", { draft_id: draftId, roster_id: currentRosterId, context: 'DerbySocket' });
    }

    // Get updated derby details
    derbyWithDetails = await getDraftDerbyWithDetails(draftId);

    if (!derbyWithDetails) {
      logger.error("Could not get updated derby details", { draft_id: draftId, context: 'DerbySocket' });
      return;
    }

    const isComplete = derbyWithDetails.status === 'completed';
    const nextRosterId = derbyWithDetails.current_turn_roster_id;
    const skippedRosterIds = derbyWithDetails.skipped_roster_ids;
    const updatedOnlySkippedRemaining = nextRosterId === null && skippedRosterIds.length > 0;

    if (isComplete) {
      // Emit completion event
      eventBus.emitToRoom(`draft_${draftId}`, 'derby:completed', {
        draftId,
        message: 'Derby completed - all positions assigned',
      });

      logger.info("Derby completed", { derby_id: derby.id, context: 'DerbySocket' });
    } else {
      // Determine which timer to use for the next turn
      let timerDuration = draft?.derby_time_limit_seconds || 60;

      if (updatedOnlySkippedRemaining) {
        // Use skipped user timer if configured, otherwise use normal timer
        timerDuration = draft?.derby_skipped_user_time_limit_seconds || timerDuration;
        logger.info("Only skipped users remain, using skipped timer", { duration_seconds: timerDuration, context: 'DerbySocket' });
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
      logger.debug("Emitting derby:timeout event", { draft_id: draftId, event_data: timeoutEventData, context: 'DerbySocket' });
      eventBus.emitToRoom(`draft_${draftId}`, 'derby:timeout', timeoutEventData);

      // Emit turn changed event
      const turnChangedEventData = {
        draftId,
        currentRosterId: nextRosterId,
        skippedRosterIds,
        onlySkippedRemaining: updatedOnlySkippedRemaining,
        turnDeadline: newDeadline.toISOString(),
      };
      logger.debug("Emitting derby:turn_changed event", { draft_id: draftId, event_data: turnChangedEventData, context: 'DerbySocket' });
      eventBus.emitToRoom(`draft_${draftId}`, 'derby:turn_changed', turnChangedEventData);

      // Schedule next timeout
      scheduleDerbyTimeout(draftId, newDeadline);

      logger.info("Moved to next turn for draft", { draft_id: draftId, next_roster_id: nextRosterId, only_skipped_remaining: onlySkippedRemaining, context: 'DerbySocket' });
    }
  } catch (error: any) {
    logger.error('Error processing timeout', { error, context: 'DerbySocket' });
  }
}

export function setupDerbySocket() {
  // Socket handlers can be added here if needed
  logger.info('Derby socket handlers initialized', { context: 'DerbySocket' });
}
