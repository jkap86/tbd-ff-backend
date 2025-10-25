import pool from "../config/database";

export interface DraftOrder {
  id: number;
  draft_id: number;
  roster_id: number;
  draft_position: number;
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
        do.*,
        r.roster_id as roster_number,
        u.id as user_id,
        u.username
      FROM draft_order do
      JOIN rosters r ON do.roster_id = r.id
      JOIN users u ON r.user_id = u.id
      WHERE do.draft_id = $1
      ORDER BY do.draft_position ASC
    `;

    const result = await pool.query(query, [draftId]);
    return result.rows;
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
