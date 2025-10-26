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

    // Get player details for each starter
    const starterPlayerIds = lineup.starters
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
      starters: lineup.starters.map((slot: RosterSlot) => ({
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
