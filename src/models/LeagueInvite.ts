import pool from "../config/database";

export interface LeagueInvite {
  id: number;
  league_id: number;
  inviter_user_id: number;
  invited_user_id: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateInviteInput {
  league_id: number;
  inviter_user_id: number;
  invited_user_id: number;
}

/**
 * Create a league invite
 */
export async function createInvite(
  inviteData: CreateInviteInput
): Promise<LeagueInvite> {
  const { league_id, inviter_user_id, invited_user_id } = inviteData;

  try {
    const query = `
      INSERT INTO league_invites (league_id, inviter_user_id, invited_user_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await pool.query(query, [
      league_id,
      inviter_user_id,
      invited_user_id,
    ]);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating invite:", error);

    // Check if it's a duplicate invite
    if (error.code === "23505") {
      throw new Error("User already invited to this league");
    }

    throw new Error("Error creating invite");
  }
}

/**
 * Get invites for a user
 */
export async function getInvitesForUser(userId: number): Promise<any[]> {
  try {
    const query = `
      SELECT 
        li.*,
        l.name as league_name,
        l.season,
        l.total_rosters,
        u.username as inviter_username
      FROM league_invites li
      INNER JOIN leagues l ON li.league_id = l.id
      INNER JOIN users u ON li.inviter_user_id = u.id
      WHERE li.invited_user_id = $1
      ORDER BY li.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting user invites:", error);
    throw new Error("Error getting user invites");
  }
}

/**
 * Get invite by ID
 */
export async function getInviteById(
  inviteId: number
): Promise<LeagueInvite | null> {
  try {
    const query = "SELECT * FROM league_invites WHERE id = $1";
    const result = await pool.query(query, [inviteId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting invite:", error);
    throw new Error("Error getting invite");
  }
}

/**
 * Update invite status
 */
export async function updateInviteStatus(
  inviteId: number,
  status: string
): Promise<LeagueInvite | null> {
  try {
    const query = `
      UPDATE league_invites
      SET status = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, inviteId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating invite status:", error);
    throw new Error("Error updating invite status");
  }
}

/**
 * Delete invite
 */
export async function deleteInvite(inviteId: number): Promise<boolean> {
  try {
    const query = "DELETE FROM league_invites WHERE id = $1";
    const result = await pool.query(query, [inviteId]);
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error("Error deleting invite:", error);
    throw new Error("Error deleting invite");
  }
}

/**
 * Check if user is already invited to league
 */
export async function isUserInvited(
  leagueId: number,
  userId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT id FROM league_invites 
      WHERE league_id = $1 AND invited_user_id = $2 AND status = 'pending'
    `;
    const result = await pool.query(query, [leagueId, userId]);
    return result.rows.length > 0;
  } catch (error) {
    throw new Error("Error checking invite status");
  }
}
