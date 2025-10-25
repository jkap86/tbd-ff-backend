import pool from "../config/database";

export interface DraftPick {
  id: number;
  draft_id: number;
  pick_number: number;
  round: number;
  pick_in_round: number;
  roster_id: number;
  player_id: number | null;
  is_auto_pick: boolean;
  picked_at: Date;
  pick_time_seconds: number | null;
  created_at: Date;
}

/**
 * Create a draft pick
 */
export async function createDraftPick(pickData: {
  draft_id: number;
  pick_number: number;
  round: number;
  pick_in_round: number;
  roster_id: number;
  player_id: number;
  is_auto_pick?: boolean;
  pick_time_seconds?: number;
}): Promise<DraftPick> {
  try {
    const query = `
      INSERT INTO draft_picks (
        draft_id, pick_number, round, pick_in_round,
        roster_id, player_id, is_auto_pick, pick_time_seconds
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      pickData.draft_id,
      pickData.pick_number,
      pickData.round,
      pickData.pick_in_round,
      pickData.roster_id,
      pickData.player_id,
      pickData.is_auto_pick || false,
      pickData.pick_time_seconds || null,
    ]);

    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating draft pick:", error);

    // Check for unique constraint violations
    if (error.code === "23505") {
      if (error.constraint === "draft_picks_draft_id_pick_number_key") {
        throw new Error("Pick number already exists for this draft");
      }
      if (error.constraint === "draft_picks_draft_id_player_id_key") {
        throw new Error("Player already drafted in this draft");
      }
    }

    throw new Error("Error creating draft pick");
  }
}

/**
 * Get all picks for a draft
 */
export async function getDraftPicks(draftId: number): Promise<DraftPick[]> {
  try {
    const query = `
      SELECT * FROM draft_picks
      WHERE draft_id = $1
      ORDER BY pick_number ASC
    `;

    const result = await pool.query(query, [draftId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting draft picks:", error);
    throw new Error("Error getting draft picks");
  }
}

/**
 * Get picks for a specific roster in a draft
 */
export async function getRosterDraftPicks(
  draftId: number,
  rosterId: number
): Promise<DraftPick[]> {
  try {
    const query = `
      SELECT * FROM draft_picks
      WHERE draft_id = $1 AND roster_id = $2
      ORDER BY pick_number ASC
    `;

    const result = await pool.query(query, [draftId, rosterId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting roster draft picks:", error);
    throw new Error("Error getting roster draft picks");
  }
}

/**
 * Get pick by pick number
 */
export async function getDraftPickByNumber(
  draftId: number,
  pickNumber: number
): Promise<DraftPick | null> {
  try {
    const query = `
      SELECT * FROM draft_picks
      WHERE draft_id = $1 AND pick_number = $2
    `;

    const result = await pool.query(query, [draftId, pickNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting draft pick:", error);
    throw new Error("Error getting draft pick");
  }
}

/**
 * Get picks with player and roster details (for draft board display)
 */
export async function getDraftPicksWithDetails(draftId: number): Promise<any[]> {
  try {
    const query = `
      SELECT
        dp.*,
        p.full_name as player_name,
        p.position as player_position,
        p.team as player_team,
        r.roster_id as roster_number,
        u.username as picked_by_username
      FROM draft_picks dp
      LEFT JOIN players p ON dp.player_id = p.id
      LEFT JOIN rosters r ON dp.roster_id = r.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE dp.draft_id = $1
      ORDER BY dp.pick_number ASC
    `;

    const result = await pool.query(query, [draftId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting draft picks with details:", error);
    throw new Error("Error getting draft picks with details");
  }
}

/**
 * Get the latest pick for a draft
 */
export async function getLatestDraftPick(
  draftId: number
): Promise<DraftPick | null> {
  try {
    const query = `
      SELECT * FROM draft_picks
      WHERE draft_id = $1
      ORDER BY pick_number DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting latest draft pick:", error);
    throw new Error("Error getting latest draft pick");
  }
}

/**
 * Check if a player has been drafted
 */
export async function isPlayerDrafted(
  draftId: number,
  playerId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM draft_picks
      WHERE draft_id = $1 AND player_id = $2
    `;

    const result = await pool.query(query, [draftId, playerId]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error("Error checking if player is drafted:", error);
    throw new Error("Error checking if player is drafted");
  }
}
