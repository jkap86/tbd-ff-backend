import { BaseRepository } from "../models/BaseRepository";
import { Trade, TradeWithDetails, TradeItem } from "../models/Trade";
import { logger } from "../config/logger";

/**
 * TradeRepository - Centralized repository for all trade-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - Trade lifecycle management (propose, accept, reject, cancel)
 * - Trade queries with details (roster names, player names)
 * - Trade item management
 *
 * Benefits:
 * - Centralizes all trade data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 */
export class TradeRepository extends BaseRepository<Trade> {
  constructor() {
    super('trades', 'id');
  }

  /**
   * Get trade with all details (items, roster names, user names)
   * Includes JOINs to prevent N+1 query problems
   *
   * @param tradeId - The trade ID
   * @returns Trade with details or null if not found
   */
  async getWithDetails(tradeId: number): Promise<TradeWithDetails | null> {
    try {
      const query = `
        SELECT
          t.*,
          COALESCE(pr.settings->>'team_name', pu.username, 'Team ' || pr.roster_id) as proposer_team_name,
          COALESCE(rr.settings->>'team_name', ru.username, 'Team ' || rr.roster_id) as receiver_team_name,
          pu.username as proposer_name,
          ru.username as receiver_name
        FROM trades t
        LEFT JOIN rosters pr ON t.proposer_roster_id = pr.id
        LEFT JOIN rosters rr ON t.receiver_roster_id = rr.id
        LEFT JOIN users pu ON pr.user_id = pu.id
        LEFT JOIN users ru ON rr.user_id = ru.id
        WHERE t.id = $1
      `;

      const result = await this.query(query, [tradeId]);

      if (result.rows.length === 0) {
        return null;
      }

      const trade = result.rows[0];

      // Get trade items
      const items = await this.getItems(tradeId);
      trade.items = items;

      return trade;
    } catch (error) {
      logger.error('Error getting trade with details:', { tradeId, error });
      throw new Error('Failed to get trade with details');
    }
  }

  /**
   * Get all trades for a league
   * Optionally filter by status
   *
   * @param leagueId - The league ID
   * @param status - Optional status filter (pending, accepted, rejected, cancelled)
   * @returns Array of trades with details
   */
  async getByLeague(
    leagueId: number,
    status?: "pending" | "accepted" | "rejected" | "cancelled"
  ): Promise<TradeWithDetails[]> {
    try {
      let query = `
        SELECT
          t.*,
          COALESCE(pr.settings->>'team_name', pu.username, 'Team ' || pr.roster_id) as proposer_team_name,
          COALESCE(rr.settings->>'team_name', ru.username, 'Team ' || rr.roster_id) as receiver_team_name,
          pu.username as proposer_name,
          ru.username as receiver_name
        FROM trades t
        LEFT JOIN rosters pr ON t.proposer_roster_id = pr.id
        LEFT JOIN rosters rr ON t.receiver_roster_id = rr.id
        LEFT JOIN users pu ON pr.user_id = pu.id
        LEFT JOIN users ru ON rr.user_id = ru.id
        WHERE t.league_id = $1
      `;

      const params: any[] = [leagueId];

      if (status) {
        query += ` AND t.status = $2`;
        params.push(status);
      }

      query += ` ORDER BY t.proposed_at DESC`;

      const result = await this.query(query, params);

      // Get items for each trade
      const trades = await Promise.all(
        result.rows.map(async (trade) => {
          const items = await this.getItems(trade.id);
          return { ...trade, items };
        })
      );

      return trades;
    } catch (error) {
      logger.error('Error getting trades for league:', { leagueId, status, error });
      throw new Error('Failed to get trades for league');
    }
  }

