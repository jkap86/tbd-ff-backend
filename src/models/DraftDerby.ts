import pool from "../config/database";
import { setTransactionTimeouts } from "../utils/transactionTimeout";

export interface DraftDerby {
  id: number;
  draft_id: number;
  status: "pending" | "in_progress" | "completed";
  current_turn_roster_id: number | null;
  current_turn_started_at: Date | null;
  selection_order: number[]; // Array of roster IDs
  skipped_roster_ids: number[]; // Array of roster IDs that were skipped
  created_at: Date;
  updated_at: Date;
}

export interface DraftDerbySelection {
  id: number;
  derby_id: number;
  roster_id: number;
  draft_position: number;
  selected_at: Date;
}

export interface DerbyWithDetails extends DraftDerby {
  selections: DraftDerbySelection[];
  available_positions: number[];
}

/**
 * Create a new draft derby
 */
export async function createDraftDerby(
  draftId: number,
  rosterIds: number[]
): Promise<DraftDerby> {
  try {
    // Shuffle roster IDs to create random selection order
    const shuffled = [...rosterIds].sort(() => Math.random() - 0.5);

    const query = `
      INSERT INTO draft_derby (draft_id, selection_order, status)
      VALUES ($1, $2, 'pending')
      RETURNING *
    `;

    const result = await pool.query(query, [draftId, JSON.stringify(shuffled)]);

    const derby = result.rows[0];
    return {
      ...derby,
      selection_order: derby.selection_order,
      skipped_roster_ids: derby.skipped_roster_ids || [],
    };
  } catch (error: any) {
    console.error("Error creating draft derby:", error);

    if (error.code === "23505") {
      throw new Error("Derby already exists for this draft");
    }

    throw new Error("Error creating draft derby");
  }
}

/**
 * Get draft derby by draft ID
 */
