import { BaseRepository } from "../models/BaseRepository";
import { League } from "../models/League";
import { logger } from "../config/logger";

/**
 * LeagueRepository - Centralized repository for all league-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - User-specific league queries
 * - Public league discovery
 * - League status management
 * - Commissioner and permission checks
 *
 * Benefits:
 * - Centralizes all league data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 */
export class LeagueRepository extends BaseRepository<League> {
  constructor() {
    super('leagues', 'id');
  }

  /**
   * Get all leagues for a specific user
   * User must be a member (have a roster) in the league
   *
   * @param userId - The user ID
   * @returns Array of leagues the user is a member of
   */
  async getByUserId(userId: number): Promise<League[]> {
    try {
      const query = `
        SELECT DISTINCT l.*
        FROM leagues l
        INNER JOIN rosters r ON r.league_id = l.id
        WHERE r.user_id = $1
        ORDER BY l.created_at DESC
      `;

      const result = await this.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting leagues for user:', { userId, error });
      throw new Error('Failed to get leagues for user');
    }
  }

  /**
   * Get all public leagues
   * Used for league discovery
   *
   * @param limit - Maximum number of leagues to return
   * @returns Array of public leagues
   */
  async getPublicLeagues(limit: number = 20): Promise<League[]> {
    try {
      const query = `
        SELECT l.*,
               (SELECT COUNT(*) FROM rosters WHERE rosters.league_id = l.id) as current_members
        FROM leagues l
        WHERE l.settings->>'is_public' = 'true'
          AND (SELECT COUNT(*) FROM rosters WHERE rosters.league_id = l.id) < l.total_rosters
        ORDER BY l.created_at DESC
        LIMIT $1
      `;

      const result = await this.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting public leagues:', { limit, error });
      throw new Error('Failed to get public leagues');
    }
  }

  /**
   * Get league by invite code
   * Used for joining leagues via invite link
   *
   * @param inviteCode - The invite code
   * @returns League or null if not found
   */
  async getByInviteCode(inviteCode: string): Promise<League | null> {
    try {
      const query = `
        SELECT * FROM leagues
        WHERE settings->>'invite_code' = $1
        LIMIT 1
      `;

      const result = await this.query(query, [inviteCode]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting league by invite code:', { inviteCode, error });
      throw new Error('Failed to get league by invite code');
    }
  }

  /**
   * Get leagues by status
   *
   * @param status - League status (drafting, in_season, completed, etc.)
   * @returns Array of leagues with the specified status
   */
  async getByStatus(status: string): Promise<League[]> {
    try {
      return await this.findBy('status', status, 'created_at DESC');
    } catch (error) {
      logger.error('Error getting leagues by status:', { status, error });
      throw new Error('Failed to get leagues by status');
    }
  }

  /**
   * Get leagues by type
   *
   * @param leagueType - League type (redraft, keeper, dynasty)
   * @returns Array of leagues with the specified type
   */
  async getByType(leagueType: string): Promise<League[]> {
    try {
      return await this.findBy('league_type', leagueType, 'created_at DESC');
    } catch (error) {
      logger.error('Error getting leagues by type:', { leagueType, error });
      throw new Error('Failed to get leagues by type');
    }
  }

  /**
   * Update league status
   *
   * @param leagueId - The league ID
   * @param status - New status
   * @returns Updated league
   */
  async updateStatus(leagueId: number, status: string): Promise<League> {
    try {
      const query = `
        UPDATE leagues
        SET status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [status, leagueId]);

      if (result.rows.length === 0) {
        throw new Error('League not found');
      }

      logger.debug('Updated league status', { leagueId, status });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating league status:', { leagueId, status, error });
      throw new Error('Failed to update league status');
    }
  }

  /**
   * Update league settings
   * Merges new settings with existing ones
   *
   * @param leagueId - The league ID
   * @param settings - Settings to update
   * @returns Updated league
   */
  async updateSettings(leagueId: number, settings: Record<string, any>): Promise<League> {
    try {
      const query = `
        UPDATE leagues
        SET settings = settings || $1::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [JSON.stringify(settings), leagueId]);

      if (result.rows.length === 0) {
        throw new Error('League not found');
      }

      logger.debug('Updated league settings', { leagueId, settings });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating league settings:', { leagueId, settings, error });
      throw new Error('Failed to update league settings');
    }
  }

