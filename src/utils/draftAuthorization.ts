import pool from "../config/database";

/**
 * Check if a user is a participant in a draft
 * @param userId - The user's ID
 * @param draftId - The draft ID
 * @returns true if user is a participant, false otherwise
 */
export async function isUserDraftParticipant(
  userId: number,
  draftId: number
): Promise<boolean> {
  try {
    // Check if user has a roster in the league that owns this draft
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        INNER JOIN drafts d ON d.league_id = r.league_id
        WHERE d.id = $1 AND r.user_id = $2
      ) as is_participant
    `;

    const result = await pool.query(query, [draftId, userId]);
    return result.rows[0]?.is_participant || false;
  } catch (error) {
    console.error("[DraftAuth] Error checking draft participation:", error);
    return false;
  }
}

/**
 * Check if a user is the commissioner of the league that owns a draft
 * @param userId - The user's ID
 * @param draftId - The draft ID
 * @returns true if user is the commissioner, false otherwise
 */
export async function isUserDraftCommissioner(
  userId: number,
  draftId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM leagues l
        INNER JOIN drafts d ON d.league_id = l.id
        WHERE d.id = $1 AND l.commissioner_id = $2
      ) as is_commissioner
    `;

    const result = await pool.query(query, [draftId, userId]);
    return result.rows[0]?.is_commissioner || false;
  } catch (error) {
    console.error("[DraftAuth] Error checking draft commissioner:", error);
    return false;
  }
}

/**
 * Check if a user owns a specific roster in a draft
 * @param userId - The user's ID
 * @param rosterId - The roster ID
 * @param draftId - The draft ID
 * @returns true if user owns the roster, false otherwise
 */
export async function doesUserOwnRoster(
  userId: number,
  rosterId: number,
  draftId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        INNER JOIN drafts d ON d.league_id = r.league_id
        WHERE d.id = $1 AND r.id = $2 AND r.user_id = $3
      ) as owns_roster
    `;

    const result = await pool.query(query, [draftId, rosterId, userId]);
    return result.rows[0]?.owns_roster || false;
  } catch (error) {
    console.error("[DraftAuth] Error checking roster ownership:", error);
    return false;
  }
}

/**
 * Get the username for a user ID
 * @param userId - The user's ID
 * @returns username or null
 */
export async function getUsernameById(userId: number): Promise<string | null> {
  try {
    const query = `SELECT username FROM users WHERE id = $1`;
    const result = await pool.query(query, [userId]);
    return result.rows[0]?.username || null;
  } catch (error) {
    console.error("[DraftAuth] Error getting username:", error);
    return null;
  }
}
