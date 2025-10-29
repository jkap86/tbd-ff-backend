import pool from "../config/database";

export interface League {
  id: number;
  name: string;
  status: string;
  settings: any;
  scoring_settings: any;
  season: string;
  season_type: string; // pre, regular, post
  league_type: string; // redraft, keeper, dynasty
  roster_positions: any;
  total_rosters: number;
  trade_notification_setting: 'always_off' | 'always_on' | 'proposer_choice';
  trade_details_setting: 'always_off' | 'always_on' | 'proposer_choice';
  created_at: Date;
  updated_at: Date;
}

export interface LeagueSettings {
  is_public?: boolean;
  start_week?: number;
  end_week?: number;
  playoff_week_start?: number;
  league_median?: boolean;
  commissioner_id?: number;
  [key: string]: any;
}

export interface ScoringSettings {
  [key: string]: number;
}

export interface RosterPosition {
  position: string;
  count: number;
}

export interface CreateLeagueInput {
  name: string;
  commissioner_id: number;
  season: string;
  status?: string;
  season_type?: string; // pre, regular, post
  league_type?: string; // redraft, keeper, dynasty
  total_rosters?: number;
  settings?: LeagueSettings;
  scoring_settings?: ScoringSettings;
  roster_positions?: RosterPosition[];
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
    league_type = "redraft",
    total_rosters = 12,
    settings = {},
    scoring_settings = {},
    roster_positions = [],
  } = leagueData;

  try {
    // Generate unique invite code
    const inviteCode = generateInviteCode();

    // Merge settings with commissioner_id and other data
    const mergedSettings: LeagueSettings = {
      ...settings,
      commissioner_id,
      is_public: settings.is_public !== undefined ? settings.is_public : false,
      start_week: settings.start_week || 1,
      end_week: settings.end_week || 17,
      playoff_week_start: settings.playoff_week_start || 15,
      league_median:
        settings.league_median !== undefined ? settings.league_median : false,
    };

    const query = `
      INSERT INTO leagues (
        name,
        status,
        season,
        season_type,
        league_type,
        total_rosters,
        settings,
        scoring_settings,
        roster_positions,
        invite_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      name,
      status,
      season,
      season_type,
      league_type,
      total_rosters,
      JSON.stringify(mergedSettings),
      JSON.stringify(scoring_settings || {}),
      JSON.stringify(roster_positions || []),
      inviteCode,
    ];

    const result = await pool.query(query, values);
    const league = result.rows[0];

    // Create roster for commissioner using createRoster to get proper slot structure
    try {
      const { createRoster } = await import("./Roster");
      await createRoster({
        league_id: league.id,
        user_id: commissioner_id,
        roster_id: 1,
      });
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
 * Update league settings (name, total_rosters, settings, scoring_settings, roster_positions)
 * Handles all the new settings data from the frontend
 */
export async function updateLeagueSettings(
  leagueId: number,
  commissionerId: number,
  updates: {
    name?: string;
    league_type?: string;
    total_rosters?: number;
    settings?: LeagueSettings;
    scoring_settings?: ScoringSettings;
    roster_positions?: RosterPosition[];
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

    if (updates.league_type !== undefined) {
      fields.push(`league_type = $${paramCount}`);
      values.push(updates.league_type);
      paramCount++;
    }

    if (updates.total_rosters !== undefined) {
      fields.push(`total_rosters = $${paramCount}`);
      values.push(updates.total_rosters);
      paramCount++;
    }

    if (updates.settings !== undefined) {
      fields.push(`settings = $${paramCount}`);
      // Always preserve commissioner_id in settings
      const settingsWithCommissioner: LeagueSettings = {
        ...updates.settings,
        commissioner_id: leagueCommissionerId,
      };
      values.push(JSON.stringify(settingsWithCommissioner));
      paramCount++;
    }

    if (updates.scoring_settings !== undefined) {
      fields.push(`scoring_settings = $${paramCount}`);
      values.push(JSON.stringify(updates.scoring_settings || {}));
      paramCount++;
    }

    if (updates.roster_positions !== undefined) {
      fields.push(`roster_positions = $${paramCount}`);
      values.push(JSON.stringify(updates.roster_positions || []));
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

/**
 * Transfer commissioner role to another user
 */
export async function transferCommissioner(
  leagueId: number,
  currentCommissionerId: number,
  newCommissionerId: number
): Promise<League | null> {
  try {
    // Get the league
    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("League not found");
    }

    // Verify current user is the commissioner
    const leagueCommissionerId = getCommissionerIdFromLeague(league);
    if (leagueCommissionerId !== currentCommissionerId) {
      throw new Error("Only the commissioner can transfer their role");
    }

    // Verify new commissioner has a roster in the league
    const query = `
      SELECT * FROM rosters 
      WHERE league_id = $1 AND user_id = $2
    `;
    const result = await pool.query(query, [leagueId, newCommissionerId]);

    if (result.rows.length === 0) {
      throw new Error("New commissioner must be a member of the league");
    }

    // Update settings with new commissioner_id
    const updatedSettings: LeagueSettings = {
      ...league.settings,
      commissioner_id: newCommissionerId,
    };

    const updateQuery = `
      UPDATE leagues
      SET settings = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, [
      JSON.stringify(updatedSettings),
      leagueId,
    ]);

    return updateResult.rows[0];
  } catch (error: any) {
    console.error("Error transferring commissioner:", error);
    throw error;
  }
}

