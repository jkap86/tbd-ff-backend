import pool from "../config/database";
import { logger } from "../config/logger";
import { BaseRepository } from "./BaseRepository";

export interface WaiverSettings {
  id: number;
  league_id: number;
  waiver_type: "faab" | "rolling" | "none";
  faab_budget: number;
  waiver_period_days: number;
  process_schedule: "daily" | "twice_weekly" | "weekly" | "manual";
  process_time: string;
  created_at: Date;
  updated_at: Date;
}

class WaiverSettingsRepository extends BaseRepository<WaiverSettings> {
  constructor() {
    super('waiver_settings', 'id');
  }
}

const waiverSettingsRepo = new WaiverSettingsRepository();

/**
 * Get waiver settings for a league
 * Creates default settings if they don't exist
 * BEFORE: 29 lines with manual query
 * AFTER: 8 lines using BaseRepository
 */
export async function getWaiverSettingsByLeague(
  leagueId: number
): Promise<WaiverSettings | null> {
  // Try to get existing settings
  const settings = await waiverSettingsRepo.findBy('league_id', leagueId);

  if (settings.length > 0) {
    return settings[0];
  }

  // Create default settings if none exist
  return createDefaultWaiverSettings(leagueId);
}

/**
 * Update waiver settings for a league
 */
export async function updateWaiverSettings(
  leagueId: number,
  updates: {
    waiver_type?: "faab" | "rolling" | "none";
    faab_budget?: number;
    waiver_period_days?: number;
    process_schedule?: "daily" | "twice_weekly" | "weekly" | "manual";
    process_time?: string;
  }
): Promise<WaiverSettings | null> {
  try {
    // Ensure settings exist first
    await getWaiverSettingsByLeague(leagueId);

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic UPDATE query
    if (updates.waiver_type !== undefined) {
      fields.push(`waiver_type = $${paramCount++}`);
      values.push(updates.waiver_type);
    }

    if (updates.faab_budget !== undefined) {
      fields.push(`faab_budget = $${paramCount++}`);
      values.push(updates.faab_budget);
    }

    if (updates.waiver_period_days !== undefined) {
      fields.push(`waiver_period_days = $${paramCount++}`);
      values.push(updates.waiver_period_days);
    }

    if (updates.process_schedule !== undefined) {
      fields.push(`process_schedule = $${paramCount++}`);
      values.push(updates.process_schedule);
    }

    if (updates.process_time !== undefined) {
      fields.push(`process_time = $${paramCount++}`);
      values.push(updates.process_time);
    }

    if (fields.length === 0) {
      // No updates, return current settings
      return getWaiverSettingsByLeague(leagueId);
    }

    // Add updated_at
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add league_id for WHERE clause
    values.push(leagueId);

    const query = `
      UPDATE waiver_settings
      SET ${fields.join(", ")}
      WHERE league_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error("Error updating waiver settings:", { error });
    throw error;
  }
}

/**
 * Create default waiver settings for a new league
 */
export async function createDefaultWaiverSettings(
  leagueId: number
): Promise<WaiverSettings> {
  try {
    const result = await pool.query(
      `INSERT INTO waiver_settings
        (league_id, waiver_type, faab_budget, waiver_period_days, process_schedule, process_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (league_id) DO NOTHING
       RETURNING *`,
      [leagueId, "faab", 100, 2, "daily", "03:00:00"]
    );

    // If conflict (already exists), fetch the existing settings
    if (result.rows.length === 0) {
      const existing = await getWaiverSettingsByLeague(leagueId);
      if (!existing) {
        throw new Error("Failed to create or retrieve waiver settings");
      }
      return existing;
    }

    return result.rows[0];
  } catch (error) {
    logger.error("Error creating default waiver settings:", { error });
    throw error;
  }
}
