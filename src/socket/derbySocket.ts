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
  const client = await pool.connect();

  try {
    console.log(`[DerbyTimer] Processing timeout for draft ${draftId}`);

    await client.query('BEGIN');

    // Get derby status
    const derbyResult = await client.query(
      `SELECT * FROM draft_derby WHERE draft_id = $1`,
      [draftId]
    );

    if (derbyResult.rows.length === 0) {
      console.log(`[DerbyTimer] No derby found for draft ${draftId}`);
      await client.query('ROLLBACK');
      return;
    }

    const derby = derbyResult.rows[0];

    // Check if derby is still in progress
    if (derby.status !== 'in_progress') {
      console.log(`[DerbyTimer] Derby ${derby.id} not in progress (status: ${derby.status})`);
      await client.query('ROLLBACK');
      return;
    }

    // Parse derby order
    const derbyOrder = typeof derby.derby_order === 'string'
      ? JSON.parse(derby.derby_order)
      : derby.derby_order;

    const currentRosterId = derbyOrder[derby.current_turn];

    // Get draft to check timeout behavior
    const draft = await getDraftById(draftId);
    const timeoutBehavior = draft?.derby_timeout_behavior || 'auto';

    let nextTurn = derby.current_turn + 1;
    const isComplete = nextTurn >= derbyOrder.length;

    if (timeoutBehavior === 'auto') {
      // Auto-assign: Pick first available position
      const selectedPositions = await client.query(
        `SELECT draft_position FROM draft_derby_selections WHERE derby_id = $1`,
        [derby.id]
      );

      const taken = selectedPositions.rows.map(r => r.draft_position);
      const availablePositions = Array.from(
        { length: derbyOrder.length },
        (_, i) => i + 1
      ).filter(pos => !taken.includes(pos));

      if (availablePositions.length === 0) {
        console.log(`[DerbyTimer] No available positions for auto-assign`);
        await client.query('ROLLBACK');
        return;
      }

      const autoPosition = availablePositions[0];

      // Record the auto-selection
      await client.query(
        `INSERT INTO draft_derby_selections (derby_id, roster_id, draft_position, selected_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [derby.id, currentRosterId, autoPosition]
      );

      // Update draft_order table
      await client.query(
        `INSERT INTO draft_order (draft_id, roster_id, draft_position)
         VALUES ($1, $2, $3)
         ON CONFLICT (draft_id, roster_id)
         DO UPDATE SET draft_position = $3`,
        [draftId, currentRosterId, autoPosition]
      );

      console.log(`[DerbyTimer] Auto-assigned position ${autoPosition} to roster ${currentRosterId}`);
    } else {
      // Skip: Just move to next turn
      console.log(`[DerbyTimer] Skipped roster ${currentRosterId}`);
    }

    // Update derby state
    if (isComplete) {
      await client.query(
        `UPDATE draft_derby
         SET status = 'completed', current_turn = $1, turn_deadline = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [nextTurn, derby.id]
      );

      await client.query('COMMIT');

      // Emit completion event
      io.to(`draft-${draftId}`).emit('derby:completed', {
        draftId,
        message: 'Derby completed - all positions assigned',
      });

      console.log(`[DerbyTimer] Derby ${derby.id} completed`);
    } else {
      // Move to next turn
      const derbyTimeLimit = draft?.derby_time_limit_seconds || 60;
      const newDeadline = new Date(Date.now() + derbyTimeLimit * 1000);

      await client.query(
        `UPDATE draft_derby
         SET current_turn = $1, turn_deadline = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextTurn, newDeadline, derby.id]
      );

      await client.query('COMMIT');

      const nextRosterId = derbyOrder[nextTurn];

      // Emit timeout event
      io.to(`draft-${draftId}`).emit('derby:timeout', {
        draftId,
        rosterId: currentRosterId,
        timeoutBehavior,
        autoAssignedPosition: timeoutBehavior === 'auto' ? (await client.query(
          `SELECT draft_position FROM draft_derby_selections WHERE derby_id = $1 AND roster_id = $2`,
          [derby.id, currentRosterId]
        )).rows[0]?.draft_position : null,
      });

      // Emit turn changed event
      io.to(`draft-${draftId}`).emit('derby:turn_changed', {
        draftId,
        currentTurn: nextTurn,
        currentRosterId: nextRosterId,
        turnDeadline: newDeadline.toISOString(),
      });

      // Schedule next timeout
      scheduleDerbyTimeout(draftId, newDeadline);

      console.log(`[DerbyTimer] Moved to next turn (${nextTurn}) for draft ${draftId}`);
    }
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[DerbyTimer] Error processing timeout:', error);
  } finally {
    client.release();
  }
}

export function setupDerbySocket() {
  // Socket handlers can be added here if needed
  console.log('[DerbySocket] Derby socket handlers initialized');
}
