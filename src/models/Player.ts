import pool from "../config/database";

export interface Player {
  id: number;
  player_id: string; // Sleeper player_id
  full_name: string;
  position: string;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  search_rank: number | null; // ADP proxy from Sleeper - lower is better
  fantasy_data_id: string | null;
  created_at: Date;
  updated_at: Date;
  injury_status?: string;
  injury_designation?: string;
  injury_return_date?: Date;
  injury_updated_at?: Date;
}

/**
 * Get all players
 */
export async function getAllPlayers(
  filters?: {
    position?: string;
    team?: string;
    search?: string;
  }
): Promise<Player[]> {
  try {
    let query = `
      SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
      FROM players
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (filters?.position) {
      query += ` AND position = $${paramCount}`;
      params.push(filters.position);
      paramCount++;
    }

    if (filters?.team) {
      query += ` AND team = $${paramCount}`;
      params.push(filters.team);
      paramCount++;
    }

    if (filters?.search) {
      query += ` AND full_name ILIKE $${paramCount}`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    query += ` ORDER BY search_rank NULLS LAST, full_name`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("Error getting players:", error);
    throw new Error("Error getting players");
  }
}

/**
 * Get available players for a draft (not yet drafted)
 */
export async function getAvailablePlayersForDraft(
  draftId: number,
  filters?: {
    position?: string;
    team?: string;
    search?: string;
  }
): Promise<Player[]> {
  try {
    let query = `
      SELECT p.id, p.player_id, p.full_name, p.position, p.team, p.age, p.years_exp, p.search_rank, p.fantasy_data_id, p.created_at, p.updated_at
      FROM players p
      WHERE p.player_id NOT IN (
        SELECT player_id
        FROM draft_picks
        WHERE draft_id = $1 AND player_id IS NOT NULL
      )
    `;
    const params: any[] = [draftId];
    let paramCount = 2;

    if (filters?.position) {
      query += ` AND p.position = $${paramCount}`;
      params.push(filters.position);
      paramCount++;
    }

    if (filters?.team) {
      query += ` AND p.team = $${paramCount}`;
      params.push(filters.team);
      paramCount++;
    }

    if (filters?.search) {
      query += ` AND p.full_name ILIKE $${paramCount}`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    query += ` ORDER BY p.search_rank NULLS LAST, p.full_name`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("Error getting available players:", error);
    throw new Error("Error getting available players");
  }
}

/**
 * Get player by ID
 */
export async function getPlayerById(playerId: number): Promise<Player | null> {
  try {
    const query = `
      SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
      FROM players
      WHERE id = $1
    `;

    const result = await pool.query(query, [playerId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting player:", error);
    throw new Error("Error getting player");
  }
}

/**
 * Get player by Sleeper player_id
 */
export async function getPlayerBySleeperPlayerId(
  sleeperPlayerId: string
): Promise<Player | null> {
  try {
    const query = `
      SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
      FROM players
      WHERE player_id = $1
    `;

    const result = await pool.query(query, [sleeperPlayerId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting player by Sleeper ID:", error);
    throw new Error("Error getting player by Sleeper ID");
  }
}

/**
 * Upsert player from Sleeper API data
 */
export async function upsertPlayer(playerData: {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  search_rank: number | null;
  fantasy_data_id: string | null;
}): Promise<Player> {
  try {
    const query = `
      INSERT INTO players (player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (player_id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        position = EXCLUDED.position,
        team = EXCLUDED.team,
        age = EXCLUDED.age,
        years_exp = EXCLUDED.years_exp,
        search_rank = EXCLUDED.search_rank,
        fantasy_data_id = EXCLUDED.fantasy_data_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
    `;

    const result = await pool.query(query, [
      playerData.player_id,
      playerData.full_name,
      playerData.position,
      playerData.team,
      playerData.age,
      playerData.years_exp,
      playerData.search_rank,
      playerData.fantasy_data_id,
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error upserting player:", error);
    throw new Error("Error upserting player");
  }
}

/**
 * Get multiple players by their IDs
 */
export async function getPlayersByIds(playerIds: number[]): Promise<Player[]> {
  if (playerIds.length === 0) {
    return [];
  }

  try {
    const query = `
      SELECT id, player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, created_at, updated_at
      FROM players
      WHERE id = ANY($1)
      ORDER BY search_rank NULLS LAST, full_name
    `;

    const result = await pool.query(query, [playerIds]);
    return result.rows;
  } catch (error) {
    console.error("Error getting players by IDs:", error);
    throw new Error("Error getting players by IDs");
  }
}

/**
 * Bulk upsert players from Sleeper API
 */
export async function bulkUpsertPlayers(
  players: Array<{
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
    age: number | null;
    years_exp: number | null;
    search_rank: number | null;
    fantasy_data_id: string | null;
  }>
): Promise<number> {
  if (players.length === 0) {
    return 0;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let totalUpserted = 0;

    // Process in batches to avoid PostgreSQL parameter limit (~65535)
    // Each player has 8 fields, so we can safely batch 500 players (4000 params)
    const BATCH_SIZE = 500;

    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);

      // Build multi-row INSERT query
      const valueStrings: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const playerData of batch) {
        valueStrings.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, CURRENT_TIMESTAMP)`
        );
        params.push(
          playerData.player_id,
          playerData.full_name,
          playerData.position,
          playerData.team,
          playerData.age,
          playerData.years_exp,
          playerData.search_rank,
          playerData.fantasy_data_id
        );
        paramIndex += 8;
      }

      const query = `
        INSERT INTO players (player_id, full_name, position, team, age, years_exp, search_rank, fantasy_data_id, updated_at)
        VALUES ${valueStrings.join(', ')}
        ON CONFLICT (player_id)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          position = EXCLUDED.position,
          team = EXCLUDED.team,
          age = EXCLUDED.age,
          years_exp = EXCLUDED.years_exp,
          search_rank = EXCLUDED.search_rank,
          fantasy_data_id = EXCLUDED.fantasy_data_id,
          updated_at = CURRENT_TIMESTAMP
      `;

      await client.query(query, params);
      totalUpserted += batch.length;
    }

    await client.query("COMMIT");
    return totalUpserted;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error bulk upserting players:", error);
    throw new Error("Error bulk upserting players");
  } finally {
    client.release();
  }
}

/**
 * Update player injury status
 */
export async function updatePlayerInjuryStatus(
  playerId: string,
  injuryData: {
    injury_status?: string;
    injury_designation?: string;
    injury_return_date?: Date | null;
  }
): Promise<void> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (injuryData.injury_status !== undefined) {
    updates.push(`injury_status = $${paramCount++}`);
    values.push(injuryData.injury_status);
  }

  if (injuryData.injury_designation !== undefined) {
    updates.push(`injury_designation = $${paramCount++}`);
    values.push(injuryData.injury_designation);
  }

  if (injuryData.injury_return_date !== undefined) {
    updates.push(`injury_return_date = $${paramCount++}`);
    values.push(injuryData.injury_return_date);
  }

  if (updates.length > 0) {
    updates.push(`injury_updated_at = CURRENT_TIMESTAMP`);
    values.push(playerId);

    const query = `
      UPDATE players
      SET ${updates.join(', ')}
      WHERE player_id = $${paramCount}
    `;

    await pool.query(query, values);
  }
}

/**
 * Get all injured players
 */
export async function getInjuredPlayers(): Promise<Player[]> {
  const result = await pool.query(
    `SELECT * FROM players
     WHERE injury_status IS NOT NULL
     AND injury_status != 'Healthy'
     ORDER BY injury_updated_at DESC`
  );
  return result.rows;
}
