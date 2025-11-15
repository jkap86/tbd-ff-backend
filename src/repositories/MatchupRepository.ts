import { BaseRepository } from "../models/BaseRepository";
import { Matchup, MatchupWithRosters } from "../models/Matchup";
import { logger } from "../config/logger";

/**
 * MatchupRepository - Centralized repository for all matchup-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - League and week-specific matchup queries
 * - Playoff matchup queries
 * - Batch score updates
 * - Matchups with roster details (prevents N+1 problems)
 *
 * Benefits:
 * - Eliminates N+1 query problems with JOIN operations
 * - Centralizes matchup data access logic
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across services
 */
export class MatchupRepository extends BaseRepository<Matchup> {
  constructor() {
    super('matchups', 'id');
  }

  /**
   * Get all matchups for a league and specific week
   *
   * @param leagueId - The league ID
   * @param week - The week number
   * @returns Array of matchups for the specified week
   */
  async getByLeagueAndWeek(leagueId: number, week: number): Promise<Matchup[]> {
    try {
      const query = `
        SELECT * FROM matchups
        WHERE league_id = $1 AND week = $2
        ORDER BY id ASC
      `;

      const result = await this.query(query, [leagueId, week]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting matchups by league and week:', { leagueId, week, error });
      throw new Error('Failed to get matchups by league and week');
    }
  }

  /**
   * Get all matchups for a league across all weeks
   * Useful for season-wide analysis
   *
   * @param leagueId - The league ID
   * @returns Array of all matchups for the league
   */
  async getByLeague(leagueId: number): Promise<Matchup[]> {
    try {
      return await this.findBy('league_id', leagueId, 'week ASC, id ASC');
    } catch (error) {
      logger.error('Error getting matchups by league:', { leagueId, error });
      throw new Error('Failed to get matchups by league');
    }
  }

  /**
   * Get matchups for a league and week with roster details
   * Uses JOINs to prevent N+1 query problems
   *
   * @param leagueId - The league ID
   * @param week - The week number
   * @returns Array of matchups with roster team names and usernames
   */
  async getByLeagueAndWeekWithRosters(
    leagueId: number,
    week: number
  ): Promise<MatchupWithRosters[]> {
    try {
      const query = `
        SELECT
          m.*,
          r1.settings->>'team_name' as roster1_team_name,
          u1.username as roster1_username,
          r2.settings->>'team_name' as roster2_team_name,
          u2.username as roster2_username
        FROM matchups m
        LEFT JOIN rosters r1 ON m.roster1_id = r1.id
        LEFT JOIN users u1 ON r1.user_id = u1.id
        LEFT JOIN rosters r2 ON m.roster2_id = r2.id
        LEFT JOIN users u2 ON r2.user_id = u2.id
        WHERE m.league_id = $1 AND m.week = $2
        ORDER BY m.id ASC
      `;

      const result = await this.query<MatchupWithRosters>(query, [leagueId, week]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting matchups with rosters:', { leagueId, week, error });
      throw new Error('Failed to get matchups with rosters');
    }
  }

  /**
   * Get all completed matchups for a league
   * Used for record calculation and historical analysis
   *
   * @param leagueId - The league ID
   * @returns Array of completed matchups
   */
  async getCompletedByLeague(leagueId: number): Promise<Matchup[]> {
    try {
      const query = `
        SELECT * FROM matchups
        WHERE league_id = $1 AND status = 'completed'
        ORDER BY week ASC, id ASC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting completed matchups:', { leagueId, error });
      throw new Error('Failed to get completed matchups');
    }
  }

  /**
   * Get playoff matchups for a league
   *
   * @param leagueId - The league ID
   * @returns Array of playoff matchups
   */
  async getPlayoffMatchups(leagueId: number): Promise<Matchup[]> {
    try {
      const query = `
        SELECT * FROM matchups
        WHERE league_id = $1 AND is_playoff = true
        ORDER BY week ASC, bracket_position ASC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting playoff matchups:', { leagueId, error });
      throw new Error('Failed to get playoff matchups');
    }
  }

  /**
   * Get playoff matchups for a specific round
   *
   * @param leagueId - The league ID
   * @param playoffRound - The playoff round
   * @returns Array of matchups for the specified round
   */
  async getPlayoffMatchupsByRound(
    leagueId: number,
    playoffRound: string
  ): Promise<Matchup[]> {
    try {
      const query = `
        SELECT * FROM matchups
        WHERE league_id = $1
          AND is_playoff = true
          AND playoff_round = $2
        ORDER BY bracket_position ASC
      `;

      const result = await this.query(query, [leagueId, playoffRound]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting playoff matchups by round:', { leagueId, playoffRound, error });
      throw new Error('Failed to get playoff matchups by round');
    }
  }

  /**
   * Count total matchups for a league
   * Useful for pagination and statistics
   *
   * @param leagueId - The league ID
   * @returns Total number of matchups
   */
  async countByLeague(leagueId: number): Promise<number> {
    try {
      return await this.count('league_id = $1', [leagueId]);
    } catch (error) {
      logger.error('Error counting matchups:', { leagueId, error });
      throw new Error('Failed to count matchups');
    }
  }

  /**
   * Update scores for a single matchup
   *
   * @param matchupId - The matchup ID
   * @param roster1Score - Score for roster 1
   * @param roster2Score - Score for roster 2
   */
  async updateScores(
    matchupId: number,
    roster1Score: number,
    roster2Score: number
  ): Promise<void> {
    try {
      const query = `
        UPDATE matchups
        SET roster1_score = $1,
            roster2_score = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `;

      await this.query(query, [roster1Score, roster2Score, matchupId]);

      logger.debug('Updated matchup scores', {
        matchupId,
        roster1Score,
        roster2Score
      });
    } catch (error) {
      logger.error('Error updating matchup scores:', { matchupId, error });
      throw new Error('Failed to update matchup scores');
    }
  }

  /**
   * Batch update scores for multiple matchups
   * More efficient than updating one at a time
   *
   * @param updates - Array of matchup score updates
   * @returns Number of matchups updated
   */
  async batchUpdateScores(
    updates: Array<{
      matchupId: number;
      roster1Score: number;
      roster2Score: number;
    }>
  ): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    try {
      const matchupIds = updates.map(u => u.matchupId);

      // Build CASE statements for each score field
      let roster1Cases = 'CASE';
      let roster2Cases = 'CASE';

      updates.forEach(update => {
        roster1Cases += ` WHEN id = ${update.matchupId} THEN ${update.roster1Score}`;
        roster2Cases += ` WHEN id = ${update.matchupId} THEN ${update.roster2Score}`;
      });

      roster1Cases += ' ELSE roster1_score END';
      roster2Cases += ' ELSE roster2_score END';

      const query = `
        UPDATE matchups
        SET roster1_score = ${roster1Cases},
            roster2_score = ${roster2Cases},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::integer[])
      `;

      const result = await this.query(query, [matchupIds]);

      logger.info('Batch updated matchup scores', {
        count: result.rowCount,
        matchupIds
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error batch updating matchup scores:', {
        updateCount: updates.length,
        error
      });
      throw new Error('Failed to batch update matchup scores');
    }
  }

  /**
   * Update matchup status
   *
   * @param matchupId - The matchup ID
   * @param status - New status
   */
  async updateStatus(
    matchupId: number,
    status: 'scheduled' | 'in_progress' | 'completed'
  ): Promise<void> {
    try {
      const query = `
        UPDATE matchups
        SET status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await this.query(query, [status, matchupId]);

      logger.debug('Updated matchup status', {
        matchupId,
        status
      });
    } catch (error) {
      logger.error('Error updating matchup status:', { matchupId, status, error });
      throw new Error('Failed to update matchup status');
    }
  }

  /**
   * Delete all matchups for a specific week
   *
   * @param leagueId - The league ID
   * @param week - The week number
   * @returns Number of matchups deleted
   */
  async deleteByLeagueAndWeek(leagueId: number, week: number): Promise<number> {
    try {
      const query = `
        DELETE FROM matchups
        WHERE league_id = $1 AND week = $2
        RETURNING id
      `;

      const result = await this.query(query, [leagueId, week]);

      logger.info('Deleted matchups for week', {
        leagueId,
        week,
        count: result.rowCount
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting matchups for week:', { leagueId, week, error });
      throw new Error('Failed to delete matchups for week');
    }
  }

  /**
   * Delete all matchups for a league
   *
   * @param leagueId - The league ID
   * @returns Number of matchups deleted
   */
  async deleteByLeague(leagueId: number): Promise<number> {
    try {
      const query = `
        DELETE FROM matchups
        WHERE league_id = $1
        RETURNING id
      `;

      const result = await this.query(query, [leagueId]);

      logger.info('Deleted all matchups for league', {
        leagueId,
        count: result.rowCount
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting matchups for league:', { leagueId, error });
      throw new Error('Failed to delete matchups for league');
    }
  }

  /**
   * Get head-to-head matchups between two rosters
   * Useful for tiebreaker calculations
   *
   * @param leagueId - The league ID
   * @param roster1Id - First roster ID
   * @param roster2Id - Second roster ID
   * @returns Array of matchups between the two rosters
   */
  async getHeadToHeadMatchups(
    leagueId: number,
    roster1Id: number,
    roster2Id: number
  ): Promise<Matchup[]> {
    try {
      const query = `
        SELECT * FROM matchups
        WHERE league_id = $1
          AND status = 'completed'
          AND (
            (roster1_id = $2 AND roster2_id = $3)
            OR (roster1_id = $3 AND roster2_id = $2)
          )
        ORDER BY week ASC
      `;

      const result = await this.query(query, [leagueId, roster1Id, roster2Id]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting head-to-head matchups:', {
        leagueId,
        roster1Id,
        roster2Id,
        error
      });
      throw new Error('Failed to get head-to-head matchups');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const matchupRepository = new MatchupRepository();
