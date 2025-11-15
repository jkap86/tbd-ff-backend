import { BaseRepository } from "../models/BaseRepository";
import { logger } from "../config/logger";
import { TiebreakerMethod } from "../models/Matchup";

export interface PlayoffSettings {
  id: number;
  league_id: number;
  playoff_teams: number;
  playoff_week_start: number;
  playoff_week_end: number;
  matchup_duration: number;
  include_consolation_bracket: boolean;
  reseed_rounds: boolean;
  tiebreaker_priority: TiebreakerMethod[];
  created_at: Date;
  updated_at: Date;
}

export interface PlayoffMatchup {
  id: number;
  league_id: number;
  week: number;
  roster1_id: number;
  roster2_id: number | null;
  roster1_score: number;
  roster2_score: number;
  is_playoff: boolean;
  playoff_round: number | null;
  playoff_seed1: number | null;
  playoff_seed2: number | null;
  status: "scheduled" | "in_progress" | "completed";
  winner_roster_id: number | null;
}

export interface PlayoffTeam {
  roster_id: number;
  seed: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  user_id: number;
  username: string;
  team_name: string;
}

/**
 * PlayoffRepository - Centralized repository for all playoff-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations for playoff settings (inherited from BaseRepository)
 * - Playoff bracket management
 * - Playoff team seeding and selection
 * - Playoff matchup queries
 * - Consolation bracket support
 *
 * Benefits:
 * - Centralizes all playoff data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across services
 */
export class PlayoffRepository extends BaseRepository<PlayoffSettings> {
  constructor() {
    super('playoff_settings', 'id');
  }

  /**
   * Get playoff settings for a league
   *
   * @param leagueId - The league ID
   * @returns Playoff settings or null if not found
   */
  async getByLeagueId(leagueId: number): Promise<PlayoffSettings | null> {
    try {
      const settings = await this.findBy('league_id', leagueId);

      if (settings.length === 0) {
        return null;
      }

      const row = settings[0];
      return {
        ...row,
        tiebreaker_priority: row.tiebreaker_priority || [
          "bench_points",
          "season_points_for",
          "higher_seed",
        ],
      };
    } catch (error) {
      logger.error('Error getting playoff settings:', { leagueId, error });
      throw new Error('Failed to get playoff settings');
    }
  }