/**
 * Validate if a user is commissioner and return commissioner ID
 */
export async function validateCommissionerPermission(
  leagueId: number,
  userId: number
): Promise<number> {
  try {
    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("League not found");
    }

    const commissionerId = getCommissionerIdFromLeague(league);
    if (commissionerId !== userId) {
      throw new Error("Only the commissioner can perform this action");
    }

    return commissionerId;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Validate league settings data
 */
export function validateLeagueSettings(settings: LeagueSettings): boolean {
  try {
    // Validate start_week and end_week if provided
    if (settings.start_week !== undefined) {
      if (
        typeof settings.start_week !== "number" ||
        settings.start_week < 1 ||
        settings.start_week > 17
      ) {
        throw new Error("Start week must be between 1 and 17");
      }
    }

    if (settings.end_week !== undefined) {
      if (
        typeof settings.end_week !== "number" ||
        settings.end_week < 1 ||
        settings.end_week > 17
      ) {
        throw new Error("End week must be between 1 and 17");
      }
    }

    if (settings.playoff_week_start !== undefined) {
      if (
        typeof settings.playoff_week_start !== "number" ||
        settings.playoff_week_start < 1 ||
        settings.playoff_week_start > 18
      ) {
        throw new Error("Playoff week start must be between 1 and 18");
      }
      // Validate that playoff week is after start week
      if (settings.start_week && settings.playoff_week_start <= settings.start_week) {
        throw new Error("Playoff week start must be after season start week");
      }
    }

    // Validate season_type if provided
    if (settings.season_type !== undefined) {
      const validSeasonTypes = ["pre", "regular", "post"];
      if (!validSeasonTypes.includes(settings.season_type)) {
        throw new Error("Invalid season type");
      }
    }

    // Validate is_public if provided
    if (settings.is_public !== undefined) {
      if (typeof settings.is_public !== "boolean") {
        throw new Error("is_public must be a boolean");
      }
    }

    // Validate league_median if provided
    if (settings.league_median !== undefined) {
      if (typeof settings.league_median !== "boolean") {
        throw new Error("league_median must be a boolean");
      }
    }

    return true;
  } catch (error: any) {
    console.error("Validation error:", error.message);
    throw error;
  }
}

/**
 * Validate scoring settings
 */
export function validateScoringSettings(
  scoringSettings: ScoringSettings
): boolean {
  try {
    if (!scoringSettings || typeof scoringSettings !== "object") {
      return true; // Allow empty scoring settings
    }

    // Validate that all values are numbers
    for (const [key, value] of Object.entries(scoringSettings)) {
      if (typeof value !== "number") {
        throw new Error(`Scoring setting '${key}' must be a number`);
      }
    }

    return true;
  } catch (error: any) {
    console.error("Scoring settings validation error:", error.message);
    throw error;
  }
}

/**
 * Validate roster positions
 */
export function validateRosterPositions(
  rosterPositions: RosterPosition[]
): boolean {
  try {
    if (!Array.isArray(rosterPositions)) {
      throw new Error("Roster positions must be an array");
    }

    // Allow empty array
    if (rosterPositions.length === 0) {
      return true;
    }

    // Validate each position
    for (const pos of rosterPositions) {
      if (!pos.position || typeof pos.position !== "string") {
        throw new Error("Each roster position must have a 'position' string");
      }

      if (typeof pos.count !== "number" || pos.count < 1) {
        throw new Error("Each roster position must have a 'count' >= 1");
      }
    }

    return true;
  } catch (error: any) {
    console.error("Roster positions validation error:", error.message);
    throw error;
  }
}
