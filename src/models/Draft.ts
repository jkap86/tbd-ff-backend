import pool from "../config/database";

export interface Draft {
  id: number;
  league_id: number;
  draft_type: "snake" | "linear";
  third_round_reversal: boolean;
  status: "not_started" | "in_progress" | "paused" | "completed";
  current_pick: number;
  current_round: number;
  current_roster_id: number | null;
  pick_time_seconds: number;
  pick_deadline: Date | null;
  rounds: number;
  started_at: Date | null;
  completed_at: Date | null;
  settings: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a new draft
 */
export async function createDraft(draftData: {
  league_id: number;
  draft_type: "snake" | "linear";
  third_round_reversal?: boolean;
  pick_time_seconds?: number;
  rounds?: number;
  settings?: any;
}): Promise<Draft> {
  try {
    const query = `
      INSERT INTO drafts (
        league_id, draft_type, third_round_reversal, pick_time_seconds,
        rounds, settings
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      draftData.league_id,
      draftData.draft_type,
      draftData.third_round_reversal || false,
      draftData.pick_time_seconds || 90,
      draftData.rounds || 15,
      JSON.stringify(draftData.settings || {}),
    ]);

    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating draft:", error);

    // Check for unique constraint violation
    if (error.code === "23505") {
      throw new Error("Draft already exists for this league");
    }

    throw new Error("Error creating draft");
  }
}

/**
 * Get draft by ID
 */
export async function getDraftById(draftId: number): Promise<Draft | null> {
  try {
    const query = `SELECT * FROM drafts WHERE id = $1`;
    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting draft:", error);
    throw new Error("Error getting draft");
  }
}

/**
 * Get draft by league ID
 */
export async function getDraftByLeagueId(
  leagueId: number
): Promise<Draft | null> {
  try {
    const query = `SELECT * FROM drafts WHERE league_id = $1`;
    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting draft by league:", error);
    throw new Error("Error getting draft by league");
  }
}

/**
 * Update draft
 */
export async function updateDraft(
  draftId: number,
  updates: Partial<Draft>
): Promise<Draft> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== "id" && key !== "created_at") {
        fields.push(`${key} = $${paramCount}`);
        values.push(
          key === "settings" && typeof value === "object"
            ? JSON.stringify(value)
            : value
        );
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(draftId);

    const query = `
      UPDATE drafts
      SET ${fields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating draft:", error);
    throw new Error("Error updating draft");
  }
}

/**
 * Start draft
 */
export async function startDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'in_progress',
          started_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error starting draft:", error);
    throw new Error("Error starting draft");
  }
}

/**
 * Pause draft
 */
export async function pauseDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'paused',
          pick_deadline = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error pausing draft:", error);
    throw new Error("Error pausing draft");
  }
}

/**
 * Resume draft
 */
export async function resumeDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'in_progress',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error resuming draft:", error);
    throw new Error("Error resuming draft");
  }
}

/**
 * Complete draft
 */
export async function completeDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          pick_deadline = NULL,
          current_roster_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error completing draft:", error);
    throw new Error("Error completing draft");
  }
}

/**
 * Assign drafted players to rosters
 * This populates each roster's bench with their drafted players
 */
export async function assignDraftedPlayersToRosters(draftId: number): Promise<void> {
  try {
    console.log(`[AssignPlayers] Starting roster assignment for draft ${draftId}`);

    // Get all draft picks with player IDs
    const picksQuery = `
      SELECT roster_id, player_id
      FROM draft_picks
      WHERE draft_id = $1 AND player_id IS NOT NULL
      ORDER BY roster_id, pick_number
    `;
    const picksResult = await pool.query(picksQuery, [draftId]);
    const picks = picksResult.rows;

    console.log(`[AssignPlayers] Found ${picks.length} picks to assign`);

    // Group picks by roster
    const picksByRoster = picks.reduce((acc: any, pick: any) => {
      if (!acc[pick.roster_id]) {
        acc[pick.roster_id] = [];
      }
      acc[pick.roster_id].push(pick.player_id);
      return acc;
    }, {});

    // Update each roster with their drafted players
    const { updateRoster } = await import("./Roster");

    for (const [rosterIdStr, playerIds] of Object.entries(picksByRoster)) {
      const rosterId = parseInt(rosterIdStr);
      console.log(`[AssignPlayers] Assigning ${(playerIds as any[]).length} players to roster ${rosterId}`);

      await updateRoster(rosterId, {
        bench: playerIds as any[], // All drafted players go to bench initially
        // Don't update starters - leave the slot structure intact
      });
    }

    console.log(`[AssignPlayers] Successfully assigned players to rosters`);
  } catch (error) {
    console.error("Error assigning drafted players to rosters:", error);
    throw new Error("Error assigning drafted players to rosters");
  }
}

/**
 * Reset draft - clears all picks and resets to not_started
 */
export async function resetDraft(draftId: number): Promise<Draft> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete all draft picks
    await client.query("DELETE FROM draft_picks WHERE draft_id = $1", [
      draftId,
    ]);

    // Delete all draft chat messages
    await client.query("DELETE FROM draft_chat_messages WHERE draft_id = $1", [
      draftId,
    ]);

    // Reset draft to not_started
    const query = `
      UPDATE drafts
      SET status = 'not_started',
          current_pick = 1,
          current_round = 1,
          current_roster_id = NULL,
          pick_deadline = NULL,
          started_at = NULL,
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await client.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error resetting draft:", error);
    throw new Error("Error resetting draft");
  } finally {
    client.release();
  }
}

/**
 * Delete draft
 */
export async function deleteDraft(draftId: number): Promise<void> {
  try {
    const query = `DELETE FROM drafts WHERE id = $1`;
    await pool.query(query, [draftId]);
  } catch (error) {
    console.error("Error deleting draft:", error);
    throw new Error("Error deleting draft");
  }
}
