import pool from "../config/database";

export interface LeagueMedianConfig {
  league_id: number;
  enable_league_median: boolean;
  median_matchup_week_start?: number;
  median_matchup_week_end?: number;
}

/**
 * Get league median settings for a league
 */
export async function getLeagueMedianSettings(
  leagueId: number
): Promise<LeagueMedianConfig | null> {
  try {
    const query = `
      SELECT
        id as league_id,
        enable_league_median,
        median_matchup_week_start,
        median_matchup_week_end
      FROM leagues
      WHERE id = $1
    `;

    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      league_id: row.league_id,
      enable_league_median: row.enable_league_median || false,
      median_matchup_week_start: row.median_matchup_week_start,
      median_matchup_week_end: row.median_matchup_week_end,
    };
  } catch (error) {
    console.error("Error getting league median settings:", error);
    throw new Error("Error getting league median settings");
  }
}

/**
 * Enable/disable league median for a league
 */
export async function updateLeagueMedianSettings(
  leagueId: number,
  settings: Partial<Omit<LeagueMedianConfig, "league_id">>
): Promise<LeagueMedianConfig> {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (settings.enable_league_median !== undefined) {
      fields.push(`enable_league_median = $${paramCount}`);
      values.push(settings.enable_league_median);
      paramCount++;
    }

    if (settings.median_matchup_week_start !== undefined) {
      fields.push(`median_matchup_week_start = $${paramCount}`);
      values.push(settings.median_matchup_week_start);
      paramCount++;
    }

    if (settings.median_matchup_week_end !== undefined) {
      fields.push(`median_matchup_week_end = $${paramCount}`);
      values.push(settings.median_matchup_week_end);
      paramCount++;
    }

    if (fields.length === 0) {
      // No updates provided, just return current settings
      const currentSettings = await getLeagueMedianSettings(leagueId);
      if (!currentSettings) {
        throw new Error("League not found");
      }
      return currentSettings;
    }

    values.push(leagueId);

    const query = `
      UPDATE leagues
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING
        id as league_id,
        enable_league_median,
        median_matchup_week_start,
        median_matchup_week_end
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("League not found");
    }

    const row = result.rows[0];

    return {
      league_id: row.league_id,
      enable_league_median: row.enable_league_median || false,
      median_matchup_week_start: row.median_matchup_week_start,
      median_matchup_week_end: row.median_matchup_week_end,
    };
  } catch (error: any) {
    console.error("Error updating league median settings:", error);
    throw error;
  }
}
