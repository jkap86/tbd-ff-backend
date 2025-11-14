import pool from "../config/database";
import { logger } from "../config/logger";
import { TiebreakerMethod } from "./Matchup";
import { BaseRepository } from "./BaseRepository";

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

class PlayoffSettingsRepository extends BaseRepository<PlayoffSettings> {
  constructor() {
    super('playoff_settings', 'id');
  }
}

const playoffSettingsRepo = new PlayoffSettingsRepository();

/**
 * Get playoff settings for a league
 * BEFORE: 23 lines with manual query
 * AFTER: 10 lines using BaseRepository
 */
export async function getPlayoffSettings(
  leagueId: number
): Promise<PlayoffSettings | null> {
  const settings = await playoffSettingsRepo.findBy('league_id', leagueId);

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
    logger.error("Error creating or updating playoff settings:", { error });
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
    logger.error("Error deleting playoff settings:", { error });
    throw new Error("Error deleting playoff settings");
  }
}