  /**
   * Get all trades involving a specific roster
   * Either as proposer or receiver
   *
   * @param rosterId - The roster ID
   * @returns Array of trades with details
   */
  async getByRoster(rosterId: number): Promise<TradeWithDetails[]> {
    try {
      const query = `
        SELECT
          t.*,
          COALESCE(pr.settings->>'team_name', pu.username, 'Team ' || pr.roster_id) as proposer_team_name,
          COALESCE(rr.settings->>'team_name', ru.username, 'Team ' || rr.roster_id) as receiver_team_name,
          pu.username as proposer_name,
          ru.username as receiver_name
        FROM trades t
        LEFT JOIN rosters pr ON t.proposer_roster_id = pr.id
        LEFT JOIN rosters rr ON t.receiver_roster_id = rr.id
        LEFT JOIN users pu ON pr.user_id = pu.id
        LEFT JOIN users ru ON rr.user_id = ru.id
        WHERE t.proposer_roster_id = $1 OR t.receiver_roster_id = $1
        ORDER BY t.proposed_at DESC
      `;

      const result = await this.query(query, [rosterId]);

      // Get items for each trade
      const trades = await Promise.all(
        result.rows.map(async (trade) => {
          const items = await this.getItems(trade.id);
          return { ...trade, items };
        })
      );

      return trades;
    } catch (error) {
      logger.error('Error getting trades for roster:', { rosterId, error });
      throw new Error('Failed to get trades for roster');
    }
  }