  /**
   * Create or update playoff settings for a league
   * Uses UPSERT to handle both creation and updates
   *
   * @param leagueId - The league ID
   * @param settings - Playoff settings to create/update
   * @returns The created/updated playoff settings
   */
  async upsert(
    leagueId: number,
    settings: Partial<Omit<PlayoffSettings, "id" | "league_id" | "created_at" | "updated_at">>
  ): Promise<PlayoffSettings> {
    try {
      const query = `
        INSERT INTO playoff_settings (
          league_id,
          playoff_teams,
          playoff_week_start,
          playoff_week_end,
          matchup_duration,
          include_consolation_bracket,
          reseed_rounds,
          tiebreaker_priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (league_id) DO UPDATE SET
          playoff_teams = EXCLUDED.playoff_teams,
          playoff_week_start = EXCLUDED.playoff_week_start,
          playoff_week_end = EXCLUDED.playoff_week_end,
          matchup_duration = EXCLUDED.matchup_duration,
          include_consolation_bracket = EXCLUDED.include_consolation_bracket,
          reseed_rounds = EXCLUDED.reseed_rounds,
          tiebreaker_priority = EXCLUDED.tiebreaker_priority,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        leagueId,
        settings.playoff_teams ?? 6,
        settings.playoff_week_start ?? 15,
        settings.playoff_week_end ?? 17,
        settings.matchup_duration ?? 1,
        settings.include_consolation_bracket ?? false,
        settings.reseed_rounds ?? false,
        JSON.stringify(
          settings.tiebreaker_priority ?? [
            "bench_points",
            "season_points_for",
            "higher_seed",
          ]
        ),
      ];

      const result = await this.query(query, values);

      logger.debug('Upserted playoff settings', {
        leagueId,
        settingsId: result.rows[0].id,
      });

      return {
        ...result.rows[0],
        tiebreaker_priority: result.rows[0].tiebreaker_priority,
      };
    } catch (error) {
      logger.error('Error creating or updating playoff settings:', { leagueId, settings, error });
      throw new Error('Failed to create or update playoff settings');
    }
  }

  /**
   * Delete playoff settings for a league
   *
   * @param leagueId - The league ID
   * @returns Number of rows deleted
   */
  async deleteByLeagueId(leagueId: number): Promise<number> {
    try {
      const query = `DELETE FROM playoff_settings WHERE league_id = $1`;
      const result = await this.query(query, [leagueId]);

      logger.debug('Deleted playoff settings', { leagueId, deletedCount: result.rowCount });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting playoff settings:', { leagueId, error });
      throw new Error('Failed to delete playoff settings');
    }
  }

  /**
   * Get all playoff matchups for a league
   * Includes roster and user information
   *
   * @param leagueId - The league ID
   * @returns Array of playoff matchups with details
   */
  async getPlayoffMatchups(leagueId: number): Promise<any[]> {
    try {
      const query = `
        SELECT
          m.*,
          r1.user_id as roster1_user_id,
          r2.user_id as roster2_user_id,
          u1.username as roster1_username,
          u2.username as roster2_username,
          COALESCE(r1.settings->>'team_name', u1.username, 'Team ' || r1.roster_id) as roster1_team_name,
          COALESCE(r2.settings->>'team_name', u2.username, 'Team ' || r2.roster_id) as roster2_team_name
        FROM matchups m
        LEFT JOIN rosters r1 ON m.roster1_id = r1.id
        LEFT JOIN rosters r2 ON m.roster2_id = r2.id
        LEFT JOIN users u1 ON r1.user_id = u1.id
        LEFT JOIN users u2 ON r2.user_id = u2.id
        WHERE m.league_id = $1 AND m.is_playoff = true
        ORDER BY m.week ASC, m.playoff_round ASC, m.playoff_seed1 ASC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting playoff matchups:', { leagueId, error });
      throw new Error('Failed to get playoff matchups');
    }
  }

