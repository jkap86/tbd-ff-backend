import pool from "../config/database";

export interface League {
  id: number;
  name: string;
  status: string;
  settings: any;
  scoring_settings: any;
  season: string;
  season_type: string;
  roster_positions: any;
  total_rosters: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateLeagueInput {
  name: string;
  commissioner_id: number;
  season: string;
  status?: string;
  season_type?: string;
  total_rosters?: number;
  settings?: any;
  scoring_settings?: any;
  roster_positions?: any;
}

/**
 * Create a new league
 */
export async function createLeague(
  leagueData: CreateLeagueInput
): Promise<League> {
  const {
    name,
    commissioner_id,
    season,
    status = "pre_draft",
    season_type = "regular",
    total_rosters = 12,
    settings = {},
    scoring_settings = {},
    roster_positions = [],
  } = leagueData;

  try {
    // Generate unique invite code
    const inviteCode = generateInviteCode();

    // Add commissioner_id to settings
    const settingsWithCommissioner = {
      ...settings,
      commissioner_id,
    };

    const query = `
      INSERT INTO leagues (
        name,
        status,
        season, 
        season_type, 
        total_rosters, 
        settings, 
        scoring_settings, 
        roster_positions,
        invite_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      name,
      status,
      season,
      season_type,
      total_rosters,
      JSON.stringify(settingsWithCommissioner),
      JSON.stringify(scoring_settings),
      JSON.stringify(roster_positions),
      inviteCode,
    ];

    const result = await pool.query(query, values);
    const league = result.rows[0];

    // Create roster for commissioner
    try {
      const rosterQuery = `
        INSERT INTO rosters (league_id, user_id, roster_id)
        VALUES ($1, $2, $3)
      `;
      await pool.query(rosterQuery, [league.id, commissioner_id, 1]);
    } catch (rosterError: any) {
      console.error("Error creating commissioner roster:", rosterError);
    }

    return league;
  } catch (error: any) {
    console.error("Error creating league:", error);
    throw new Error("Error creating league");
  }
}

/**
 * Get league by ID
 */
export async function getLeagueById(leagueId: number): Promise<League | null> {
  try {
    const query = `
      SELECT * FROM leagues WHERE id = $1
    `;

    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting league:", error);
    throw new Error("Error getting league");
  }
}

/**
 * Get all leagues for a user
 */
export async function getLeaguesForUser(userId: number): Promise<League[]> {
  try {
    const query = `
      SELECT l.* 
      FROM leagues l
      INNER JOIN rosters r ON l.id = r.league_id
      WHERE r.user_id = $1
      ORDER BY l.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting user leagues:", error);
    throw new Error("Error getting user leagues");
  }
}

/**
 * Update league
 */
export async function updateLeague(
  leagueId: number,
  updates: Partial<CreateLeagueInput>
): Promise<League | null> {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount}`);
      values.push(updates.name);
      paramCount++;
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount}`);
      values.push(updates.status);
      paramCount++;
    }

    if (updates.settings !== undefined) {
      fields.push(`settings = $${paramCount}`);
      values.push(JSON.stringify(updates.settings));
      paramCount++;
    }

    if (updates.scoring_settings !== undefined) {
      fields.push(`scoring_settings = $${paramCount}`);
      values.push(JSON.stringify(updates.scoring_settings));
      paramCount++;
    }

    if (updates.roster_positions !== undefined) {
      fields.push(`roster_positions = $${paramCount}`);
      values.push(JSON.stringify(updates.roster_positions));
      paramCount++;
    }

    if (fields.length === 0) {
      return getLeagueById(leagueId);
    }

    values.push(leagueId);

    const query = `
      UPDATE leagues
      SET ${fields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating league:", error);
    throw new Error("Error updating league");
  }
}

/**
 * Generate unique invite code
 */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Avoid confusing chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get public leagues
 */
export async function getPublicLeagues(limit: number = 20): Promise<any[]> {
  try {
    const query = `
      SELECT l.*, 
        (SELECT COUNT(*) FROM rosters WHERE league_id = l.id) as current_rosters
      FROM leagues l
      WHERE l.settings->>'is_public' = 'true'
      AND l.status = 'pre_draft'
      ORDER BY l.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  } catch (error) {
    console.error("Error getting public leagues:", error);
    throw new Error("Error getting public leagues");
  }
}

/**
 * Get league by invite code
 */
export async function getLeagueByInviteCode(
  inviteCode: string
): Promise<League | null> {
  try {
    const query = "SELECT * FROM leagues WHERE invite_code = $1";
    const result = await pool.query(query, [inviteCode]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting league by invite code:", error);
    throw new Error("Error getting league by invite code");
  }
}

/**
 * Get commissioner ID from league settings
 */
export function getCommissionerIdFromLeague(league: League): number | null {
  try {
    if (league.settings && typeof league.settings === "object") {
      return league.settings.commissioner_id || null;
    }
    return null;
  } catch (error) {
    console.error("Error getting commissioner ID:", error);
    return null;
  }
}

/**
 * Update league (only name, settings, and scoring_settings)
 */
export async function updateLeagueSettings(
  leagueId: number,
  commissionerId: number,
  updates: {
    name?: string;
    settings?: any;
    scoring_settings?: any;
  }
): Promise<League | null> {
  try {
    // First, get the league to verify commissioner
    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("League not found");
    }

    // Check if user is commissioner
    const leagueCommissionerId = getCommissionerIdFromLeague(league);
    if (leagueCommissionerId !== commissionerId) {
      throw new Error("Only the commissioner can update league settings");
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount}`);
      values.push(updates.name);
      paramCount++;
    }

    if (updates.settings !== undefined) {
      fields.push(`settings = $${paramCount}`);
      // Preserve commissioner_id in settings
      const settingsWithCommissioner = {
        ...updates.settings,
        commissioner_id: leagueCommissionerId,
      };
      values.push(JSON.stringify(settingsWithCommissioner));
      paramCount++;
    }

    if (updates.scoring_settings !== undefined) {
      fields.push(`scoring_settings = $${paramCount}`);
      values.push(JSON.stringify(updates.scoring_settings));
      paramCount++;
    }

    if (fields.length === 0) {
      return league;
    }

    values.push(leagueId);

    const query = `
      UPDATE leagues
      SET ${fields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error: any) {
    console.error("Error updating league settings:", error);
    throw error;
  }
}