  /**
   * Update league scoring settings
   * Merges new scoring settings with existing ones
   *
   * @param leagueId - The league ID
   * @param scoringSettings - Scoring settings to update
   * @returns Updated league
   */
  async updateScoringSettings(
    leagueId: number,
    scoringSettings: Record<string, number>
  ): Promise<League> {
    try {
      const query = `
        UPDATE leagues
        SET scoring_settings = scoring_settings || $1::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [JSON.stringify(scoringSettings), leagueId]);

      if (result.rows.length === 0) {
        throw new Error('League not found');
      }

      logger.debug('Updated league scoring settings', { leagueId, scoringSettings });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating league scoring settings:', {
        leagueId,
        scoringSettings,
        error
      });
      throw new Error('Failed to update league scoring settings');
    }
  }

  /**
   * Get commissioner ID for a league
   *
   * @param leagueId - The league ID
   * @returns Commissioner user ID or null
   */
  async getCommissionerId(leagueId: number): Promise<number | null> {
    try {
      const query = `
        SELECT settings->>'commissioner_id' as commissioner_id
        FROM leagues
        WHERE id = $1
      `;

      const result = await this.query(query, [leagueId]);

      if (result.rows.length === 0) {
        return null;
      }

      const commissionerId = result.rows[0].commissioner_id;
      return commissionerId ? parseInt(commissionerId, 10) : null;
    } catch (error) {
      logger.error('Error getting commissioner ID:', { leagueId, error });
      throw new Error('Failed to get commissioner ID');
    }
  }

  /**
   * Check if a user is the commissioner of a league
   *
   * @param leagueId - The league ID
   * @param userId - The user ID to check
   * @returns True if user is commissioner
   */
  async isCommissioner(leagueId: number, userId: number): Promise<boolean> {
    try {
      const query = `
        SELECT (settings->>'commissioner_id')::int = $2 as is_commissioner
        FROM leagues
        WHERE id = $1
      `;

      const result = await this.query(query, [leagueId, userId]);

      if (result.rows.length === 0) {
        return false;
      }

      return result.rows[0].is_commissioner || false;
    } catch (error) {
      logger.error('Error checking if user is commissioner:', { leagueId, userId, error });
      throw new Error('Failed to check commissioner status');
    }
  }

  /**
   * Transfer commissioner role to another user
   *
   * @param leagueId - The league ID
   * @param newCommissionerId - The new commissioner user ID
   * @returns Updated league
   */
  async transferCommissioner(leagueId: number, newCommissionerId: number): Promise<League> {
    try {
      const query = `
        UPDATE leagues
        SET settings = jsonb_set(settings, '{commissioner_id}', to_jsonb($1::int)),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.query(query, [newCommissionerId, leagueId]);

      if (result.rows.length === 0) {
        throw new Error('League not found');
      }

      logger.info('Transferred commissioner role', { leagueId, newCommissionerId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error transferring commissioner:', {
        leagueId,
        newCommissionerId,
        error
      });
      throw new Error('Failed to transfer commissioner');
    }
  }

  /**
   * Count leagues for a user
   * Useful for pagination and statistics
   *
   * @param userId - The user ID
   * @returns Count of leagues
   */
  async countByUserId(userId: number): Promise<number> {
    try {
      const query = `
        SELECT COUNT(DISTINCT l.id) as count
        FROM leagues l
        INNER JOIN rosters r ON r.league_id = l.id
        WHERE r.user_id = $1
      `;

      const result = await this.query(query, [userId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error counting leagues for user:', { userId, error });
      throw new Error('Failed to count leagues for user');
    }
  }

  /**
   * Get league with member count
   * Includes the number of current members
   *
   * @param leagueId - The league ID
   * @returns League with member_count field
   */
  async getWithMemberCount(leagueId: number): Promise<(League & { member_count: number }) | null> {
    try {
      const query = `
        SELECT l.*,
               (SELECT COUNT(*) FROM rosters WHERE rosters.league_id = l.id) as member_count
        FROM leagues l
        WHERE l.id = $1
      `;

      const result = await this.query(query, [leagueId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting league with member count:', { leagueId, error });
      throw new Error('Failed to get league with member count');
    }
  }

  /**
   * Check if league is full
   *
   * @param leagueId - The league ID
   * @returns True if league has reached maximum rosters
   */
  async isFull(leagueId: number): Promise<boolean> {
    try {
      const query = `
        SELECT (SELECT COUNT(*) FROM rosters WHERE rosters.league_id = l.id) >= l.total_rosters as is_full
        FROM leagues l
        WHERE l.id = $1
      `;

      const result = await this.query(query, [leagueId]);

      if (result.rows.length === 0) {
        throw new Error('League not found');
      }

      return result.rows[0].is_full || false;
    } catch (error) {
      logger.error('Error checking if league is full:', { leagueId, error });
      throw new Error('Failed to check if league is full');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const leagueRepository = new LeagueRepository();
