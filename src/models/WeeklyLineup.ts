import pool from "../config/database";

export interface RosterSlot {
  slot: string;
  player_id: number | null;
}

export interface WeeklyLineup {
  id: number;
  roster_id: number;
  week: number;
  season: string;
  starters: RosterSlot[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Get or create weekly lineup for a roster
 * If no lineup exists, creates one using the roster's default starters
 */
export async function getOrCreateWeeklyLineup(
  rosterId: number,
  week: number,
  season: string
): Promise<WeeklyLineup> {
  try {
    // Try to get existing lineup
    const selectQuery = `
      SELECT * FROM weekly_lineups
      WHERE roster_id = $1 AND week = $2 AND season = $3
    `;
    const selectResult = await pool.query(selectQuery, [rosterId, week, season]);

    if (selectResult.rows.length > 0) {
      return selectResult.rows[0];
    }

    // No lineup exists, create one from roster's default starters
    const { getRosterById } = await import("./Roster");
    const roster = await getRosterById(rosterId);

    if (!roster) {
      throw new Error("Roster not found");
    }

    const starters = roster.starters || [];

    const insertQuery = `
      INSERT INTO weekly_lineups (roster_id, week, season, starters)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const insertResult = await pool.query(insertQuery, [
      rosterId,
      week,
      season,
      JSON.stringify(starters),
    ]);

    return insertResult.rows[0];
  } catch (error: any) {
    console.error("Error getting/creating weekly lineup:", error);
    console.error("Error details:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
}

/**
 * Update weekly lineup
 */
export async function updateWeeklyLineup(
  rosterId: number,
  week: number,
  season: string,
  starters: RosterSlot[]
): Promise<WeeklyLineup> {
  try {
    // Validate lineup
    const { validateLineup, getRosterById } = await import("./Roster");

    // Get roster to find league
    const roster = await getRosterById(rosterId);

    if (!roster) {
      throw new Error("Roster not found");
    }

    const validation = await validateLineup(roster.league_id, starters);
    if (!validation.valid) {
      throw new Error(`Invalid lineup: ${validation.errors.join(", ")}`);
    }

    // Upsert the lineup
    const query = `
      INSERT INTO weekly_lineups (roster_id, week, season, starters, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (roster_id, week, season)
      DO UPDATE SET
        starters = $4,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      rosterId,
      week,
      season,
      JSON.stringify(starters),
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error updating weekly lineup:", error);
    throw error;
  }
}

/**
 * Get weekly lineup with player details
 */
export async function getWeeklyLineupWithPlayers(
  rosterId: number,
  week: number,
  season: string
): Promise<any> {
  try {
    const lineup = await getOrCreateWeeklyLineup(rosterId, week, season);

    // Get current roster to validate players are still owned
    const { getRosterById, rosterHasPlayer } = await import("./Roster");
    const currentRoster = await getRosterById(rosterId);

    if (!currentRoster) {
      throw new Error("Roster not found");
    }

    // Validate and clean the lineup - remove players no longer on roster
    const validatedStarters = await Promise.all(
      lineup.starters.map(async (slot: RosterSlot) => {
        if (slot.player_id && !(await rosterHasPlayer(currentRoster.id, slot.player_id))) {
          console.log(`[WeeklyLineup] Player ${slot.player_id} no longer on roster ${rosterId}, clearing from ${slot.slot}`);
          return { slot: slot.slot, player_id: null };
        }
        return slot;
      })
    );

    // Get player details for each starter
    const starterPlayerIds = validatedStarters
      .map((slot: RosterSlot) => slot.player_id)
      .filter((id): id is number => id !== null);

    let players = [];
    if (starterPlayerIds.length > 0) {
      const playersQuery = `
        SELECT id, player_id, full_name, position, team, age, years_exp
        FROM players
        WHERE id = ANY($1)
      `;
      const playersResult = await pool.query(playersQuery, [starterPlayerIds]);
      players = playersResult.rows;
    }

    // Map player IDs to player objects
    const playerMap = players.reduce((acc: any, player: any) => {
      acc[player.id] = player;
      return acc;
    }, {});

    return {
      ...lineup,
      starters: validatedStarters.map((slot: RosterSlot) => ({
        slot: slot.slot,
        player: slot.player_id ? playerMap[slot.player_id] || null : null,
      })),
    };
  } catch (error) {
    console.error("Error getting weekly lineup with players:", error);
    throw new Error("Error getting weekly lineup with players");
  }
}

/**
 * Batch get or create weekly lineups for multiple rosters
 * Returns a map of roster_id -> WeeklyLineup
 */
export async function batchGetOrCreateWeeklyLineups(
  rosterIds: number[],
  week: number,
  season: string
): Promise<Map<number, WeeklyLineup>> {
  const resultMap = new Map<number, WeeklyLineup>();

  if (rosterIds.length === 0) {
    return resultMap;
  }

  try {
    // Fetch all existing lineups in a single query
    const selectQuery = `
      SELECT * FROM weekly_lineups
      WHERE roster_id = ANY($1) AND week = $2 AND season = $3
    `;
    const selectResult = await pool.query(selectQuery, [rosterIds, week, season]);

    // Map existing lineups by roster_id
    const existingLineups = new Map<number, WeeklyLineup>();
    for (const row of selectResult.rows) {
      existingLineups.set(row.roster_id, row);
      resultMap.set(row.roster_id, row);
    }

    // Find rosters that need new lineups created
    const missingRosterIds = rosterIds.filter(id => !existingLineups.has(id));

    if (missingRosterIds.length > 0) {
      // Fetch roster data for missing lineups in a single query
      const { getRostersByIds } = await import("./Roster");
      const rosters = await getRostersByIds(missingRosterIds);

      // Create a map of roster data
      const rosterMap = new Map(rosters.map(r => [r.id, r]));

      // Prepare batch insert values
      const valuesToInsert: any[] = [];
      missingRosterIds.forEach(rosterId => {
        const roster = rosterMap.get(rosterId);
        if (roster) {
          valuesToInsert.push({
            roster_id: rosterId,
            starters: roster.starters || []
          });
        }
      });

      if (valuesToInsert.length > 0) {
        // Build multi-row INSERT query
        const valueStrings: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        valuesToInsert.forEach(item => {
          valueStrings.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
          params.push(item.roster_id, week, season, JSON.stringify(item.starters));
          paramIndex += 4;
        });

        const insertQuery = `
          INSERT INTO weekly_lineups (roster_id, week, season, starters)
          VALUES ${valueStrings.join(', ')}
          RETURNING *
        `;

        const insertResult = await pool.query(insertQuery, params);

        // Add newly created lineups to result map
        for (const row of insertResult.rows) {
          resultMap.set(row.roster_id, row);
        }
      }
    }

    return resultMap;
  } catch (error: any) {
    console.error("Error batch getting/creating weekly lineups:", error);
    console.error("Error details:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
}

/**
 * Delete all weekly lineups for a league (used when resetting league)
 */
export async function deleteWeeklyLineupsForLeague(
  leagueId: number
): Promise<void> {
  try {
    const query = `
      DELETE FROM weekly_lineups
      WHERE roster_id IN (
        SELECT id FROM rosters WHERE league_id = $1
      )
    `;
    await pool.query(query, [leagueId]);
  } catch (error) {
    console.error("Error deleting weekly lineups:", error);
    throw new Error("Error deleting weekly lineups");
  }
}