  /**
   * Get playoff matchups for a specific week
   *
   * @param leagueId - The league ID
   * @param week - The week number
   * @returns Array of playoff matchups for the week
   */
  async getPlayoffMatchupsByWeek(leagueId: number, week: number): Promise<any[]> {
    try {
      const query = `
        SELECT
          m.*,
          r1.user_id as roster1_user_id,
          r2.user_id as roster2_user_id,
          u1.username as roster1_username,
          u2.username as roster2_username,
          COALESCE(r1.settings->>'team_name', u1.username, 'Team ' || r1.roster_id) as roster1_team_name,
          COALESCE(r2.settings->>'team_name', u2.username, 'Team ' || r2.roster_id) as roster2_team_name
        FROM matchups m
        LEFT JOIN rosters r1 ON m.roster1_id = r1.id
        LEFT JOIN rosters r2 ON m.roster2_id = r2.id
        LEFT JOIN users u1 ON r1.user_id = u1.id
        LEFT JOIN users u2 ON r2.user_id = u2.id
        WHERE m.league_id = $1 AND m.week = $2 AND m.is_playoff = true
        ORDER BY m.playoff_round ASC, m.playoff_seed1 ASC
      `;

      const result = await this.query(query, [leagueId, week]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting playoff matchups by week:', { leagueId, week, error });
      throw new Error('Failed to get playoff matchups by week');
    }
  }

  /**
   * Get playoff matchups for a specific round
   *
   * @param leagueId - The league ID
   * @param round - The playoff round number
   * @returns Array of playoff matchups for the round
   */
  async getPlayoffMatchupsByRound(leagueId: number, round: number): Promise<any[]> {
    try {
      const query = `
        SELECT
          m.*,
          r1.user_id as roster1_user_id,
          r2.user_id as roster2_user_id,
          u1.username as roster1_username,
          u2.username as roster2_username,
          COALESCE(r1.settings->>'team_name', u1.username, 'Team ' || r1.roster_id) as roster1_team_name,
          COALESCE(r2.settings->>'team_name', u2.username, 'Team ' || r2.roster_id) as roster2_team_name
        FROM matchups m
        LEFT JOIN rosters r1 ON m.roster1_id = r1.id
        LEFT JOIN rosters r2 ON m.roster2_id = r2.id
        LEFT JOIN users u1 ON r1.user_id = u1.id
        LEFT JOIN users u2 ON r2.user_id = u2.id
        WHERE m.league_id = $1 AND m.playoff_round = $2 AND m.is_playoff = true
        ORDER BY m.week ASC, m.playoff_seed1 ASC
      `;

      const result = await this.query(query, [leagueId, round]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting playoff matchups by round:', { leagueId, round, error });
      throw new Error('Failed to get playoff matchups by round');
    }
  }

  /**
   * Get top teams for playoff seeding
   * Returns teams ordered by standings (wins, then tiebreakers)
   *
   * @param leagueId - The league ID
   * @param limit - Number of teams to return
   * @returns Array of playoff teams with seeding information
   */
  async getPlayoffTeams(leagueId: number, limit: number = 6): Promise<PlayoffTeam[]> {
    try {
      const query = `
        SELECT
          r.id as roster_id,
          ROW_NUMBER() OVER (ORDER BY r.wins DESC, r.points_for DESC) as seed,
          r.wins,
          r.losses,
          r.ties,
          r.points_for,
          r.user_id,
          u.username,
          COALESCE(r.settings->>'team_name', u.username, 'Team ' || r.roster_id) as team_name
        FROM rosters r
        JOIN users u ON r.user_id = u.id
        WHERE r.league_id = $1
        ORDER BY r.wins DESC, r.points_for DESC
        LIMIT $2
      `;

      const result = await this.query(query, [leagueId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting playoff teams:', { leagueId, limit, error });
      throw new Error('Failed to get playoff teams');
    }
  }

  /**
   * Check if playoffs have started for a league
   *
   * @param leagueId - The league ID
   * @returns True if any playoff matchups exist
   */
  async hasPlayoffsStarted(leagueId: number): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM matchups
          WHERE league_id = $1 AND is_playoff = true
        ) as has_playoffs
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows[0].has_playoffs;
    } catch (error) {
      logger.error('Error checking if playoffs started:', { leagueId, error });
      throw new Error('Failed to check if playoffs started');
    }
  }

  /**
   * Get the championship matchup for a league
   * Returns the final playoff matchup (highest round number)
   *
   * @param leagueId - The league ID
   * @returns Championship matchup or null if not found
   */
  async getChampionshipMatchup(leagueId: number): Promise<any | null> {
    try {
      const query = `
        SELECT
          m.*,
          r1.user_id as roster1_user_id,
          r2.user_id as roster2_user_id,
          u1.username as roster1_username,
          u2.username as roster2_username,
          COALESCE(r1.settings->>'team_name', u1.username, 'Team ' || r1.roster_id) as roster1_team_name,
          COALESCE(r2.settings->>'team_name', u2.username, 'Team ' || r2.roster_id) as roster2_team_name
        FROM matchups m
        LEFT JOIN rosters r1 ON m.roster1_id = r1.id
        LEFT JOIN rosters r2 ON m.roster2_id = r2.id
        LEFT JOIN users u1 ON r1.user_id = u1.id
        LEFT JOIN users u2 ON r2.user_id = u2.id
        WHERE m.league_id = $1 AND m.is_playoff = true
        ORDER BY m.playoff_round DESC NULLS LAST
        LIMIT 1
      `;

      const result = await this.query(query, [leagueId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting championship matchup:', { leagueId, error });
      throw new Error('Failed to get championship matchup');
    }
  }

  /**
   * Get the league champion (winner of championship matchup)
   *
   * @param leagueId - The league ID
   * @returns Champion roster with details or null if no champion yet
   */
  async getChampion(leagueId: number): Promise<any | null> {
    try {
      const championshipMatchup = await this.getChampionshipMatchup(leagueId);

      if (!championshipMatchup || championshipMatchup.status !== 'completed' || !championshipMatchup.winner_roster_id) {
        return null;
      }

      const query = `
        SELECT
          r.id as roster_id,
          r.user_id,
          u.username,
          COALESCE(r.settings->>'team_name', u.username, 'Team ' || r.roster_id) as team_name,
          r.wins,
          r.losses,
          r.ties,
          r.points_for
        FROM rosters r
        JOIN users u ON r.user_id = u.id
        WHERE r.id = $1
      `;

      const result = await this.query(query, [championshipMatchup.winner_roster_id]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting champion:', { leagueId, error });
      throw new Error('Failed to get champion');
    }
  }

  /**
   * Check if a roster made the playoffs
   *
   * @param rosterId - The roster ID
   * @returns True if roster has any playoff matchups
   */
  async didRosterMakePlayoffs(rosterId: number): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM matchups
          WHERE (roster1_id = $1 OR roster2_id = $1) AND is_playoff = true
        ) as made_playoffs
      `;

      const result = await this.query(query, [rosterId]);
      return result.rows[0].made_playoffs;
    } catch (error) {
      logger.error('Error checking if roster made playoffs:', { rosterId, error });
      throw new Error('Failed to check if roster made playoffs');
    }
  }

  /**
   * Get consolation bracket matchups
   * Returns playoff matchups that are part of consolation bracket
   *
   * @param leagueId - The league ID
   * @returns Array of consolation matchups
   */
  async getConsolationMatchups(leagueId: number): Promise<any[]> {
    try {
      // Consolation matchups are typically those with negative round numbers
      // or a specific flag (implementation may vary)
      const query = `
        SELECT
          m.*,
          r1.user_id as roster1_user_id,
          r2.user_id as roster2_user_id,
          u1.username as roster1_username,
          u2.username as roster2_username,
          COALESCE(r1.settings->>'team_name', u1.username, 'Team ' || r1.roster_id) as roster1_team_name,
          COALESCE(r2.settings->>'team_name', u2.username, 'Team ' || r2.roster_id) as roster2_team_name
        FROM matchups m
        LEFT JOIN rosters r1 ON m.roster1_id = r1.id
        LEFT JOIN rosters r2 ON m.roster2_id = r2.id
        LEFT JOIN users u1 ON r1.user_id = u1.id
        LEFT JOIN users u2 ON r2.user_id = u2.id
        WHERE m.league_id = $1
          AND m.is_playoff = true
          AND m.playoff_round < 0
        ORDER BY m.week ASC, m.playoff_round DESC
      `;

      const result = await this.query(query, [leagueId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting consolation matchups:', { leagueId, error });
      throw new Error('Failed to get consolation matchups');
    }
  }

  /**
   * Delete all playoff matchups for a league
   * Used when resetting playoffs or regenerating bracket
   *
   * @param leagueId - The league ID
   * @returns Number of matchups deleted
   */
  async deleteAllPlayoffMatchups(leagueId: number): Promise<number> {
    try {
      const query = `
        DELETE FROM matchups
        WHERE league_id = $1 AND is_playoff = true
      `;

      const result = await this.query(query, [leagueId]);

      logger.info('Deleted all playoff matchups', {
        leagueId,
        deletedCount: result.rowCount
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting playoff matchups:', { leagueId, error });
      throw new Error('Failed to delete playoff matchups');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const playoffRepository = new PlayoffRepository();
