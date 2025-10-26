import pool from "../config/database";

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

  created_at: Date;
  updated_at: Date;
}

export interface PlayerStatsWithInfo extends PlayerStats {
  player_name?: string;
  player_position?: string;
  player_team?: string;
}

/**
 * Create or update player stats
 */
export async function upsertPlayerStats(
  statsData: Omit<PlayerStats, "id" | "created_at" | "updated_at">
): Promise<PlayerStats> {
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
        tackles_solo, tackles_assisted, tackles_for_loss, quarterback_hits, passes_defended
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29,
        $30, $31, $32, $33, $34, $35, $36, $37,
        $38, $39, $40, $41, $42
      )
      ON CONFLICT (player_id, week, season, season_type)
      DO UPDATE SET
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
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      statsData.player_id,
      statsData.week,
      statsData.season,
      statsData.season_type,
      statsData.passing_attempts || 0,
      statsData.passing_completions || 0,
      statsData.passing_yards || 0,
      statsData.passing_touchdowns || 0,
      statsData.passing_interceptions || 0,
      statsData.passing_2pt_conversions || 0,
      statsData.rushing_attempts || 0,
      statsData.rushing_yards || 0,
      statsData.rushing_touchdowns || 0,
      statsData.rushing_2pt_conversions || 0,
      statsData.receiving_targets || 0,
      statsData.receiving_receptions || 0,
      statsData.receiving_yards || 0,
      statsData.receiving_touchdowns || 0,
      statsData.receiving_2pt_conversions || 0,
      statsData.fumbles_lost || 0,
      statsData.field_goals_made || 0,
      statsData.field_goals_attempted || 0,
      statsData.field_goals_made_0_19 || 0,
      statsData.field_goals_made_20_29 || 0,
      statsData.field_goals_made_30_39 || 0,
      statsData.field_goals_made_40_49 || 0,
      statsData.field_goals_made_50_plus || 0,
      statsData.extra_points_made || 0,
      statsData.extra_points_attempted || 0,
      statsData.defensive_touchdowns || 0,
      statsData.special_teams_touchdowns || 0,
      statsData.defensive_interceptions || 0,
      statsData.defensive_fumbles_recovered || 0,
      statsData.defensive_sacks || 0,
      statsData.defensive_safeties || 0,
      statsData.defensive_points_allowed || 0,
      statsData.defensive_yards_allowed || 0,
      statsData.tackles_solo || 0,
      statsData.tackles_assisted || 0,
      statsData.tackles_for_loss || 0,
      statsData.quarterback_hits || 0,
      statsData.passes_defended || 0,
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error upserting player stats:", error);
    throw new Error("Error upserting player stats");
  }
}

/**
 * Get player stats for a specific week
 */
export async function getPlayerStatsByWeek(
  playerId: number,
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<PlayerStats | null> {
  try {
    const query = `
      SELECT * FROM player_stats
      WHERE player_id = $1 AND week = $2 AND season = $3 AND season_type = $4
    `;

    const result = await pool.query(query, [playerId, week, season, seasonType]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error getting player stats:", error);
    throw new Error("Error getting player stats");
  }
}

/**
 * Get stats for multiple players for a specific week
 */
export async function getMultiplePlayersStatsByWeek(
  playerIds: number[],
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<PlayerStatsWithInfo[]> {
  try {
    if (playerIds.length === 0) {
      return [];
    }

    const query = `
      SELECT
        ps.*,
        p.full_name as player_name,
        p.position as player_position,
        p.team as player_team
      FROM player_stats ps
      LEFT JOIN players p ON ps.player_id = p.id
      WHERE ps.player_id = ANY($1)
        AND ps.week = $2
        AND ps.season = $3
        AND ps.season_type = $4
    `;

    const result = await pool.query(query, [playerIds, week, season, seasonType]);
    return result.rows;
  } catch (error) {
    console.error("Error getting multiple players stats:", error);
    throw new Error("Error getting multiple players stats");
  }
}

/**
 * Get all stats for a player for a season
 */
export async function getPlayerSeasonStats(
  playerId: number,
  season: string,
  seasonType: string = "regular"
): Promise<PlayerStats[]> {
  try {
    const query = `
      SELECT * FROM player_stats
      WHERE player_id = $1 AND season = $2 AND season_type = $3
      ORDER BY week ASC
    `;

    const result = await pool.query(query, [playerId, season, seasonType]);
    return result.rows;
  } catch (error) {
    console.error("Error getting player season stats:", error);
    throw new Error("Error getting player season stats");
  }
}