export async function getDraftDerbyByDraftId(
  draftId: number
): Promise<DraftDerby | null> {
  try {
    const query = `
      SELECT * FROM draft_derby
      WHERE draft_id = $1
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      return null;
    }

    const derby = result.rows[0];
    return {
      ...derby,
      selection_order: derby.selection_order,
      skipped_roster_ids: derby.skipped_roster_ids || [],
    };
  } catch (error) {
    console.error("Error getting draft derby:", error);
    throw new Error("Error getting draft derby");
  }
}

/**
 * Get draft derby with all selections and available positions
 */
export async function getDraftDerbyWithDetails(
  draftId: number
): Promise<DerbyWithDetails | null> {
  try {
    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      return null;
    }

    // Get all selections
    const selectionsQuery = `
      SELECT * FROM draft_derby_selections
      WHERE derby_id = $1
      ORDER BY selected_at ASC
    `;

    const selectionsResult = await pool.query(selectionsQuery, [derby.id]);
    const selections = selectionsResult.rows;

    // Calculate available positions (1 to N where N = number of rosters)
    const totalPositions = derby.selection_order.length;
    const takenPositions = selections.map((s) => s.draft_position);
    const availablePositions = Array.from(
      { length: totalPositions },
      (_, i) => i + 1
    ).filter((pos) => !takenPositions.includes(pos));

    return {
      ...derby,
      selections,
      available_positions: availablePositions,
    };
  } catch (error) {
    console.error("Error getting draft derby with details:", error);
    throw new Error("Error getting draft derby with details");
  }
}

/**
 * Start the derby (set status to in_progress and set first turn)
 */
export async function startDraftDerby(draftId: number): Promise<DraftDerby> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      throw new Error("Derby not found");
    }

    if (derby.status !== "pending") {
      throw new Error(`Derby is already ${derby.status}`);
    }

    // Set first roster's turn
    const firstRosterId = derby.selection_order[0];

    const query = `
      UPDATE draft_derby
      SET status = 'in_progress',
          current_turn_roster_id = $1,
          current_turn_started_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE draft_id = $2
      RETURNING *
    `;

    const result = await client.query(query, [firstRosterId, draftId]);

    await client.query("COMMIT");

    const updatedDerby = result.rows[0];
    return {
      ...updatedDerby,
      selection_order: updatedDerby.selection_order,
      skipped_roster_ids: updatedDerby.skipped_roster_ids || [],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error starting draft derby:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Make a derby selection (roster selects their draft position)
 */
export async function makeDerbySelection(
  draftId: number,
  rosterId: number,
  draftPosition: number
): Promise<DraftDerbySelection> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      throw new Error("Derby not found");
    }

    if (derby.status !== "in_progress") {
      throw new Error("Derby is not in progress");
    }

    if (derby.current_turn_roster_id !== rosterId) {
      throw new Error("It is not your turn to select");
    }

    // Validate draft position is available
    const checkQuery = `
      SELECT id FROM draft_derby_selections
      WHERE derby_id = $1 AND draft_position = $2
    `;

    const checkResult = await client.query(checkQuery, [derby.id, draftPosition]);

    if (checkResult.rows.length > 0) {
      throw new Error("This draft position has already been selected");
    }

    // Insert selection
    const insertQuery = `
      INSERT INTO draft_derby_selections (derby_id, roster_id, draft_position)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const insertResult = await client.query(insertQuery, [
      derby.id,
      rosterId,
      draftPosition,
    ]);

    const selection = insertResult.rows[0];

    // Remove roster from skipped list if they were skipped
    const skippedRosterIds = derby.skipped_roster_ids.filter(
      (id) => id !== rosterId
    );

    // Calculate next turn
    await calculateNextTurn(
      derby,
      skippedRosterIds,
      client
    );

    await client.query("COMMIT");

    return selection;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error making derby selection:", error);

    if (error.code === "23505") {
      throw new Error("This draft position has already been selected");
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calculate and set the next turn
 */
async function calculateNextTurn(
  derby: DraftDerby,
  skippedRosterIds: number[],
  client: any
): Promise<{ rosterId: number | null; isComplete: boolean }> {
  // Get all selections so far
  const selectionsQuery = `
    SELECT roster_id FROM draft_derby_selections
    WHERE derby_id = $1
  `;

  const selectionsResult = await client.query(selectionsQuery, [derby.id]);
  const selectedRosterIds = selectionsResult.rows.map((r: any) => r.roster_id);

  // Check if derby is complete
  if (selectedRosterIds.length === derby.selection_order.length) {
    // Derby complete! Update status
    const completeQuery = `
      UPDATE draft_derby
      SET status = 'completed',
          current_turn_roster_id = NULL,
          current_turn_started_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await client.query(completeQuery, [derby.id]);

    return { rosterId: null, isComplete: true };
  }

  // Find next roster that hasn't selected yet
  // Priority: skipped rosters first, then follow selection order
  let nextRosterId: number | null = null;

  // Check skipped rosters first
  for (const rosterId of skippedRosterIds) {
    if (!selectedRosterIds.includes(rosterId)) {
      nextRosterId = rosterId;
      break;
    }
  }

  // If no skipped rosters, follow selection order
  if (!nextRosterId) {
    for (const rosterId of derby.selection_order) {
      if (!selectedRosterIds.includes(rosterId)) {
        nextRosterId = rosterId;
        break;
      }
    }
  }

  if (!nextRosterId) {
    throw new Error("Could not determine next roster");
  }

  // Update current turn
  const updateQuery = `
    UPDATE draft_derby
    SET current_turn_roster_id = $1,
        current_turn_started_at = CURRENT_TIMESTAMP,
        skipped_roster_ids = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `;

  await client.query(updateQuery, [
    nextRosterId,
    JSON.stringify(skippedRosterIds),
    derby.id,
  ]);

  return { rosterId: nextRosterId, isComplete: false };
}

/**
 * Skip current turn (timeout or manual skip)
 */
export async function skipDerbyTurn(draftId: number): Promise<DraftDerby> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      throw new Error("Derby not found");
    }

    if (derby.status !== "in_progress") {
      throw new Error("Derby is not in progress");
    }

    if (!derby.current_turn_roster_id) {
      throw new Error("No current turn to skip");
    }

    // Add current roster to skipped list
    const skippedRosterIds = [
      ...derby.skipped_roster_ids,
      derby.current_turn_roster_id,
    ];

    // Calculate next turn
    await calculateNextTurn(derby, skippedRosterIds, client);

    await client.query("COMMIT");

    // Fetch updated derby
    const updatedDerby = await getDraftDerbyByDraftId(draftId);
    return updatedDerby!;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error skipping derby turn:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Auto-assign a random available position (for timeout with 'auto' behavior)
 */
export async function autoAssignDerbyPosition(
  draftId: number
): Promise<DraftDerbySelection> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      throw new Error("Derby not found");
    }

    if (derby.status !== "in_progress") {
      throw new Error("Derby is not in progress");
    }

    if (!derby.current_turn_roster_id) {
      throw new Error("No current turn to auto-assign");
    }

    // Get available positions
    const derbyWithDetails = await getDraftDerbyWithDetails(draftId);

    if (!derbyWithDetails || derbyWithDetails.available_positions.length === 0) {
      throw new Error("No available positions to assign");
    }

    // Pick random available position
    const randomPosition =
      derbyWithDetails.available_positions[
        Math.floor(Math.random() * derbyWithDetails.available_positions.length)
      ];

    // Make selection
    const insertQuery = `
      INSERT INTO draft_derby_selections (derby_id, roster_id, draft_position)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const insertResult = await client.query(insertQuery, [
      derby.id,
      derby.current_turn_roster_id,
      randomPosition,
    ]);

    const selection = insertResult.rows[0];

    // Calculate next turn (don't add to skipped list for auto-assign)
    await calculateNextTurn(derby, derby.skipped_roster_ids, client);

    await client.query("COMMIT");

    return selection;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error auto-assigning derby position:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all selections for a derby
 */
export async function getDerbySelections(
  derbyId: number
): Promise<DraftDerbySelection[]> {
  try {
    const query = `
      SELECT * FROM draft_derby_selections
      WHERE derby_id = $1
      ORDER BY selected_at ASC
    `;

    const result = await pool.query(query, [derbyId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting derby selections:", error);
    throw new Error("Error getting derby selections");
  }
}

/**
 * Delete draft derby (used during draft reset)
 */
export async function deleteDraftDerby(draftId: number): Promise<void> {
  try {
    const query = `DELETE FROM draft_derby WHERE draft_id = $1`;
    await pool.query(query, [draftId]);
  } catch (error) {
    console.error("Error deleting draft derby:", error);
    throw new Error("Error deleting draft derby");
  }
}

/**
 * Reset draft derby (clear selections, reset to pending)
 */
export async function resetDraftDerby(draftId: number): Promise<DraftDerby | null> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query("BEGIN");

    const derby = await getDraftDerbyByDraftId(draftId);

    if (!derby) {
      return null;
    }

    // Delete all selections
    await client.query("DELETE FROM draft_derby_selections WHERE derby_id = $1", [
      derby.id,
    ]);

    // Reset derby to pending, re-randomize selection order
    const shuffled = [...derby.selection_order].sort(() => Math.random() - 0.5);

    const query = `
      UPDATE draft_derby
      SET status = 'pending',
          current_turn_roster_id = NULL,
          current_turn_started_at = NULL,
          selection_order = $1,
          skipped_roster_ids = '[]',
          updated_at = CURRENT_TIMESTAMP
      WHERE draft_id = $2
      RETURNING *
    `;

    const result = await client.query(query, [JSON.stringify(shuffled), draftId]);

    await client.query("COMMIT");

    const resetDerby = result.rows[0];
    return {
      ...resetDerby,
      selection_order: resetDerby.selection_order,
      skipped_roster_ids: resetDerby.skipped_roster_ids || [],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error resetting draft derby:", error);
    throw error;
  } finally {
    client.release();
  }
}
