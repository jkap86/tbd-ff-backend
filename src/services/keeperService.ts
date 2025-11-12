import pool from "../config/database";
import { isKeeperEligible } from "./dynastyService";

export interface KeeperSelection {
  id: number;
  roster_id: number;
  player_id: string;
  season: string;
  kept_from_season: string;
  draft_round_penalty: number | null;
  is_finalized: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateKeeperInput {
  roster_id: number;
  player_id: string;
  season: string;
  kept_from_season: string;
  draft_round_penalty?: number | null;
}

/**
 * Select a player as a keeper
 */
export async function selectKeeper(keeperData: CreateKeeperInput): Promise<KeeperSelection> {
  const { roster_id, player_id, season, kept_from_season, draft_round_penalty } = keeperData;

  // Check eligibility
  const eligibility = await isKeeperEligible(roster_id, player_id, season);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || "Player not eligible to be kept");
  }

  // Check max keepers rule (example: max 3 keepers per team)
  const keeperCount = await pool.query(
    `SELECT COUNT(*) as count FROM keeper_selections
     WHERE roster_id = $1 AND season = $2`,
    [roster_id, season]
  );

  const maxKeepers = 3; // TODO: Make this configurable per league
  if (parseInt(keeperCount.rows[0].count) >= maxKeepers) {
    throw new Error(`Maximum of ${maxKeepers} keepers allowed per roster`);
  }

  try {
    const query = `
      INSERT INTO keeper_selections (
        roster_id,
        player_id,
        season,
        kept_from_season,
        draft_round_penalty
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      roster_id,
      player_id,
      season,
      kept_from_season,
      draft_round_penalty || null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error("Player already selected as keeper for this season");
    }
    throw error;
  }
}

/**
 * Remove a keeper selection
 */
export async function removeKeeper(rosterId: number, playerId: string, season: string): Promise<boolean> {
  try {
    // Check if keeper is finalized
    const finalizedCheck = await pool.query(
      `SELECT is_finalized FROM keeper_selections
       WHERE roster_id = $1 AND player_id = $2 AND season = $3`,
      [rosterId, playerId, season]
    );

    if (finalizedCheck.rows.length > 0 && finalizedCheck.rows[0].is_finalized) {
      throw new Error("Cannot remove finalized keeper selections");
    }

    const result = await pool.query(
      `DELETE FROM keeper_selections
       WHERE roster_id = $1 AND player_id = $2 AND season = $3
       RETURNING id`,
      [rosterId, playerId, season]
    );

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error: any) {
    console.error("Error removing keeper:", error);
    throw error;
  }
}

/**
 * Get all keeper selections for a roster
 */
export async function getKeepersByRoster(rosterId: number, season: string): Promise<KeeperSelection[]> {
  try {
    const query = `
      SELECT k.*, p.full_name, p.position, p.team
      FROM keeper_selections k
      LEFT JOIN players p ON k.player_id = p.player_id
      WHERE k.roster_id = $1 AND k.season = $2
      ORDER BY k.created_at ASC
    `;

    const result = await pool.query(query, [rosterId, season]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting keepers by roster:", error);
    throw error;
  }
}

/**
 * Get all keeper selections for a league
 */
export async function getKeepersByLeague(leagueId: number, season: string): Promise<any[]> {
  try {
    const query = `
      SELECT k.*, p.full_name, p.position, p.team, r.settings as roster_settings, u.username
      FROM keeper_selections k
      LEFT JOIN players p ON k.player_id = p.player_id
      INNER JOIN rosters r ON k.roster_id = r.id
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.league_id = $1 AND k.season = $2
      ORDER BY r.roster_id ASC, k.created_at ASC
    `;

    const result = await pool.query(query, [leagueId, season]);
    return result.rows;
  } catch (error: any) {
    console.error("Error getting keepers by league:", error);
    throw error;
  }
}

/**
 * Validate keeper rules for a roster
 * Returns errors if any rules are violated
 */
export async function validateKeeperRules(
  rosterId: number,
  season: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Check keeper count
    const keeperCountQuery = await pool.query(
      `SELECT COUNT(*) as count FROM keeper_selections
       WHERE roster_id = $1 AND season = $2`,
      [rosterId, season]
    );

    const keeperCount = parseInt(keeperCountQuery.rows[0].count);
    const maxKeepers = 3; // TODO: Make configurable

    if (keeperCount > maxKeepers) {
      errors.push(`Too many keepers selected (${keeperCount}/${maxKeepers})`);
    }

    // Check draft round penalties don't exceed total rounds
    const penaltyQuery = await pool.query(
      `SELECT draft_round_penalty FROM keeper_selections
       WHERE roster_id = $1 AND season = $2 AND draft_round_penalty IS NOT NULL
       ORDER BY draft_round_penalty DESC`,
      [rosterId, season]
    );

    const maxRounds = 18; // TODO: Make configurable based on league settings
    for (const row of penaltyQuery.rows) {
      if (row.draft_round_penalty > maxRounds) {
        errors.push(`Keeper round penalty (${row.draft_round_penalty}) exceeds max rounds (${maxRounds})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error: any) {
    console.error("Error validating keeper rules:", error);
    return {
      valid: false,
      errors: [error.message || "Failed to validate keeper rules"]
    };
  }
}
