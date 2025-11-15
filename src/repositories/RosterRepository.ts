import { BaseRepository } from "../models/BaseRepository";
import { Roster } from "../models/Roster";
import { logger } from "../config/logger";

/**
 * RosterRepository - Centralized repository for all roster-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - League-specific roster queries
 * - Standings calculation queries
 * - Batch record updates
 *
 * Benefits:
 * - Eliminates N+1 query problems
 * - Centralizes roster data access logic
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across services
 */
export class RosterRepository extends BaseRepository<Roster> {
  constructor() {
    super('rosters', 'id');
  }

  /**
   * Get all rosters for a specific league
   *
   * @param leagueId - The league ID
   * @returns Array of rosters ordered by roster_id
   */
  async getByLeague(leagueId: number): Promise<Roster[]> {
    try {
      return await this.findBy('league_id', leagueId, 'roster_id ASC');
    } catch (error) {
      logger.error('Error getting rosters by league:', { leagueId, error });
      throw new Error('Failed to get rosters by league');
    }
  }

  /**
   * Get all rosters for a league with user information
   * Optimized single query to prevent N+1 problems
   *
   * @param leagueId - The league ID
   * @returns Array of rosters with user details
   */
  async getByLeagueWithUsers(leagueId: number): Promise<any[]> {
    try {
      const query = `
        SELECT
          r.*,
          u.username,
          u.email
        FROM rosters r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.league_id = $1
        ORDER BY r.roster_id ASC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting rosters with users:', { leagueId, error });
      throw new Error('Failed to get rosters with users');
    }
  }

  /**
   * Get standings data for a league
   * Extracts wins, losses, ties, points_for, points_against from roster settings
   *
   * @param leagueId - The league ID
   * @returns Array of roster standings data with user info
   */
  async getStandingsData(leagueId: number): Promise<StandingsData[]> {
    try {
      const query = `
        SELECT
          r.id as roster_id,
          r.user_id,
          r.roster_id as roster_number,
          COALESCE(r.settings->>'team_name', 'Team ' || r.roster_id) as team_name,
          u.username,
          COALESCE((r.settings->>'wins')::integer, 0) as wins,
          COALESCE((r.settings->>'losses')::integer, 0) as losses,
          COALESCE((r.settings->>'ties')::integer, 0) as ties,
          COALESCE((r.settings->>'points_for')::numeric, 0) as points_for,
          COALESCE((r.settings->>'points_against')::numeric, 0) as points_against
        FROM rosters r
        JOIN users u ON r.user_id = u.id
        WHERE r.league_id = $1
        ORDER BY r.roster_id
      `;

      const result = await this.query<StandingsData>(query, [leagueId]);
      return result.rows.map((row) => ({
        ...row,
        points_for: parseFloat(row.points_for as any),
        points_against: parseFloat(row.points_against as any),
      }));
    } catch (error) {
      logger.error('Error getting standings data:', { leagueId, error });
      throw new Error('Failed to get standings data');
    }
  }

  /**
   * Batch update roster records (wins, losses, ties, points)
   * Uses a single UPDATE query with CASE statements for efficiency
   *
   * @param updates - Array of roster updates
   * @returns Number of rosters updated
   */
  async batchUpdateRecords(updates: RosterRecordUpdate[]): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    try {
      const rosterIds = updates.map(u => u.rosterId);

      // Build CASE statements for each field
      const buildCaseStatement = (field: keyof Omit<RosterRecordUpdate, 'rosterId'>) => {
        let cases = 'CASE';
        updates.forEach(update => {
          if (update[field] !== undefined) {
            cases += ` WHEN id = ${update.rosterId} THEN '${update[field]}'`;
          }
        });
        cases += ` ELSE settings->>'${field}' END`;
        return cases;
      };

      const query = `
        UPDATE rosters
        SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  settings::jsonb,
                  '{wins}', to_jsonb(${buildCaseStatement('wins')}::integer)
                ),
                '{losses}', to_jsonb(${buildCaseStatement('losses')}::integer)
              ),
              '{ties}', to_jsonb(${buildCaseStatement('ties')}::integer)
            ),
            '{points_for}', to_jsonb(${buildCaseStatement('points_for')}::numeric)
          ),
          '{points_against}', to_jsonb(${buildCaseStatement('points_against')}::numeric)
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::integer[])
      `;

      const result = await this.query(query, [rosterIds]);

      logger.info('Batch updated roster records', {
        count: result.rowCount,
        rosterIds
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error batch updating roster records:', {
        updateCount: updates.length,
        error
      });
      throw new Error('Failed to batch update roster records');
    }
  }

  /**
   * Update a single roster's record
   *
   * @param rosterId - The roster ID
   * @param wins - Number of wins
   * @param losses - Number of losses
   * @param ties - Number of ties
   * @param pointsFor - Total points scored
   * @param pointsAgainst - Total points allowed
   */
  async updateRecord(
    rosterId: number,
    wins: number,
    losses: number,
    ties: number,
    pointsFor: number,
    pointsAgainst: number
  ): Promise<void> {
    try {
      const query = `
        UPDATE rosters
        SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  settings::jsonb,
                  '{wins}', to_jsonb($2::integer)
                ),
                '{losses}', to_jsonb($3::integer)
              ),
              '{ties}', to_jsonb($4::integer)
            ),
            '{points_for}', to_jsonb($5::numeric)
          ),
          '{points_against}', to_jsonb($6::numeric)
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await this.query(query, [rosterId, wins, losses, ties, pointsFor, pointsAgainst]);

      logger.debug('Updated roster record', {
        rosterId,
        wins,
        losses,
        ties,
        pointsFor,
        pointsAgainst
      });
    } catch (error) {
      logger.error('Error updating roster record:', { rosterId, error });
      throw new Error('Failed to update roster record');
    }
  }

  /**
   * Get roster by league and user
   *
   * @param leagueId - The league ID
   * @param userId - The user ID
   * @returns The roster or null if not found
   */
  async getByLeagueAndUser(leagueId: number, userId: number): Promise<Roster | null> {
    try {
      const query = `
        SELECT * FROM rosters
        WHERE league_id = $1 AND user_id = $2
        LIMIT 1
      `;

      const result = await this.query(query, [leagueId, userId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Error getting roster by league and user:', { leagueId, userId, error });
      throw new Error('Failed to get roster by league and user');
    }
  }

  /**
   * Get multiple rosters by IDs in a single query
   * Prevents N+1 query problems
   *
   * @param rosterIds - Array of roster IDs
   * @returns Array of rosters
   */
  async getByIds(rosterIds: number[]): Promise<Roster[]> {
    if (rosterIds.length === 0) {
      return [];
    }

    try {
      const query = `
        SELECT * FROM rosters
        WHERE id = ANY($1::integer[])
        ORDER BY roster_id
      `;

      const result = await this.query(query, [rosterIds]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting rosters by IDs:', { rosterIds, error });
      throw new Error('Failed to get rosters by IDs');
    }
  }
}

/**
 * Type definitions
 */

export interface StandingsData {
  roster_id: number;
  user_id: number;
  roster_number: number;
  team_name: string;
  username: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
}

export interface RosterRecordUpdate {
  rosterId: number;
  wins?: number;
  losses?: number;
  ties?: number;
  points_for?: number;
  points_against?: number;
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const rosterRepository = new RosterRepository();
