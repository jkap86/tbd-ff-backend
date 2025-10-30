import pool from "../config/database";
import { TiebreakerMethod } from "./Matchup";

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

/**
 * Get playoff settings for a league
 */
export async function getPlayoffSettings(
  leagueId: number
): Promise<PlayoffSettings | null> {
  try {
    const query = `SELECT * FROM playoff_settings WHERE league_id = $1`;
    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    // Parse JSONB tiebreaker_priority
    const row = result.rows[0];
    return {
      ...row,
      tiebreaker_priority: row.tiebreaker_priority || [
        "bench_points",
        "season_points_for",
        "higher_seed",
      ],
    };
  } catch (error) {
    console.error("Error getting playoff settings:", error);
    throw new Error("Error getting playoff settings");
  }
}

/**
 * Create or update playoff settings for a league
 */
export async function createOrUpdatePlayoffSettings(
  leagueId: number,
  settings: Partial<
    Omit<PlayoffSettings, "id" | "league_id" | "created_at" | "updated_at">
  >
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

    const result = await pool.query(query, values);
    const row = result.rows[0];

    return {
      ...row,
      tiebreaker_priority: row.tiebreaker_priority,
    };
  } catch (error) {
    console.error("Error creating or updating playoff settings:", error);
    throw new Error("Error creating or updating playoff settings");
  }
}

/**
 * Delete playoff settings for a league
 */
export async function deletePlayoffSettings(leagueId: number): Promise<void> {
  try {
    const query = `DELETE FROM playoff_settings WHERE league_id = $1`;
    await pool.query(query, [leagueId]);
  } catch (error) {
    console.error("Error deleting playoff settings:", error);
    throw new Error("Error deleting playoff settings");
  }
}
