import { BaseRepository } from "../models/BaseRepository";
import { logger } from "../config/logger";

export interface Transaction {
  id: number;
  league_id: number;
  roster_id: number;
  transaction_type: "waiver" | "free_agent" | "trade" | "add" | "drop";
  status: "processed" | "pending" | "failed";
  adds: number[]; // Array of player IDs added
  drops: number[]; // Array of player IDs dropped
  waiver_bid: number | null;
  processed_at: Date;
  created_at: Date;
}

export interface TransactionWithDetails extends Transaction {
  user_id?: number;
  username?: string;
  adds_details?: any[];
  drops_details?: any[];
}

export interface CreateTransactionInput {
  league_id: number;
  roster_id: number;
  transaction_type: "waiver" | "free_agent" | "trade" | "add" | "drop";
  status?: "processed" | "pending" | "failed";
  adds?: number[];
  drops?: number[];
  waiver_bid?: number | null;
}

/**
 * TransactionRepository - Centralized repository for all transaction queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - Transaction creation and tracking
 * - League and roster-specific transaction queries
 * - Transaction history with player details
 * - Pagination support for large datasets
 *
 * Benefits:
 * - Centralizes all transaction data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 * - Prevents N+1 query problems with JOINs
 */
export class TransactionRepository extends BaseRepository<Transaction> {
  constructor() {
    super('transactions', 'id');
  }

