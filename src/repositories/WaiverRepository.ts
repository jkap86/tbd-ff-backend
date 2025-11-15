import { BaseRepository } from "../models/BaseRepository";
import { WaiverClaim } from "../models/WaiverClaim";
import { logger } from "../config/logger";

/**
 * Extended WaiverClaim type with roster and user details
 */
export interface WaiverClaimWithDetails extends WaiverClaim {
  user_id?: number;
  username?: string;
  team_name?: string;
  player_name?: string;
  drop_player_name?: string;
}

/**
 * WaiverRepository - Centralized repository for all waiver claim queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - Waiver claim lifecycle management (create, process, fail, cancel)
 * - League and roster-specific waiver queries
 * - Waiver processing priority ordering (by bid amount, then timestamp)
 *
 * Benefits:
 * - Centralizes all waiver claim data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 */
export class WaiverRepository extends BaseRepository<WaiverClaim> {
  constructor() {
    super('waiver_claims', 'id');
  }

  /**
   * Create a new waiver claim
   *
   * @param params - Waiver claim creation parameters
   * @returns The created waiver claim
   */
  async createClaim(params: {
    league_id: number;
    roster_id: number;
    player_id: number;
    drop_player_id?: number | null;
    bid_amount?: number;
  }): Promise<WaiverClaim> {
    try {
      const { league_id, roster_id, player_id, drop_player_id, bid_amount = 0 } = params;

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
      const result = await this.query(query, values);

      logger.debug('Created waiver claim', {
        claimId: result.rows[0].id,
        leagueId: league_id,
        rosterId: roster_id,
        playerId: player_id,
        bidAmount: bid_amount,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating waiver claim:', { params, error });
      throw new Error('Failed to create waiver claim');
    }
  }

  /**
   * Get all waiver claims for a league
   * Optionally filter by status
   * Includes roster and user information
   *
   * @param leagueId - The league ID
   * @param status - Optional status filter
   * @returns Array of waiver claims with details
   */
  async getByLeague(
    leagueId: number,
    status?: "pending" | "processed" | "failed" | "cancelled"
  ): Promise<WaiverClaimWithDetails[]> {
    try {
      let query = `
        SELECT wc.*,
               r.user_id,
               u.username,
               COALESCE(r.settings->>'team_name', u.username, 'Team ' || r.roster_id) as team_name,
               p1.full_name as player_name,
               p2.full_name as drop_player_name
        FROM waiver_claims wc
        JOIN rosters r ON wc.roster_id = r.id
        JOIN users u ON r.user_id = u.id
        LEFT JOIN players p1 ON wc.player_id = p1.player_id
        LEFT JOIN players p2 ON wc.drop_player_id = p2.player_id
        WHERE wc.league_id = $1
      `;

      const values: any[] = [leagueId];

      if (status) {
        query += ` AND wc.status = $2`;
        values.push(status);
      }

      query += ` ORDER BY wc.bid_amount DESC, wc.created_at ASC`;

      const result = await this.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting waiver claims for league:', { leagueId, status, error });
      throw new Error('Failed to get waiver claims for league');
    }
  }

  /**
   * Get all waiver claims for a specific roster
   * Optionally filter by status
   *
   * @param rosterId - The roster ID
   * @param status - Optional status filter
   * @returns Array of waiver claims
   */
  async getByRoster(
    rosterId: number,
    status?: "pending" | "processed" | "failed" | "cancelled"
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

      const result = await this.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting waiver claims for roster:', { rosterId, status, error });
      throw new Error('Failed to get waiver claims for roster');
    }
  }

  /**
   * Get pending claims for a league (for processing)
   * Ordered by priority: bid amount DESC, created_at ASC
   *
   * @param leagueId - The league ID
   * @returns Array of pending waiver claims
   */
  async getPending(leagueId: number): Promise<WaiverClaim[]> {
    try {
      const query = `
        SELECT * FROM waiver_claims
        WHERE league_id = $1 AND status = 'pending'
        ORDER BY bid_amount DESC, created_at ASC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending waiver claims:', { leagueId, error });
      throw new Error('Failed to get pending waiver claims');
    }
  }

  /**
   * Get pending claims for a specific player
   * Useful for checking conflicts before processing
   *
   * @param leagueId - The league ID
   * @param playerId - The player ID
   * @returns Array of pending claims for the player
   */
  async getPendingForPlayer(leagueId: number, playerId: number): Promise<WaiverClaim[]> {
    try {
      const query = `
        SELECT * FROM waiver_claims
        WHERE league_id = $1
          AND player_id = $2
          AND status = 'pending'
        ORDER BY bid_amount DESC, created_at ASC
      `;

      const result = await this.query(query, [leagueId, playerId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending claims for player:', { leagueId, playerId, error });
      throw new Error('Failed to get pending claims for player');
    }
  }

  /**
   * Update a waiver claim's status
   *
   * @param claimId - The claim ID
   * @param status - New status
   * @param failureReason - Optional failure reason (for failed status)
   * @returns Updated waiver claim or null if not found
   */
  async updateStatus(
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

      const result = await this.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      logger.debug('Updated waiver claim status', { claimId, status, failureReason });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating waiver claim status:', { claimId, status, failureReason, error });
      throw new Error('Failed to update waiver claim status');
    }
  }

  /**
   * Mark a waiver claim as processed
   *
   * @param claimId - The claim ID
   * @returns Updated waiver claim or null if not found
   */
  async processClaim(claimId: number): Promise<WaiverClaim | null> {
    try {
      return await this.updateStatus(claimId, 'processed');
    } catch (error) {
      logger.error('Error processing waiver claim:', { claimId, error });
      throw new Error('Failed to process waiver claim');
    }
  }

  /**
   * Mark a waiver claim as failed with reason
   *
   * @param claimId - The claim ID
   * @param failureReason - Reason for failure
   * @returns Updated waiver claim or null if not found
   */
  async failClaim(claimId: number, failureReason: string): Promise<WaiverClaim | null> {
    try {
      return await this.updateStatus(claimId, 'failed', failureReason);
    } catch (error) {
      logger.error('Error failing waiver claim:', { claimId, failureReason, error });
      throw new Error('Failed to fail waiver claim');
    }
  }

  /**
   * Cancel a waiver claim
   *
   * @param claimId - The claim ID
   * @returns Updated waiver claim or null if not found
   */
  async cancel(claimId: number): Promise<WaiverClaim | null> {
    try {
      return await this.updateStatus(claimId, 'cancelled');
    } catch (error) {
      logger.error('Error cancelling waiver claim:', { claimId, error });
      throw new Error('Failed to cancel waiver claim');
    }
  }

  /**
   * Check if a roster has a pending claim for a specific player
   *
   * @param rosterId - The roster ID
   * @param playerId - The player ID
   * @returns True if roster has pending claim for player
   */
  async hasPendingClaimForPlayer(rosterId: number, playerId: number): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM waiver_claims
          WHERE roster_id = $1
            AND player_id = $2
            AND status = 'pending'
        ) as has_claim
      `;

      const result = await this.query(query, [rosterId, playerId]);
      return result.rows[0].has_claim;
    } catch (error) {
      logger.error('Error checking pending claim for player:', { rosterId, playerId, error });
      throw new Error('Failed to check pending claim for player');
    }
  }

  /**
   * Get count of waiver claims for a league
   * Optionally filter by status
   *
   * @param leagueId - The league ID
   * @param status - Optional status filter
   * @returns Count of waiver claims
   */
  async countByLeague(
    leagueId: number,
    status?: "pending" | "processed" | "failed" | "cancelled"
  ): Promise<number> {
    try {
      let whereClause = 'league_id = $1';
      const params: any[] = [leagueId];

      if (status) {
        whereClause += ' AND status = $2';
        params.push(status);
      }

      return await this.count(whereClause, params);
    } catch (error) {
      logger.error('Error counting waiver claims for league:', { leagueId, status, error });
      throw new Error('Failed to count waiver claims for league');
    }
  }

  /**
   * Get count of pending waiver claims for a roster
   *
   * @param rosterId - The roster ID
   * @returns Count of pending claims
   */
  async countPendingByRoster(rosterId: number): Promise<number> {
    try {
      return await this.count('roster_id = $1 AND status = $2', [rosterId, 'pending']);
    } catch (error) {
      logger.error('Error counting pending claims for roster:', { rosterId, error });
      throw new Error('Failed to count pending claims for roster');
    }
  }

  /**
   * Delete all pending claims for a specific player in a league
   * Used when a player is added to a roster or becomes ineligible
   *
   * @param leagueId - The league ID
   * @param playerId - The player ID
   * @returns Number of claims deleted
   */
  async deletePendingForPlayer(leagueId: number, playerId: number): Promise<number> {
    try {
      const query = `
        DELETE FROM waiver_claims
        WHERE league_id = $1
          AND player_id = $2
          AND status = 'pending'
      `;

      const result = await this.query(query, [leagueId, playerId]);

      logger.debug('Deleted pending claims for player', {
        leagueId,
        playerId,
        deletedCount: result.rowCount
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting pending claims for player:', { leagueId, playerId, error });
      throw new Error('Failed to delete pending claims for player');
    }
  }

  /**
   * Cancel all pending claims for a roster
   * Used when a roster is removed from a league
   *
   * @param rosterId - The roster ID
   * @returns Number of claims cancelled
   */
  async cancelAllPendingForRoster(rosterId: number): Promise<number> {
    try {
      const query = `
        UPDATE waiver_claims
        SET status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
        WHERE roster_id = $1
          AND status = 'pending'
      `;

      const result = await this.query(query, [rosterId]);

      logger.debug('Cancelled all pending claims for roster', {
        rosterId,
        cancelledCount: result.rowCount
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error cancelling pending claims for roster:', { rosterId, error });
      throw new Error('Failed to cancel pending claims for roster');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const waiverRepository = new WaiverRepository();
