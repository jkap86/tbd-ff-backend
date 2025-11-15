import { BaseRepository } from "../models/BaseRepository";
import { logger } from "../config/logger";

export interface PlayerStats {
  id: number;
  player_id: number;
  week: number;
  season: string;
  season_type: string;

  // Passing
  passing_attempts: number;
  passing_completions: number;
  passing_yards: number;
  passing_touchdowns: number;
  passing_interceptions: number;
  passing_2pt_conversions: number;

  // Rushing
  rushing_attempts: number;
  rushing_yards: number;
  rushing_touchdowns: number;
  rushing_2pt_conversions: number;

  // Receiving
  receiving_targets: number;
  receiving_receptions: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  receiving_2pt_conversions: number;

  // Fumbles
  fumbles_lost: number;

  // Kicking
  field_goals_made: number;
  field_goals_attempted: number;
  field_goals_made_0_19: number;
  field_goals_made_20_29: number;
  field_goals_made_30_39: number;
  field_goals_made_40_49: number;
  field_goals_made_50_plus: number;
  extra_points_made: number;
  extra_points_attempted: number;

  // Defense/ST
  defensive_touchdowns: number;
  special_teams_touchdowns: number;
  defensive_interceptions: number;
  defensive_fumbles_recovered: number;
  defensive_sacks: number;
  defensive_safeties: number;
  defensive_points_allowed: number;
  defensive_yards_allowed: number;

  // IDP
  tackles_solo: number;
  tackles_assisted: number;
  tackles_for_loss: number;
  quarterback_hits: number;
  passes_defended: number;

  // Advanced stats - First downs
  rushing_first_downs: number;
  receiving_first_downs: number;
  passing_first_downs: number;

  // Advanced stats - Big plays
  rush_40plus: number;
  rec_40plus: number;
  pass_40plus: number;

  created_at: Date;
  updated_at: Date;
}

export interface PlayerStatsWithInfo extends PlayerStats {
  player_name?: string;
  player_position?: string;
  player_team?: string;
}

/**
 * StatsRepository - Centralized repository for all player statistics queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations for player stats (inherited from BaseRepository)
 * - Weekly and season-long statistics retrieval
 * - Bulk stats updates from external APIs (Sleeper)
 * - Stats aggregation and calculations
 * - Player performance queries
 *
 * Benefits:
 * - Centralizes all player stats data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across services
 * - Optimizes bulk operations for API syncs
 */
export class StatsRepository extends BaseRepository<PlayerStats> {
  constructor() {
    super('player_stats', 'id');
  }

