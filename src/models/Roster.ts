import pool from "../config/database";

export interface Roster {
  id: number;
  league_id: number;
  user_id: number;
  roster_id: number;
  settings: any;
  starters: any[];
  bench: any[];
  taxi: any[];
  ir: any[];
  created_at: Date;
  updated_at: Date;
}

export interface CreateRosterInput {
  league_id: number;
  user_id: number;
  roster_id: number;
  team_name?: string;
  settings?: any;
}

/**
 * Create a new roster
 */
export async function createRoster(
  rosterData: CreateRosterInput
): Promise<Roster> {
  const { league_id, user_id, roster_id, settings = {} } = rosterData;

  try {
    const query = `
      INSERT INTO rosters (
        league_id, 
        user_id, 
        roster_id, 
        settings,
        starters,
        bench,
        taxi,
        ir
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      league_id,
      user_id,
      roster_id,
      JSON.stringify(settings),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating roster:", error);

    // Handle unique constraint violations
    if (error.code === "23505") {
      if (error.constraint === "unique_league_user") {
        throw new Error("User already has a roster in this league");
      }
      if (error.constraint === "unique_league_roster") {
        throw new Error("Roster ID already exists in this league");
      }
    }

    throw new Error("Error creating roster");
  }
}

/**
 * Get all rosters in a league with user information
 */
export async function getRostersByLeagueId(leagueId: number): Promise<any[]> {
  try {
    const query = `
      SELECT 
        r.*,
        u.username,
        u.email
      FROM rosters r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.league_id = $1
      ORDER BY r.roster_id ASC
    `;

    const result = await pool.query(query, [leagueId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting rosters:", error);
    throw new Error("Error getting rosters");
  }
}

/**
 * Get roster with player details
 */
export async function getRosterWithPlayers(rosterId: number): Promise<any | null> {
  try {
    // Get the roster
    const rosterQuery = `
      SELECT r.*, u.username, u.email
      FROM rosters r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `;
    const rosterResult = await pool.query(rosterQuery, [rosterId]);

    if (rosterResult.rows.length === 0) {
      return null;
    }

    const roster = rosterResult.rows[0];

    // Get all player IDs from all arrays
    const allPlayerIds = [
      ...(roster.starters || []),
      ...(roster.bench || []),
      ...(roster.taxi || []),
      ...(roster.ir || []),
    ].filter((id: any) => id != null);

    // Get player details for all players
    let players = [];
    if (allPlayerIds.length > 0) {
      const playersQuery = `
        SELECT id, player_id, full_name, position, team, age, years_exp
        FROM players
        WHERE id = ANY($1)
      `;
      const playersResult = await pool.query(playersQuery, [allPlayerIds]);
      players = playersResult.rows;
    }

    // Map player IDs to player objects
    const playerMap = players.reduce((acc: any, player: any) => {
      acc[player.id] = player;
      return acc;
    }, {});

    return {
      ...roster,
      starters: (roster.starters || []).map((id: any) => playerMap[id] || null),
      bench: (roster.bench || []).map((id: any) => playerMap[id] || null),
      taxi: (roster.taxi || []).map((id: any) => playerMap[id] || null),
      ir: (roster.ir || []).map((id: any) => playerMap[id] || null),
    };
  } catch (error) {
    console.error("Error getting roster with players:", error);
    throw new Error("Error getting roster with players");
  }
}

/**
 * Get roster by ID
 */
export async function getRosterById(rosterId: number): Promise<Roster | null> {
  try {
    const query = `SELECT * FROM rosters WHERE id = $1`;
    const result = await pool.query(query, [rosterId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting roster:", error);
    throw new Error("Error getting roster");
  }
}

/**
 * Get roster by league and user
 */
export async function getRosterByLeagueAndUser(
  leagueId: number,
  userId: number
): Promise<Roster | null> {
  try {
    const query = `
      SELECT * FROM rosters
      WHERE league_id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [leagueId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting roster:", error);
    throw new Error("Error getting roster");
  }
}

/**
 * Get next available roster_id for a league
 */
export async function getNextRosterId(leagueId: number): Promise<number> {
  try {
    const query = `
      SELECT COALESCE(MAX(roster_id), 0) + 1 as next_roster_id
      FROM rosters
      WHERE league_id = $1
    `;

    const result = await pool.query(query, [leagueId]);
    return result.rows[0].next_roster_id;
  } catch (error) {
    console.error("Error getting next roster ID:", error);
    throw new Error("Error getting next roster ID");
  }
}

/**
 * Update roster
 */
export async function updateRoster(
  rosterId: number,
  updates: {
    settings?: any;
    starters?: any[];
    bench?: any[];
    taxi?: any[];
    ir?: any[];
  }
): Promise<Roster | null> {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.settings !== undefined) {
      fields.push(`settings = $${paramCount}`);
      values.push(JSON.stringify(updates.settings));
      paramCount++;
    }

    if (updates.starters !== undefined) {
      fields.push(`starters = $${paramCount}`);
      values.push(JSON.stringify(updates.starters));
      paramCount++;
    }

    if (updates.bench !== undefined) {
      fields.push(`bench = $${paramCount}`);
      values.push(JSON.stringify(updates.bench));
      paramCount++;
    }

    if (updates.taxi !== undefined) {
      fields.push(`taxi = $${paramCount}`);
      values.push(JSON.stringify(updates.taxi));
      paramCount++;
    }

    if (updates.ir !== undefined) {
      fields.push(`ir = $${paramCount}`);
      values.push(JSON.stringify(updates.ir));
      paramCount++;
    }

    if (fields.length === 0) {
      const query = "SELECT * FROM rosters WHERE id = $1";
      const result = await pool.query(query, [rosterId]);
      return result.rows[0] || null;
    }

    values.push(rosterId);

    const query = `
      UPDATE rosters
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
    console.error("Error updating roster:", error);
    throw new Error("Error updating roster");
  }
}

/**
 * Delete a roster by league ID and user ID
 */
export async function deleteRosterByLeagueAndUser(
  leagueId: number,
  userId: number
): Promise<boolean> {
  try {
    const query = `
      DELETE FROM rosters
      WHERE league_id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await pool.query(query, [leagueId, userId]);

    return result.rows.length > 0;
  } catch (error: any) {
    console.error("Error deleting roster:", error);
    throw new Error("Error deleting roster");
  }
}
