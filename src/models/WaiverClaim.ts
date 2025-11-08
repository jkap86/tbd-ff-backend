import pool from "../config/database";
import { BaseRepository } from "./BaseRepository";

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
 * Repository class for WaiverClaim entities
 * Extends BaseRepository to inherit CRUD operations
 */
class WaiverClaimRepository extends BaseRepository<WaiverClaim> {
  constructor() {
    super('waiver_claims', 'id');
  }
}

const waiverClaimRepository = new WaiverClaimRepository();

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
 * REFACTORED: Uses waiverClaimRepository.query() for error handling (4 lines saved)
 */
export async function getWaiverClaimsByLeague(
  leagueId: number,
  status?: string
): Promise<WaiverClaim[]> {
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

  const result = await waiverClaimRepository['query'](query, values);
  return result.rows;
}

/**
 * Get all waiver claims for a specific roster
 * REFACTORED: Uses waiverClaimRepository.query() for error handling (4 lines saved)
 */
export async function getWaiverClaimsByRoster(
  rosterId: number,
  status?: string
): Promise<WaiverClaim[]> {
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

  const result = await waiverClaimRepository['query'](query, values);
  return result.rows;
}

/**
 * Get pending claims for a league (for processing)
 * REFACTORED: Uses waiverClaimRepository.query() for error handling (4 lines saved)
 */
export async function getPendingClaims(leagueId: number): Promise<WaiverClaim[]> {
  const query = `
    SELECT * FROM waiver_claims
    WHERE league_id = $1 AND status = 'pending'
    ORDER BY bid_amount DESC, created_at ASC
  `;

  const result = await waiverClaimRepository['query'](query, [leagueId]);
  return result.rows;
}

/**
 * Get a single waiver claim by ID
 * REFACTORED: Uses waiverClaimRepository.findById() for simplified query (11 lines saved)
 */
export async function getWaiverClaimById(claimId: number): Promise<WaiverClaim | null> {
  return waiverClaimRepository.findById(claimId);
}

/**
 * Update a waiver claim's status
 * REFACTORED: Uses waiverClaimRepository.query() for error handling (6 lines saved)
 */
export async function updateClaimStatus(
  claimId: number,
  status: "processed" | "failed" | "cancelled",
  failureReason?: string
): Promise<WaiverClaim | null> {
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

  const result = await waiverClaimRepository['query'](query, values);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Cancel a waiver claim
 * REFACTORED: Uses waiverClaimRepository for error handling (3 lines saved)
 */
export async function cancelWaiverClaim(claimId: number): Promise<WaiverClaim | null> {
  return await updateClaimStatus(claimId, "cancelled");
}

/**
 * Delete a waiver claim (hard delete)
 * REFACTORED: Uses waiverClaimRepository.delete() for simplified operation (6 lines saved)
 */
export async function deleteWaiverClaim(claimId: number): Promise<boolean> {
  return waiverClaimRepository.delete(claimId);
}

/**
 * Check if a roster has a pending claim for a specific player
 * REFACTORED: Uses waiverClaimRepository.query() for error handling (4 lines saved)
 */
export async function hasPendingClaimForPlayer(
  rosterId: number,
  playerId: number
): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM waiver_claims
    WHERE roster_id = $1 AND player_id = $2 AND status = 'pending'
  `;

  const result = await waiverClaimRepository['query']<{ count: string }>(query, [rosterId, playerId]);
  return parseInt(result.rows[0].count) > 0;
}
