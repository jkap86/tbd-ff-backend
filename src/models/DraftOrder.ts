import pool from "../config/database";

export interface DraftOrder {
  id: number;
  draft_id: number;
  roster_id: number;
  draft_position: number;
  is_autodrafting: boolean;
  time_remaining_seconds: number | null;
  time_used_seconds: number;
  created_at: Date;
}

/**
 * Set draft order for a draft
 */
export async function setDraftOrder(
  draftId: number,
  rosterPositions: Array<{ roster_id: number; draft_position: number }>
): Promise<DraftOrder[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete existing draft order if any
    await client.query("DELETE FROM draft_order WHERE draft_id = $1", [
      draftId,
    ]);

    // Insert new draft order
    const orders: DraftOrder[] = [];
    for (const { roster_id, draft_position } of rosterPositions) {
      const query = `
        INSERT INTO draft_order (draft_id, roster_id, draft_position)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const result = await client.query(query, [
        draftId,
        roster_id,
        draft_position,
      ]);
      orders.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return orders;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error setting draft order:", error);

    if (error.code === "23505") {
      throw new Error("Duplicate draft position or roster in order");
    }

    throw new Error("Error setting draft order");
  } finally {
    client.release();
  }
}

/**
 * Get draft order for a draft
 */
export async function getDraftOrder(draftId: number): Promise<DraftOrder[]> {
  try {
    const query = `
      SELECT * FROM draft_order
      WHERE draft_id = $1
      ORDER BY draft_position ASC
    `;

    const result = await pool.query(query, [draftId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting draft order:", error);
    throw new Error("Error getting draft order");
  }
}

/**
 * Get draft order with roster and user details
 */
export async function getDraftOrderWithDetails(draftId: number): Promise<any[]> {
  try {
    const query = `
      SELECT
        d.*,
        r.roster_id as roster_number,
        r.settings,
        u.id as user_id,
        u.username
      FROM draft_order d
      JOIN rosters r ON d.roster_id = r.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE d.draft_id = $1
      ORDER BY d.draft_position ASC
    `;

    const result = await pool.query(query, [draftId]);

    // Add team_name from settings if available
    return result.rows.map(row => ({
      ...row,
      team_name: row.settings?.team_name || null,
    }));
  } catch (error) {
    console.error("Error getting draft order with details:", error);
    throw new Error("Error getting draft order with details");
  }
}

/**
 * Get roster ID at a specific draft position
 */
export async function getRosterAtPosition(
  draftId: number,
  position: number
): Promise<number | null> {
  try {
    const query = `
      SELECT roster_id FROM draft_order
      WHERE draft_id = $1 AND draft_position = $2
    `;

    const result = await pool.query(query, [draftId, position]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].roster_id;
  } catch (error) {
    console.error("Error getting roster at position:", error);
    throw new Error("Error getting roster at position");
  }
}

/**
 * Get draft position for a roster
 */
export async function getRosterPosition(
  draftId: number,
  rosterId: number
): Promise<number | null> {
  try {
    const query = `
      SELECT draft_position FROM draft_order
      WHERE draft_id = $1 AND roster_id = $2
    `;

    const result = await pool.query(query, [draftId, rosterId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].draft_position;
  } catch (error) {
    console.error("Error getting roster position:", error);
    throw new Error("Error getting roster position");
  }
}

/**
 * Randomize draft order
 */
export async function randomizeDraftOrder(
  draftId: number,
  rosterIds: number[]
): Promise<DraftOrder[]> {
  try {
    // Shuffle roster IDs
    const shuffled = [...rosterIds].sort(() => Math.random() - 0.5);

    // Create roster position pairs
    const rosterPositions = shuffled.map((roster_id, index) => ({
      roster_id,
      draft_position: index + 1,
    }));

    return await setDraftOrder(draftId, rosterPositions);
  } catch (error) {
    console.error("Error randomizing draft order:", error);
    throw new Error("Error randomizing draft order");
  }
}

/**
 * Toggle autodraft status for a roster in a draft
 */
export async function toggleAutodraft(
  draftId: number,
  rosterId: number,
  isAutodrafting: boolean
): Promise<DraftOrder | null> {
  try {
    const query = `
      UPDATE draft_order
      SET is_autodrafting = $1
      WHERE draft_id = $2 AND roster_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [isAutodrafting, draftId, rosterId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error toggling autodraft:", error);
    throw new Error("Error toggling autodraft");
  }
}

/**
 * Initialize chess timer budgets for all rosters in a draft
 * Called when a chess mode draft is started
 */
export async function initializeChessTimerBudgets(
  draftId: number,
  budgetSeconds: number
): Promise<void> {
  try {
    console.log(`[DraftOrder] Initializing chess timer budgets for draft ${draftId}: ${budgetSeconds}s per team`);

    const query = `
      UPDATE draft_order
      SET time_remaining_seconds = $1,
          time_used_seconds = 0
      WHERE draft_id = $2
    `;

    const result = await pool.query(query, [budgetSeconds, draftId]);

    console.log(`[DraftOrder] Initialized ${result.rowCount} rosters with ${budgetSeconds}s budget`);
  } catch (error) {
    console.error("Error initializing chess timer budgets:", error);
    throw new Error("Error initializing chess timer budgets");
  }
}

/**
 * Update a roster's time remaining after a pick
 * Deducts time used and updates time_used_seconds
 */
export async function updateRosterTimeRemaining(
  draftId: number,
  rosterId: number,
  timeUsedSeconds: number
): Promise<DraftOrder | null> {
  try {
    console.log(`[DraftOrder] Updating time for roster ${rosterId} in draft ${draftId}: -${timeUsedSeconds}s`);

    const query = `
      UPDATE draft_order
      SET time_remaining_seconds = GREATEST(0, time_remaining_seconds - $1),
          time_used_seconds = time_used_seconds + $1
      WHERE draft_id = $2 AND roster_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [timeUsedSeconds, draftId, rosterId]);

    if (result.rows.length === 0) {
      console.error(`[DraftOrder] Roster ${rosterId} not found in draft ${draftId}`);
      return null;
    }

    const updatedOrder = result.rows[0];
    console.log(`[DraftOrder] Time updated for roster ${rosterId}: ${updatedOrder.time_remaining_seconds}s remaining, ${updatedOrder.time_used_seconds}s used`);

    return updatedOrder;
  } catch (error) {
    console.error("Error updating roster time remaining:", error);
    throw new Error("Error updating roster time remaining");
  }
}

/**
 * Adjust a roster's time budget (commissioner override)
 * Can be positive (add time) or negative (remove time)
 */
export async function adjustRosterTime(
  draftId: number,
  rosterId: number,
  timeAdjustmentSeconds: number
): Promise<DraftOrder | null> {
  try {
    console.log(`[DraftOrder] Commissioner adjusting time for roster ${rosterId}: ${timeAdjustmentSeconds > 0 ? '+' : ''}${timeAdjustmentSeconds}s`);

    const query = `
      UPDATE draft_order
      SET time_remaining_seconds = GREATEST(0, time_remaining_seconds + $1)
      WHERE draft_id = $2 AND roster_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [timeAdjustmentSeconds, draftId, rosterId]);

    if (result.rows.length === 0) {
      console.error(`[DraftOrder] Roster ${rosterId} not found in draft ${draftId}`);
      return null;
    }

    const updatedOrder = result.rows[0];
    console.log(`[DraftOrder] Time adjusted for roster ${rosterId}: ${updatedOrder.time_remaining_seconds}s remaining`);

    return updatedOrder;
  } catch (error) {
    console.error("Error adjusting roster time:", error);
    throw new Error("Error adjusting roster time");
  }
}

/**
 * Get time remaining for a specific roster
 */
export async function getRosterTimeRemaining(
  draftId: number,
  rosterId: number
): Promise<number | null> {
  try {
    const query = `
      SELECT time_remaining_seconds
      FROM draft_order
      WHERE draft_id = $1 AND roster_id = $2
    `;

    const result = await pool.query(query, [draftId, rosterId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].time_remaining_seconds;
  } catch (error) {
    console.error("Error getting roster time remaining:", error);
    throw new Error("Error getting roster time remaining");
  }
}
