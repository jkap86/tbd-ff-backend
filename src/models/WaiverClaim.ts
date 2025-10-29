import pool from "../config/database";

export interface WaiverClaim {
  id: number;
  league_id: number;
  roster_id: number;
  player_id: number;
  drop_player_id: number | null;
  bid_amount: number;
  status: "pending" | "processed" | "failed" | "cancelled";
  processed_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWaiverClaimInput {
  league_id: number;
  roster_id: number;
  player_id: number;
  drop_player_id?: number | null;
  bid_amount?: number;
}

/**
 * Create a new waiver claim
 */
export async function createWaiverClaim(
  data: CreateWaiverClaimInput
): Promise<WaiverClaim> {
  const { league_id, roster_id, player_id, drop_player_id, bid_amount = 0 } = data;

  try {
    const query = `
      INSERT INTO waiver_claims (
        league_id,
        roster_id,
        player_id,
        drop_player_id,
        bid_amount,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
    `;

    const values = [league_id, roster_id, player_id, drop_player_id || null, bid_amount];
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating waiver claim:", error);
    throw new Error("Error creating waiver claim");
  }
}

/**
 * Get all waiver claims for a league
 */
export async function getWaiverClaimsByLeague(
  leagueId: number,
  status?: string
): Promise<WaiverClaim[]> {
  try {
    let query = `
      SELECT wc.*, r.user_id, u.username
      FROM waiver_claims wc
      JOIN rosters r ON wc.roster_id = r.id
      JOIN users u ON r.user_id = u.id
      WHERE wc.league_id = $1
    `;

    const values: any[] = [leagueId];

    if (status) {
      query += ` AND wc.status = $2`;
      values.push(status);
    }

    query += ` ORDER BY wc.bid_amount DESC, wc.created_at ASC`;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting waiver claims by league:", error);
    throw new Error("Error getting waiver claims by league");
  }
}

/**
 * Get all waiver claims for a specific roster
 */
export async function getWaiverClaimsByRoster(
  rosterId: number,
  status?: string
): Promise<WaiverClaim[]> {
  try {
    let query = `
      SELECT * FROM waiver_claims
      WHERE roster_id = $1
    `;

    const values: any[] = [rosterId];

    if (status) {
      query += ` AND status = $2`;
      values.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting waiver claims by roster:", error);
    throw new Error("Error getting waiver claims by roster");
  }
}

/**
 * Get pending claims for a league (for processing)
 */
export async function getPendingClaims(leagueId: number): Promise<WaiverClaim[]> {
  try {
    const query = `
      SELECT * FROM waiver_claims
      WHERE league_id = $1 AND status = 'pending'
      ORDER BY bid_amount DESC, created_at ASC
    `;

    const result = await pool.query(query, [leagueId]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting pending claims:", error);
    throw new Error("Error getting pending claims");
  }
}

/**
 * Get a single waiver claim by ID
 */
export async function getWaiverClaimById(claimId: number): Promise<WaiverClaim | null> {
  try {
    const query = `SELECT * FROM waiver_claims WHERE id = $1`;
    const result = await pool.query(query, [claimId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error getting waiver claim by ID:", error);
    throw new Error("Error getting waiver claim by ID");
  }
}

/**
 * Update a waiver claim's status
 */
export async function updateClaimStatus(
  claimId: number,
  status: "processed" | "failed" | "cancelled",
  failureReason?: string
): Promise<WaiverClaim | null> {
  try {
    const query = `
      UPDATE waiver_claims
      SET status = $1,
          processed_at = $2,
          failure_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    const processedAt = status === "processed" || status === "failed" ? new Date() : null;
    const values = [status, processedAt, failureReason || null, claimId];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error updating claim status:", error);
    throw new Error("Error updating claim status");
  }
}

/**
 * Cancel a waiver claim
 */
export async function cancelWaiverClaim(claimId: number): Promise<WaiverClaim | null> {
  try {
    return await updateClaimStatus(claimId, "cancelled");
  } catch (error: any) {
    console.error("Error cancelling waiver claim:", error);
    throw new Error("Error cancelling waiver claim");
  }
}

/**
 * Delete a waiver claim (hard delete)
 */
export async function deleteWaiverClaim(claimId: number): Promise<boolean> {
  try {
    const query = `DELETE FROM waiver_claims WHERE id = $1 RETURNING id`;
    const result = await pool.query(query, [claimId]);
    return result.rows.length > 0;
  } catch (error: any) {
    console.error("Error deleting waiver claim:", error);
    throw new Error("Error deleting waiver claim");
  }
}

/**
 * Check if a roster has a pending claim for a specific player
 */
export async function hasPendingClaimForPlayer(
  rosterId: number,
  playerId: number
): Promise<boolean> {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM waiver_claims
      WHERE roster_id = $1 AND player_id = $2 AND status = 'pending'
    `;

    const result = await pool.query(query, [rosterId, playerId]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error: any) {
    console.error("Error checking pending claim:", error);
    throw new Error("Error checking pending claim");
  }
}