  /**
   * Upsert player stats (create or update)
   * Used for syncing stats from external APIs
   *
   * @param statsData - Player stats to upsert
   * @returns The upserted player stats
   */
  async upsert(statsData: Omit<PlayerStats, "id" | "created_at" | "updated_at">): Promise<PlayerStats> {
    try {
      const query = `
        INSERT INTO player_stats (
          player_id, week, season, season_type,
          passing_attempts, passing_completions, passing_yards, passing_touchdowns,
          passing_interceptions, passing_2pt_conversions,
          rushing_attempts, rushing_yards, rushing_touchdowns, rushing_2pt_conversions,
          receiving_targets, receiving_receptions, receiving_yards, receiving_touchdowns,
          receiving_2pt_conversions,
          fumbles_lost,
          field_goals_made, field_goals_attempted, field_goals_made_0_19, field_goals_made_20_29,
          field_goals_made_30_39, field_goals_made_40_49, field_goals_made_50_plus,
          extra_points_made, extra_points_attempted,
          defensive_touchdowns, special_teams_touchdowns, defensive_interceptions,
          defensive_fumbles_recovered, defensive_sacks, defensive_safeties,
          defensive_points_allowed, defensive_yards_allowed,
          tackles_solo, tackles_assisted, tackles_for_loss, quarterback_hits, passes_defended,
          rushing_first_downs, receiving_first_downs, passing_first_downs,
          rush_40plus, rec_40plus, pass_40plus
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
          $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48
        )
        ON CONFLICT (player_id, week, season, season_type) DO UPDATE SET
          passing_attempts = EXCLUDED.passing_attempts,
          passing_completions = EXCLUDED.passing_completions,
          passing_yards = EXCLUDED.passing_yards,
          passing_touchdowns = EXCLUDED.passing_touchdowns,
          passing_interceptions = EXCLUDED.passing_interceptions,
          passing_2pt_conversions = EXCLUDED.passing_2pt_conversions,
          rushing_attempts = EXCLUDED.rushing_attempts,
          rushing_yards = EXCLUDED.rushing_yards,
          rushing_touchdowns = EXCLUDED.rushing_touchdowns,
          rushing_2pt_conversions = EXCLUDED.rushing_2pt_conversions,
          receiving_targets = EXCLUDED.receiving_targets,
          receiving_receptions = EXCLUDED.receiving_receptions,
          receiving_yards = EXCLUDED.receiving_yards,
          receiving_touchdowns = EXCLUDED.receiving_touchdowns,
          receiving_2pt_conversions = EXCLUDED.receiving_2pt_conversions,
          fumbles_lost = EXCLUDED.fumbles_lost,
          field_goals_made = EXCLUDED.field_goals_made,
          field_goals_attempted = EXCLUDED.field_goals_attempted,
          field_goals_made_0_19 = EXCLUDED.field_goals_made_0_19,
          field_goals_made_20_29 = EXCLUDED.field_goals_made_20_29,
          field_goals_made_30_39 = EXCLUDED.field_goals_made_30_39,
          field_goals_made_40_49 = EXCLUDED.field_goals_made_40_49,
          field_goals_made_50_plus = EXCLUDED.field_goals_made_50_plus,
          extra_points_made = EXCLUDED.extra_points_made,
          extra_points_attempted = EXCLUDED.extra_points_attempted,
          defensive_touchdowns = EXCLUDED.defensive_touchdowns,
          special_teams_touchdowns = EXCLUDED.special_teams_touchdowns,
          defensive_interceptions = EXCLUDED.defensive_interceptions,
          defensive_fumbles_recovered = EXCLUDED.defensive_fumbles_recovered,
          defensive_sacks = EXCLUDED.defensive_sacks,
          defensive_safeties = EXCLUDED.defensive_safeties,
          defensive_points_allowed = EXCLUDED.defensive_points_allowed,
          defensive_yards_allowed = EXCLUDED.defensive_yards_allowed,
          tackles_solo = EXCLUDED.tackles_solo,
          tackles_assisted = EXCLUDED.tackles_assisted,
          tackles_for_loss = EXCLUDED.tackles_for_loss,
          quarterback_hits = EXCLUDED.quarterback_hits,
          passes_defended = EXCLUDED.passes_defended,
          rushing_first_downs = EXCLUDED.rushing_first_downs,
          receiving_first_downs = EXCLUDED.receiving_first_downs,
          passing_first_downs = EXCLUDED.passing_first_downs,
          rush_40plus = EXCLUDED.rush_40plus,
          rec_40plus = EXCLUDED.rec_40plus,
          pass_40plus = EXCLUDED.pass_40plus,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        statsData.player_id, statsData.week, statsData.season, statsData.season_type,
        statsData.passing_attempts, statsData.passing_completions, statsData.passing_yards,
        statsData.passing_touchdowns, statsData.passing_interceptions, statsData.passing_2pt_conversions,
        statsData.rushing_attempts, statsData.rushing_yards, statsData.rushing_touchdowns,
        statsData.rushing_2pt_conversions, statsData.receiving_targets, statsData.receiving_receptions,
        statsData.receiving_yards, statsData.receiving_touchdowns, statsData.receiving_2pt_conversions,
        statsData.fumbles_lost, statsData.field_goals_made, statsData.field_goals_attempted,
        statsData.field_goals_made_0_19, statsData.field_goals_made_20_29, statsData.field_goals_made_30_39,
        statsData.field_goals_made_40_49, statsData.field_goals_made_50_plus, statsData.extra_points_made,
        statsData.extra_points_attempted, statsData.defensive_touchdowns, statsData.special_teams_touchdowns,
        statsData.defensive_interceptions, statsData.defensive_fumbles_recovered, statsData.defensive_sacks,
        statsData.defensive_safeties, statsData.defensive_points_allowed, statsData.defensive_yards_allowed,
        statsData.tackles_solo, statsData.tackles_assisted, statsData.tackles_for_loss,
        statsData.quarterback_hits, statsData.passes_defended, statsData.rushing_first_downs,
        statsData.receiving_first_downs, statsData.passing_first_downs, statsData.rush_40plus,
        statsData.rec_40plus, statsData.pass_40plus
      ];

      const result = await this.query(query, values);

      logger.debug('Upserted player stats', {
        playerId: statsData.player_id,
        week: statsData.week,
        season: statsData.season,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error upserting player stats:', { statsData, error });
      throw new Error('Failed to upsert player stats');
    }
  }

  /**
   * Get player stats for a specific week
   * Includes player information
   *
   * @param playerId - The player ID
   * @param week - The week number
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns Player stats with info or null if not found
   */
  async getByWeek(
    playerId: number,
    week: number,
    season: string,
    seasonType: string = 'regular'
  ): Promise<PlayerStatsWithInfo | null> {
    try {
      const query = `
        SELECT
          ps.*,
          p.full_name as player_name,
          p.position as player_position,
          p.team as player_team
        FROM player_stats ps
        LEFT JOIN players p ON ps.player_id = p.id
        WHERE ps.player_id = $1 AND ps.week = $2 AND ps.season = $3 AND ps.season_type = $4
      `;

      const result = await this.query(query, [playerId, week, season, seasonType]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting player stats by week:', { playerId, week, season, error });
      throw new Error('Failed to get player stats by week');
    }
  }

  /**
   * Get stats for multiple players for a specific week
   * Optimized for bulk retrieval (e.g., for weekly lineups)
   *
   * @param playerIds - Array of player IDs
   * @param week - The week number
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns Array of player stats with info
   */
  async getMultipleByWeek(
    playerIds: number[],
    week: number,
    season: string,
    seasonType: string = 'regular'
  ): Promise<PlayerStatsWithInfo[]> {
    try {
      const query = `
        SELECT
          ps.*,
          p.full_name as player_name,
          p.position as player_position,
          p.team as player_team
        FROM player_stats ps
        LEFT JOIN players p ON ps.player_id = p.id
        WHERE ps.player_id = ANY($1) AND ps.week = $2 AND ps.season = $3 AND ps.season_type = $4
      `;

      const result = await this.query(query, [playerIds, week, season, seasonType]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting multiple player stats by week:', {
        playerIds,
        week,
        season,
        error
      });
      throw new Error('Failed to get multiple player stats by week');
    }
  }

  /**
   * Get season-long stats for a player (sum across all weeks)
   *
   * @param playerId - The player ID
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns Aggregated season stats or null if no data
   */
  async getSeasonStats(
    playerId: number,
    season: string,
    seasonType: string = 'regular'
  ): Promise<PlayerStatsWithInfo | null> {
    try {
      const query = `
        SELECT
          $1 as player_id,
          0 as week,
          $2 as season,
          $3 as season_type,
          SUM(passing_attempts) as passing_attempts,
          SUM(passing_completions) as passing_completions,
          SUM(passing_yards) as passing_yards,
          SUM(passing_touchdowns) as passing_touchdowns,
          SUM(passing_interceptions) as passing_interceptions,
          SUM(passing_2pt_conversions) as passing_2pt_conversions,
          SUM(rushing_attempts) as rushing_attempts,
          SUM(rushing_yards) as rushing_yards,
          SUM(rushing_touchdowns) as rushing_touchdowns,
          SUM(rushing_2pt_conversions) as rushing_2pt_conversions,
          SUM(receiving_targets) as receiving_targets,
          SUM(receiving_receptions) as receiving_receptions,
          SUM(receiving_yards) as receiving_yards,
          SUM(receiving_touchdowns) as receiving_touchdowns,
          SUM(receiving_2pt_conversions) as receiving_2pt_conversions,
          SUM(fumbles_lost) as fumbles_lost,
          SUM(field_goals_made) as field_goals_made,
          SUM(field_goals_attempted) as field_goals_attempted,
          SUM(field_goals_made_0_19) as field_goals_made_0_19,
          SUM(field_goals_made_20_29) as field_goals_made_20_29,
          SUM(field_goals_made_30_39) as field_goals_made_30_39,
          SUM(field_goals_made_40_49) as field_goals_made_40_49,
          SUM(field_goals_made_50_plus) as field_goals_made_50_plus,
          SUM(extra_points_made) as extra_points_made,
          SUM(extra_points_attempted) as extra_points_attempted,
          SUM(defensive_touchdowns) as defensive_touchdowns,
          SUM(special_teams_touchdowns) as special_teams_touchdowns,
          SUM(defensive_interceptions) as defensive_interceptions,
          SUM(defensive_fumbles_recovered) as defensive_fumbles_recovered,
          SUM(defensive_sacks) as defensive_sacks,
          SUM(defensive_safeties) as defensive_safeties,
          AVG(defensive_points_allowed) as defensive_points_allowed,
          AVG(defensive_yards_allowed) as defensive_yards_allowed,
          SUM(tackles_solo) as tackles_solo,
          SUM(tackles_assisted) as tackles_assisted,
          SUM(tackles_for_loss) as tackles_for_loss,
          SUM(quarterback_hits) as quarterback_hits,
          SUM(passes_defended) as passes_defended,
          SUM(rushing_first_downs) as rushing_first_downs,
          SUM(receiving_first_downs) as receiving_first_downs,
          SUM(passing_first_downs) as passing_first_downs,
          SUM(rush_40plus) as rush_40plus,
          SUM(rec_40plus) as rec_40plus,
          SUM(pass_40plus) as pass_40plus,
          p.full_name as player_name,
          p.position as player_position,
          p.team as player_team
        FROM player_stats ps
        LEFT JOIN players p ON ps.player_id = p.id
        WHERE ps.player_id = $1 AND ps.season = $2 AND ps.season_type = $3
        GROUP BY p.full_name, p.position, p.team
      `;

      const result = await this.query(query, [playerId, season, seasonType]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting season stats:', { playerId, season, error });
      throw new Error('Failed to get season stats');
    }
  }

  /**
   * Get all weeks of stats for a player in a season
   *
   * @param playerId - The player ID
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns Array of player stats by week
   */
  async getPlayerSeasonWeeks(
    playerId: number,
    season: string,
    seasonType: string = 'regular'
  ): Promise<PlayerStatsWithInfo[]> {
    try {
      const query = `
        SELECT
          ps.*,
          p.full_name as player_name,
          p.position as player_position,
          p.team as player_team
        FROM player_stats ps
        LEFT JOIN players p ON ps.player_id = p.id
        WHERE ps.player_id = $1 AND ps.season = $2 AND ps.season_type = $3
        ORDER BY ps.week ASC
      `;

      const result = await this.query(query, [playerId, season, seasonType]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting player season weeks:', { playerId, season, error });
      throw new Error('Failed to get player season weeks');
    }
  }

  /**
   * Get top performers for a specific week
   * Ordered by a specific stat category
   *
   * @param week - The week number
   * @param season - The season year
   * @param statCategory - Stat to order by (e.g., 'passing_yards', 'rushing_touchdowns')
   * @param limit - Number of players to return
   * @param position - Optional position filter
   * @returns Array of top performers
   */
  async getTopPerformers(
    week: number,
    season: string,
    statCategory: keyof Omit<PlayerStats, 'id' | 'player_id' | 'week' | 'season' | 'season_type' | 'created_at' | 'updated_at'>,
    limit: number = 10,
    position?: string
  ): Promise<PlayerStatsWithInfo[]> {
    try {
      let query = `
        SELECT
          ps.*,
          p.full_name as player_name,
          p.position as player_position,
          p.team as player_team
        FROM player_stats ps
        LEFT JOIN players p ON ps.player_id = p.id
        WHERE ps.week = $1 AND ps.season = $2 AND ps.season_type = 'regular'
      `;

      const params: any[] = [week, season];

      if (position) {
        query += ` AND p.position = $3`;
        params.push(position);
      }

      query += ` ORDER BY ps.${statCategory} DESC NULLS LAST LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting top performers:', { week, season, statCategory, error });
      throw new Error('Failed to get top performers');
    }
  }