  /**
   * Create a new trade
   *
   * @param params - Trade creation parameters
   * @returns The created trade
   */
  async createTrade(params: {
    league_id: number;
    proposer_roster_id: number;
    receiver_roster_id: number;
    proposer_message?: string;
  }): Promise<Trade> {
    try {
      const query = `
        INSERT INTO trades (league_id, proposer_roster_id, receiver_roster_id, proposer_message)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const result = await this.query(query, [
        params.league_id,
        params.proposer_roster_id,
        params.receiver_roster_id,
        params.proposer_message || null,
      ]);

      logger.debug('Created new trade', {
        tradeId: result.rows[0].id,
        leagueId: params.league_id,
        proposerRosterId: params.proposer_roster_id,
        receiverRosterId: params.receiver_roster_id,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating trade:', { params, error });
      throw new Error('Failed to create trade');
    }
  }

  /**
   * Update trade status
   * Also updates related timestamp fields
   *
   * @param tradeId - The trade ID
   * @param status - New status
   * @param extras - Additional fields to update (rejection_reason, responded_at, processed_at)
   * @returns Updated trade
   */
  async updateStatus(
    tradeId: number,
    status: "pending" | "accepted" | "rejected" | "cancelled",
    extras?: {
      rejection_reason?: string;
      responded_at?: Date;
      processed_at?: Date;
    }
  ): Promise<Trade> {
    try {
      let query = `UPDATE trades SET status = $1, updated_at = CURRENT_TIMESTAMP`;
      const params: any[] = [status];
      let paramCount = 1;

      if (extras?.rejection_reason) {
        paramCount++;
        query += `, rejection_reason = $${paramCount}`;
        params.push(extras.rejection_reason);
      }

      if (extras?.responded_at) {
        paramCount++;
        query += `, responded_at = $${paramCount}`;
        params.push(extras.responded_at);
      }

      if (extras?.processed_at) {
        paramCount++;
        query += `, processed_at = $${paramCount}`;
        params.push(extras.processed_at);
      }

      query += ` WHERE id = $${paramCount + 1} RETURNING *`;
      params.push(tradeId);

      const result = await this.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Trade not found');
      }

      logger.debug('Updated trade status', { tradeId, status, extras });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating trade status:', { tradeId, status, extras, error });
      throw new Error('Failed to update trade status');
    }
  }

  /**
   * Get all items in a trade
   * Includes player name from JOIN
   *
   * @param tradeId - The trade ID
   * @returns Array of trade items
   */
  async getItems(tradeId: number): Promise<TradeItem[]> {
    try {
      const query = `
        SELECT
          ti.*,
          p.full_name as player_name
        FROM trade_items ti
        LEFT JOIN players p ON ti.player_id = p.player_id
        WHERE ti.trade_id = $1
      `;

      const result = await this.query(query, [tradeId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting trade items:', { tradeId, error });
      throw new Error('Failed to get trade items');
    }
  }

  /**
   * Add an item to a trade
   *
   * @param params - Trade item parameters
   * @returns The created trade item
   */
  async addItem(params: {
    trade_id: number;
    from_roster_id: number;
    to_roster_id: number;
    player_id: number;
    player_name?: string;
  }): Promise<TradeItem> {
    try {
      const query = `
        INSERT INTO trade_items (trade_id, from_roster_id, to_roster_id, player_id, player_name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await this.query(query, [
        params.trade_id,
        params.from_roster_id,
        params.to_roster_id,
        params.player_id,
        params.player_name || null,
      ]);

      logger.debug('Added trade item', {
        tradeId: params.trade_id,
        playerId: params.player_id,
        fromRosterId: params.from_roster_id,
        toRosterId: params.to_roster_id,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding trade item:', { params, error });
      throw new Error('Failed to add trade item');
    }
  }

  /**
   * Delete all items for a trade
   * Used when cancelling or resetting a trade
   *
   * @param tradeId - The trade ID
   */
  async deleteItems(tradeId: number): Promise<void> {
    try {
      await this.query("DELETE FROM trade_items WHERE trade_id = $1", [tradeId]);
      logger.debug('Deleted all trade items', { tradeId });
    } catch (error) {
      logger.error('Error deleting trade items:', { tradeId, error });
      throw new Error('Failed to delete trade items');
    }
  }

  /**
   * Get pending trades for a roster
   * Useful for checking if a roster has pending trades before certain actions
   *
   * @param rosterId - The roster ID
   * @returns Array of pending trades
   */
  async getPendingByRoster(rosterId: number): Promise<Trade[]> {
    try {
      const query = `
        SELECT * FROM trades
        WHERE (proposer_roster_id = $1 OR receiver_roster_id = $1)
          AND status = 'pending'
        ORDER BY proposed_at DESC
      `;

      const result = await this.query(query, [rosterId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending trades for roster:', { rosterId, error });
      throw new Error('Failed to get pending trades for roster');
    }
  }

  /**
   * Get count of trades for a league
   * Optionally filter by status
   *
   * @param leagueId - The league ID
   * @param status - Optional status filter
   * @returns Count of trades
   */
  async countByLeague(
    leagueId: number,
    status?: "pending" | "accepted" | "rejected" | "cancelled"
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
      logger.error('Error counting trades for league:', { leagueId, status, error });
      throw new Error('Failed to count trades for league');
    }
  }

  /**
   * Accept a trade (update status to accepted and set timestamps)
   *
   * @param tradeId - The trade ID
   * @returns Updated trade
   */
  async accept(tradeId: number): Promise<Trade> {
    try {
      return await this.updateStatus(tradeId, 'accepted', {
        responded_at: new Date(),
        processed_at: new Date(),
      });
    } catch (error) {
      logger.error('Error accepting trade:', { tradeId, error });
      throw new Error('Failed to accept trade');
    }
  }

  /**
   * Reject a trade
   *
   * @param tradeId - The trade ID
   * @param reason - Optional rejection reason
   * @returns Updated trade
   */
  async reject(tradeId: number, reason?: string): Promise<Trade> {
    try {
      return await this.updateStatus(tradeId, 'rejected', {
        rejection_reason: reason,
        responded_at: new Date(),
      });
    } catch (error) {
      logger.error('Error rejecting trade:', { tradeId, reason, error });
      throw new Error('Failed to reject trade');
    }
  }

  /**
   * Cancel a trade
   *
   * @param tradeId - The trade ID
   * @returns Updated trade
   */
  async cancel(tradeId: number): Promise<Trade> {
    try {
      return await this.updateStatus(tradeId, 'cancelled', {
        responded_at: new Date(),
      });
    } catch (error) {
      logger.error('Error cancelling trade:', { tradeId, error });
      throw new Error('Failed to cancel trade');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const tradeRepository = new TradeRepository();