  /**
   * Create a new transaction
   *
   * @param data - Transaction creation parameters
   * @returns The created transaction
   */
  async createTransaction(data: CreateTransactionInput): Promise<Transaction> {
    const {
      league_id,
      roster_id,
      transaction_type,
      status = "processed",
      adds = [],
      drops = [],
      waiver_bid = null,
    } = data;

    try {
      const query = `
        INSERT INTO transactions (
          league_id,
          roster_id,
          transaction_type,
          status,
          adds,
          drops,
          waiver_bid,
          processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const values = [
        league_id,
        roster_id,
        transaction_type,
        status,
        JSON.stringify(adds),
        JSON.stringify(drops),
        waiver_bid,
      ];

      const result = await this.query(query, values);

      logger.debug('Created transaction', {
        transactionId: result.rows[0].id,
        leagueId: league_id,
        rosterId: roster_id,
        type: transaction_type,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating transaction:', { data, error });
      throw new Error('Failed to create transaction');
    }
  }

  /**
   * Get all transactions for a league with pagination support
   * Includes roster and user information
   *
   * @param leagueId - The league ID
   * @param limit - Maximum number of transactions to return
   * @param offset - Number of transactions to skip
   * @returns Array of transactions with details
   */
  async getByLeague(
    leagueId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<TransactionWithDetails[]> {
    try {
      const query = `
        SELECT t.*, r.user_id, u.username, r.roster_id
        FROM transactions t
        JOIN rosters r ON t.roster_id = r.id
        JOIN users u ON r.user_id = u.id
        WHERE t.league_id = $1
        ORDER BY t.processed_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.query(query, [leagueId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting transactions by league:', { leagueId, limit, offset, error });
      throw new Error('Failed to get transactions by league');
    }
  }

  /**
   * Get all transactions for a specific roster with pagination support
   *
   * @param rosterId - The roster ID
   * @param limit - Maximum number of transactions to return
   * @param offset - Number of transactions to skip
   * @returns Array of transactions
   */
  async getByRoster(
    rosterId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    try {
      const query = `
        SELECT * FROM transactions
        WHERE roster_id = $1
        ORDER BY processed_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.query(query, [rosterId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting transactions by roster:', { rosterId, limit, offset, error });
      throw new Error('Failed to get transactions by roster');
    }
  }

  /**
   * Get transactions filtered by type for a league
   *
   * @param leagueId - The league ID
   * @param transactionType - Type of transaction to filter by
   * @param limit - Maximum number of transactions to return
   * @param offset - Number of transactions to skip
   * @returns Array of transactions
   */
  async getByLeagueAndType(
    leagueId: number,
    transactionType: "waiver" | "free_agent" | "trade" | "add" | "drop",
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    try {
      const query = `
        SELECT * FROM transactions
        WHERE league_id = $1 AND transaction_type = $2
        ORDER BY processed_at DESC
        LIMIT $3 OFFSET $4
      `;

      const result = await this.query(query, [leagueId, transactionType, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting transactions by league and type:', {
        leagueId,
        transactionType,
        error
      });
      throw new Error('Failed to get transactions by league and type');
    }
  }

  /**
   * Get transactions filtered by status for a league
   *
   * @param leagueId - The league ID
   * @param status - Status to filter by
   * @param limit - Maximum number of transactions to return
   * @param offset - Number of transactions to skip
   * @returns Array of transactions
   */
  async getByLeagueAndStatus(
    leagueId: number,
    status: "processed" | "pending" | "failed",
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    try {
      const query = `
        SELECT * FROM transactions
        WHERE league_id = $1 AND status = $2
        ORDER BY processed_at DESC
        LIMIT $3 OFFSET $4
      `;

      const result = await this.query(query, [leagueId, status, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting transactions by league and status:', {
        leagueId,
        status,
        error
      });
      throw new Error('Failed to get transactions by league and status');
    }
  }

  /**
   * Get total count of transactions for a league
   * Optionally filter by type or status
   *
   * @param leagueId - The league ID
   * @param filters - Optional filters
   * @returns Count of transactions
   */
  async countByLeague(
    leagueId: number,
    filters?: {
      transaction_type?: "waiver" | "free_agent" | "trade" | "add" | "drop";
      status?: "processed" | "pending" | "failed";
    }
  ): Promise<number> {
    try {
      let whereClause = 'league_id = $1';
      const params: any[] = [leagueId];

      if (filters?.transaction_type) {
        whereClause += ' AND transaction_type = $2';
        params.push(filters.transaction_type);
      }

      if (filters?.status) {
        whereClause += ` AND status = $${params.length + 1}`;
        params.push(filters.status);
      }

      return await this.count(whereClause, params);
    } catch (error) {
      logger.error('Error counting transactions for league:', { leagueId, filters, error });
      throw new Error('Failed to count transactions for league');
    }
  }

  /**
   * Get total count of transactions for a roster
   *
   * @param rosterId - The roster ID
   * @returns Count of transactions
   */
  async countByRoster(rosterId: number): Promise<number> {
    try {
      return await this.count('roster_id = $1', [rosterId]);
    } catch (error) {
      logger.error('Error counting transactions for roster:', { rosterId, error });
      throw new Error('Failed to count transactions for roster');
    }
  }

  /**
   * Get recent transactions for a league with player details and pagination support
   * Prevents N+1 query problem by fetching all player details in a single query
   *
   * @param leagueId - The league ID
   * @param limit - Maximum number of transactions to return
   * @param offset - Number of transactions to skip
   * @returns Array of transactions with player details attached
   */
  async getWithPlayerDetails(
    leagueId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<TransactionWithDetails[]> {
    try {
      const query = `
        SELECT t.*, r.user_id, u.username, r.roster_id
        FROM transactions t
        JOIN rosters r ON t.roster_id = r.id
        JOIN users u ON r.user_id = u.id
        WHERE t.league_id = $1
        ORDER BY t.processed_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.query(query, [leagueId, limit, offset]);
      const transactions = result.rows;

      // Get all unique player IDs from transactions
      const playerIds = new Set<number>();
      transactions.forEach((txn) => {
        if (txn.adds && Array.isArray(txn.adds)) {
          txn.adds.forEach((id: number) => playerIds.add(id));
        }
        if (txn.drops && Array.isArray(txn.drops)) {
          txn.drops.forEach((id: number) => playerIds.add(id));
        }
      });

      // Fetch player details if there are any player IDs
      let playerMap: { [key: number]: any } = {};
      if (playerIds.size > 0) {
        const playerQuery = `
          SELECT id, player_id, full_name, position, team
          FROM players
          WHERE id = ANY($1)
        `;
        const playerResult = await this.query(playerQuery, [Array.from(playerIds)]);
        playerMap = playerResult.rows.reduce((acc: any, player: any) => {
          acc[player.id] = player;
          return acc;
        }, {});
      }

      // Attach player details to transactions
      return transactions.map((txn) => ({
        ...txn,
        adds_details: (txn.adds || []).map((id: number) => playerMap[id] || null),
        drops_details: (txn.drops || []).map((id: number) => playerMap[id] || null),
      }));
    } catch (error) {
      logger.error('Error getting transactions with player details:', {
        leagueId,
        limit,
        offset,
        error
      });
      throw new Error('Failed to get transactions with player details');
    }
  }

  /**
   * Get pending transactions for a league
   * Useful for processing queued transactions
   *
   * @param leagueId - The league ID
   * @returns Array of pending transactions
   */
  async getPending(leagueId: number): Promise<Transaction[]> {
    try {
      const query = `
        SELECT * FROM transactions
        WHERE league_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending transactions:', { leagueId, error });
      throw new Error('Failed to get pending transactions');
    }
  }

  /**
   * Update transaction status
   *
   * @param transactionId - The transaction ID
   * @param status - New status
   * @returns Updated transaction or null if not found
   */
  async updateStatus(
    transactionId: number,
    status: "processed" | "pending" | "failed"
  ): Promise<Transaction | null> {
    try {
      const query = `
        UPDATE transactions
        SET status = $1,
            processed_at = CASE WHEN $1 = 'processed' THEN CURRENT_TIMESTAMP ELSE processed_at END
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [status, transactionId]);

      if (result.rows.length === 0) {
        return null;
      }

      logger.debug('Updated transaction status', { transactionId, status });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating transaction status:', { transactionId, status, error });
      throw new Error('Failed to update transaction status');
    }
  }

  /**
   * Get recent transactions for a player across all leagues
   * Useful for player transaction history
   *
   * @param playerId - The player ID
   * @param limit - Maximum number of transactions to return
   * @returns Array of transactions involving the player
   */
  async getByPlayer(playerId: number, limit: number = 20): Promise<TransactionWithDetails[]> {
    try {
      const query = `
        SELECT t.*, r.user_id, u.username, r.roster_id, l.name as league_name
        FROM transactions t
        JOIN rosters r ON t.roster_id = r.id
        JOIN users u ON r.user_id = u.id
        JOIN leagues l ON t.league_id = l.id
        WHERE $1 = ANY(t.adds) OR $1 = ANY(t.drops)
        ORDER BY t.processed_at DESC
        LIMIT $2
      `;

      const result = await this.query(query, [playerId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting transactions by player:', { playerId, limit, error });
      throw new Error('Failed to get transactions by player');
    }
  }

  /**
   * Delete old processed transactions (for cleanup/archival)
   * Only deletes transactions older than the specified date
   *
   * @param beforeDate - Delete transactions processed before this date
   * @returns Number of transactions deleted
   */
  async deleteOldTransactions(beforeDate: Date): Promise<number> {
    try {
      const query = `
        DELETE FROM transactions
        WHERE processed_at < $1 AND status = 'processed'
      `;

      const result = await this.query(query, [beforeDate]);

      logger.info('Deleted old transactions', {
        count: result.rowCount,
        beforeDate: beforeDate.toISOString()
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting old transactions:', { beforeDate, error });
      throw new Error('Failed to delete old transactions');
    }
  }

  /**
   * Get transaction statistics for a league
   * Returns counts by transaction type
   *
   * @param leagueId - The league ID
   * @returns Object with counts by transaction type
   */
  async getStatsByLeague(leagueId: number): Promise<{
    waiver: number;
    free_agent: number;
    trade: number;
    add: number;
    drop: number;
    total: number;
  }> {
    try {
      const query = `
        SELECT
          transaction_type,
          COUNT(*) as count
        FROM transactions
        WHERE league_id = $1
        GROUP BY transaction_type
      `;

      const result = await this.query(query, [leagueId]);

      const stats = {
        waiver: 0,
        free_agent: 0,
        trade: 0,
        add: 0,
        drop: 0,
        total: 0,
      };

      result.rows.forEach((row) => {
        stats[row.transaction_type as keyof typeof stats] = parseInt(row.count, 10);
        stats.total += parseInt(row.count, 10);
      });

      return stats;
    } catch (error) {
      logger.error('Error getting transaction stats for league:', { leagueId, error });
      throw new Error('Failed to get transaction stats for league');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const transactionRepository = new TransactionRepository();