  /**
   * Check if stats exist for a specific week
   *
   * @param week - The week number
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns True if any stats exist for the week
   */
  async hasStatsForWeek(week: number, season: string, seasonType: string = 'regular'): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM player_stats
          WHERE week = $1 AND season = $2 AND season_type = $3
        ) as has_stats
      `;

      const result = await this.query(query, [week, season, seasonType]);
      return result.rows[0].has_stats;
    } catch (error) {
      logger.error('Error checking if stats exist for week:', { week, season, error });
      throw new Error('Failed to check if stats exist for week');
    }
  }

  /**
   * Delete all stats for a specific week
   * Used when resyncing data from external API
   *
   * @param week - The week number
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns Number of stats deleted
   */
  async deleteByWeek(week: number, season: string, seasonType: string = 'regular'): Promise<number> {
    try {
      const query = `
        DELETE FROM player_stats
        WHERE week = $1 AND season = $2 AND season_type = $3
      `;

      const result = await this.query(query, [week, season, seasonType]);

      logger.info('Deleted stats for week', {
        week,
        season,
        seasonType,
        deletedCount: result.rowCount,
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting stats by week:', { week, season, error });
      throw new Error('Failed to delete stats by week');
    }
  }

  /**
   * Get stats count by season
   * Useful for verifying data completeness
   *
   * @param season - The season year
   * @param seasonType - Type of season (regular, playoff)
   * @returns Count of stats records
   */
  async countBySeason(season: string, seasonType: string = 'regular'): Promise<number> {
    try {
      return await this.count('season = $1 AND season_type = $2', [season, seasonType]);
    } catch (error) {
      logger.error('Error counting stats by season:', { season, seasonType, error });
      throw new Error('Failed to count stats by season');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const statsRepository = new StatsRepository();
