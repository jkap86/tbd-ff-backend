import { BaseRepository } from "../models/BaseRepository";
import { Player, PaginatedPlayers } from "../models/Player";
import { logger } from "../config/logger";
import { escapeLikePattern } from "../utils/sqlHelpers";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import pool from "../config/database";

/**
 * PlayerRepository - Centralized repository for all player-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - Player search and filtering with pagination
 * - Draft-specific player queries (available players)
 * - Bulk upsert operations for Sleeper API data
 * - Injury status management
 *
 * Benefits:
 * - Centralizes all player data access logic
 * - Provides consistent pagination and filtering
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 */
export class PlayerRepository extends BaseRepository<Player> {
  constructor() {
    super('players', 'id');
  }

  /**
   * Get all players with optional filtering and pagination
   *
   * @param filters - Optional filters for position, team, search, limit, offset
   * @returns Array of players matching the filters
   */
  async getAll(
    filters?: {
      position?: string;
      team?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Player[]> {
    try {
      let query = `
        SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
        FROM players
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (filters?.position) {
        query += ` AND position = $${paramCount}`;
        params.push(filters.position);
        paramCount++;
      }

      if (filters?.team) {
        query += ` AND team = $${paramCount}`;
        params.push(filters.team);
        paramCount++;
      }

      if (filters?.search) {
        const escapedSearch = escapeLikePattern(filters.search);
        query += ` AND full_name ILIKE $${paramCount}`;
        params.push(`%${escapedSearch}%`);
        paramCount++;
      }

      query += ` ORDER BY search_rank NULLS LAST, full_name`;

      // Add pagination if provided
      if (filters?.limit !== undefined) {
        query += ` LIMIT $${paramCount}`;
        params.push(filters.limit);
        paramCount++;
      }

      if (filters?.offset !== undefined) {
        query += ` OFFSET $${paramCount}`;
        params.push(filters.offset);
        paramCount++;
      }

      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting all players:', { filters, error });
      throw new Error('Failed to get all players');
    }
  }

  /**
   * Get total count of players with optional filters
   * Useful for pagination
   *
   * @param filters - Optional filters for position, team, search
   * @returns Total count of players matching filters
   */
  async getCount(
    filters?: {
      position?: string;
      team?: string;
      search?: string;
    }
  ): Promise<number> {
    try {
      let query = `
        SELECT COUNT(*) as count
        FROM players
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (filters?.position) {
        query += ` AND position = $${paramCount}`;
        params.push(filters.position);
        paramCount++;
      }

      if (filters?.team) {
        query += ` AND team = $${paramCount}`;
        params.push(filters.team);
        paramCount++;
      }

      if (filters?.search) {
        const escapedSearch = escapeLikePattern(filters.search);
        query += ` AND full_name ILIKE $${paramCount}`;
        params.push(`%${escapedSearch}%`);
        paramCount++;
      }

      const result = await this.query(query, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting player count:', { filters, error });
      throw new Error('Failed to get player count');
    }
  }

  /**
   * Get available players for a draft (not yet drafted) with pagination
   * Excludes players already selected in the draft
   *
   * @param draftId - The draft ID
   * @param filters - Optional filters for position, team, search, pagination
   * @returns Paginated players with metadata
   */
  async getAvailableForDraft(
    draftId: number,
    filters?: {
      position?: string;
      team?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<PaginatedPlayers> {
    try {
      // Pagination parameters with defaults
      const page = Math.max(1, filters?.page || 1);
      const limit = Math.min(100, Math.max(1, filters?.limit || 50)); // Default 50, max 100
      const offset = (page - 1) * limit;

      logger.debug('Getting available players for draft', {
        draftId,
        filters,
        page,
        limit,
        offset
      });

      // Build the WHERE clause for filtering
      let whereClause = `
        WHERE NOT EXISTS (
          SELECT 1
          FROM draft_picks dp
          WHERE dp.draft_id = $1
            AND dp.player_id = p.player_id
            AND dp.player_id IS NOT NULL
        )
      `;
      const params: any[] = [draftId];
      let paramCount = 2;

      if (filters?.position) {
        whereClause += ` AND p.position = $${paramCount}`;
        params.push(filters.position);
        paramCount++;
      }

      if (filters?.team) {
        whereClause += ` AND p.team = $${paramCount}`;
        params.push(filters.team);
        paramCount++;
      }

      if (filters?.search) {
        const escapedSearch = escapeLikePattern(filters.search);
        whereClause += ` AND p.full_name ILIKE $${paramCount}`;
        params.push(`%${escapedSearch}%`);
        paramCount++;
      }

      // Get total count for pagination metadata
      const countQuery = `
        SELECT COUNT(*) as total
        FROM players p
        ${whereClause}
      `;
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      // Get paginated data
      const dataQuery = `
        SELECT p.id, p.player_id, p.full_name, p.position, p.team, p.age, p.years_exp, p.search_rank, p.fantasy_data_id, p.created_at, p.updated_at
        FROM players p
        ${whereClause}
        ORDER BY p.search_rank NULLS LAST, p.full_name
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      params.push(limit, offset);

      const result = await pool.query(dataQuery, params);

      logger.debug('Available players query result', {
        draftId,
        returned: result.rows.length,
        page,
        totalPages,
        total
      });

      return {
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      };
    } catch (error) {
      logger.error('Error getting available players for draft:', { draftId, filters, error });
      throw new Error('Failed to get available players for draft');
    }
  }

  /**
   * Get player by Sleeper player_id
   *
   * @param sleeperPlayerId - Sleeper's player_id string
   * @returns Player or null if not found
   */
  async getBySleeperPlayerId(sleeperPlayerId: string): Promise<Player | null> {
    try {
      const query = `
        SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
        FROM players
        WHERE player_id = $1
      `;

      const result = await this.query(query, [sleeperPlayerId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting player by Sleeper ID:', { sleeperPlayerId, error });
      throw new Error('Failed to get player by Sleeper ID');
    }
  }

  /**
   * Get multiple players by their database IDs
   *
   * @param playerIds - Array of player database IDs
   * @returns Array of players
   */
  async getByIds(playerIds: number[]): Promise<Player[]> {
    if (playerIds.length === 0) {
      return [];
    }

    try {
      const query = `
        SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
        FROM players
        WHERE id = ANY($1)
        ORDER BY search_rank NULLS LAST, full_name
      `;

      const result = await this.query(query, [playerIds]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting players by IDs:', { playerIds, error });
      throw new Error('Failed to get players by IDs');
    }
  }

  /**
   * Upsert a single player from Sleeper API data
   * Updates if player exists, inserts if new
   *
   * @param playerData - Player data from Sleeper API
   * @returns The upserted player
   */
  async upsert(playerData: {
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
    age: number | null;
    years_exp: number | null;
    search_rank: number | null;
    fantasy_data_id: string | null;
  }): Promise<Player> {
    try {
      const query = `
        INSERT INTO players (player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (player_id)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          position = EXCLUDED.position,
          team = EXCLUDED.team,
          age = EXCLUDED.age,
          years_exp = EXCLUDED.years_exp,
          search_rank = EXCLUDED.search_rank,
          fantasy_data_id = EXCLUDED.fantasy_data_id,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
      `;

      const result = await this.query(query, [
        playerData.player_id,
        playerData.full_name,
        playerData.position,
        playerData.team,
        playerData.age,
        playerData.years_exp,
        playerData.search_rank,
        playerData.fantasy_data_id,
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error upserting player:', { playerData, error });
      throw new Error('Failed to upsert player');
    }
  }

  /**
   * Bulk upsert players from Sleeper API
   * Processes in batches to avoid PostgreSQL parameter limit
   *
   * @param players - Array of player data from Sleeper API
   * @returns Number of players upserted
   */
  async bulkUpsert(
    players: Array<{
      player_id: string;
      full_name: string;
      position: string;
      team: string | null;
      age: number | null;
      years_exp: number | null;
      search_rank: number | null;
      fantasy_data_id: string | null;
    }>
  ): Promise<number> {
    if (players.length === 0) {
      return 0;
    }

    const client = await pool.connect();
    await setTransactionTimeouts(client);
    try {
      await client.query("BEGIN");

      let totalUpserted = 0;

      // Process in batches to avoid PostgreSQL parameter limit (~65535)
      // Each player has 8 fields, so we can safely batch 500 players (4000 params)
      const BATCH_SIZE = 500;

      for (let i = 0; i < players.length; i += BATCH_SIZE) {
        const batch = players.slice(i, i + BATCH_SIZE);

        // Build multi-row INSERT query
        const valueStrings: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        for (const playerData of batch) {
          valueStrings.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, CURRENT_TIMESTAMP)`
          );
          params.push(
            playerData.player_id,
            playerData.full_name,
            playerData.position,
            playerData.team,
            playerData.age,
            playerData.years_exp,
            playerData.search_rank,
            playerData.fantasy_data_id
          );
          paramIndex += 8;
        }

        const query = `
          INSERT INTO players (player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, updated_at)
          VALUES ${valueStrings.join(', ')}
          ON CONFLICT (player_id)
          DO UPDATE SET
            full_name = EXCLUDED.full_name,
            position = EXCLUDED.position,
            team = EXCLUDED.team,
            age = EXCLUDED.age,
            years_exp = EXCLUDED.years_exp,
            search_rank = EXCLUDED.search_rank,
            fantasy_data_id = EXCLUDED.fantasy_data_id,
            updated_at = CURRENT_TIMESTAMP
        `;

        await client.query(query, params);
        totalUpserted += batch.length;
      }

      await client.query("COMMIT");

      logger.info('Bulk upserted players', { total: totalUpserted });

      return totalUpserted;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error('Error bulk upserting players:', { count: players.length, error });
      throw new Error('Failed to bulk upsert players');
    } finally {
      client.release();
    }
  }

  /**
   * Update player injury status
   *
   * @param playerId - Sleeper player_id
   * @param injuryData - Injury status, designation, and return date
   */
  async updateInjuryStatus(
    playerId: string,
    injuryData: {
      injury_status?: string;
      injury_designation?: string;
      injury_return_date?: Date | null;
    }
  ): Promise<void> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (injuryData.injury_status !== undefined) {
        updates.push(`injury_status = $${paramCount++}`);
        values.push(injuryData.injury_status);
      }

      if (injuryData.injury_designation !== undefined) {
        updates.push(`injury_designation = $${paramCount++}`);
        values.push(injuryData.injury_designation);
      }

      if (injuryData.injury_return_date !== undefined) {
        updates.push(`injury_return_date = $${paramCount++}`);
        values.push(injuryData.injury_return_date);
      }

      if (updates.length > 0) {
        updates.push(`injury_updated_at = CURRENT_TIMESTAMP`);
        values.push(playerId);

        const query = `
          UPDATE players
          SET ${updates.join(', ')}
          WHERE player_id = $${paramCount}
        `;

        await this.query(query, values);

        logger.debug('Updated player injury status', { playerId, injuryData });
      }
    } catch (error) {
      logger.error('Error updating player injury status:', { playerId, injuryData, error });
      throw new Error('Failed to update player injury status');
    }
  }

  /**
   * Get all injured players
   * Excludes players with 'Healthy' status
   *
   * @returns Array of injured players ordered by most recently updated
   */
  async getInjured(): Promise<Player[]> {
    try {
      const query = `
        SELECT * FROM players
        WHERE injury_status IS NOT NULL
          AND injury_status != 'Healthy'
        ORDER BY injury_updated_at DESC
      `;

      const result = await this.query(query, []);
      return result.rows;
    } catch (error) {
      logger.error('Error getting injured players:', { error });
      throw new Error('Failed to get injured players');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const playerRepository = new PlayerRepository();
