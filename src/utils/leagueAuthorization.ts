import pool from "../config/database";

/**
 * Check if a user is a member of a league
 * @param userId - The user's ID
 * @param leagueId - The league ID
 * @returns true if user is a league member, false otherwise
 */
export async function isUserLeagueMember(
  userId: number,
  leagueId: number
): Promise<boolean> {
  try {
    // Check if user has a roster in this league
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r
        WHERE r.league_id = $1 AND r.user_id = $2
      ) as is_member
    `;

    const result = await pool.query(query, [leagueId, userId]);
    return result.rows[0]?.is_member || false;
  } catch (error) {
    console.error("[LeagueAuth] Error checking league membership:", error);
    return false;
  }
}

/**
 * Check if a user is the commissioner of a league
 * @param userId - The user's ID
 * @param leagueId - The league ID
 * @returns true if user is the commissioner, false otherwise
 */
export async function isUserLeagueCommissioner(
  userId: number,
  leagueId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM leagues l
        WHERE l.id = $1 AND l.commissioner_id = $2
      ) as is_commissioner
    `;

    const result = await pool.query(query, [leagueId, userId]);
    return result.rows[0]?.is_commissioner || false;
  } catch (error) {
    console.error("[LeagueAuth] Error checking league commissioner:", error);
    return false;
  }
}
