/**
 * Bestball Service
 *
 * Handles automatic optimal lineup selection for bestball leagues.
 * In bestball format, the system automatically selects the highest-scoring
 * players for each position slot each week.
 */

import pool from "../config/database";

interface Player {
  id: number;
  player_id: string;
  position: string;
  fantasy_points?: number;
}

interface LineupSlot {
  slot: string;
  player_id: number | null;
}

interface RosterPosition {
  position: string;
  count: number;
}

/**
 * Check if a player is eligible for a specific position slot
 */
export function isPlayerEligibleForPosition(
  playerPosition: string,
  slotPosition: string
): boolean {
  // Exact match
  if (playerPosition === slotPosition) {
    return true;
  }

  // FLEX positions eligibility
  if (slotPosition === "FLEX") {
    return ["RB", "WR", "TE"].includes(playerPosition);
  }

  if (slotPosition === "SUPER_FLEX") {
    return ["QB", "RB", "WR", "TE"].includes(playerPosition);
  }

  if (slotPosition === "WRT") {
    return ["WR", "RB", "TE"].includes(playerPosition);
  }

  if (slotPosition === "REC_FLEX") {
    return ["WR", "TE"].includes(playerPosition);
  }

  if (slotPosition === "IDP_FLEX") {
    return ["DL", "LB", "DB"].includes(playerPosition);
  }

  return false;
}

/**
 * Get player stats for a specific week and season
 */
export async function getPlayerStats(
  playerId: string,
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<number> {
  try {
    const query = `
      SELECT fantasy_points_ppr as fantasy_points
      FROM player_stats
      WHERE player_id = $1
        AND week = $2
        AND season = $3
        AND season_type = $4
    `;

    const result = await pool.query(query, [playerId, week, season, seasonType]);

    if (result.rows.length === 0) {
      return 0; // No stats available
    }

    return result.rows[0].fantasy_points || 0;
  } catch (error) {
    console.error("Error getting player stats:", error);
    return 0;
  }
}

/**
 * Get roster players with their stats for a specific week
 */
export async function getRosterPlayersWithStats(
  rosterId: number,
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<Player[]> {
  try {
    const query = `
      SELECT
        p.id,
        p.player_id,
        p.position,
        COALESCE(ps.fantasy_points_ppr, 0) as fantasy_points
      FROM rosters r
      CROSS JOIN LATERAL jsonb_array_elements(r.players) AS player_ids
      JOIN players p ON p.player_id = player_ids::text
      LEFT JOIN player_stats ps ON ps.player_id = p.player_id
        AND ps.week = $2
        AND ps.season = $3
        AND ps.season_type = $4
      WHERE r.id = $1
      ORDER BY ps.fantasy_points_ppr DESC NULLS LAST
    `;

    const result = await pool.query(query, [rosterId, week, season, seasonType]);
    return result.rows;
  } catch (error) {
    console.error("Error getting roster players with stats:", error);
    return [];
  }
}

/**
 * Optimize lineup by selecting highest-scoring players for each position
 *
 * Algorithm:
 * 1. Get all players on roster with their scores for the week
 * 2. Fill exact position matches first (QB, RB1, RB2, etc.)
 * 3. Fill FLEX positions with remaining highest-scoring eligible players
 * 4. Return optimized lineup structure
 */
export async function optimizeLineup(
  rosterId: number,
  rosterPositions: RosterPosition[],
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<LineupSlot[]> {
  try {
    // Get all players with their stats
    const players = await getRosterPlayersWithStats(
      rosterId,
      week,
      season,
      seasonType
    );

    // Track which players have been assigned
    const assignedPlayerIds = new Set<number>();
    const lineup: LineupSlot[] = [];

    // Create position slots based on roster positions
    const positionSlots: { position: string; filled: boolean }[] = [];

    for (const rosterPos of rosterPositions) {
      // Skip bench positions (BN, TAXI, IR) - they don't count for scoring
      if (["BN", "TAXI", "IR"].includes(rosterPos.position)) {
        continue;
      }

      // Create individual slots for this position
      for (let i = 0; i < rosterPos.count; i++) {
        positionSlots.push({
          position: rosterPos.position,
          filled: false,
        });
      }
    }

    // Step 1: Fill exact position matches first (non-FLEX positions)
    const exactPositionSlots = positionSlots.filter(
      (slot) => !slot.position.includes("FLEX") && !slot.position.includes("WRT")
    );

    for (const slot of exactPositionSlots) {
      // Find highest-scoring unassigned player for this exact position
      const player = players.find(
        (p) => p.position === slot.position && !assignedPlayerIds.has(p.id)
      );

      if (player) {
        lineup.push({
          slot: slot.position,
          player_id: player.id,
        });
        assignedPlayerIds.add(player.id);
        slot.filled = true;
      } else {
        // No player available for this position
        lineup.push({
          slot: slot.position,
          player_id: null,
        });
        slot.filled = true;
      }
    }

    // Step 2: Fill FLEX positions with remaining highest-scoring eligible players
    const flexPositionSlots = positionSlots.filter(
      (slot) => !slot.filled
    );

    for (const slot of flexPositionSlots) {
      // Find highest-scoring unassigned player eligible for this FLEX slot
      const player = players.find(
        (p) =>
          !assignedPlayerIds.has(p.id) &&
          isPlayerEligibleForPosition(p.position, slot.position)
      );

      if (player) {
        lineup.push({
          slot: slot.position,
          player_id: player.id,
        });
        assignedPlayerIds.add(player.id);
        slot.filled = true;
      } else {
        // No eligible player available
        lineup.push({
          slot: slot.position,
          player_id: null,
        });
        slot.filled = true;
      }
    }

    return lineup;
  } catch (error) {
    console.error("Error optimizing lineup:", error);
    throw new Error("Failed to optimize lineup");
  }
}

/**
 * Calculate total fantasy points for an optimized lineup
 */
export async function calculateOptimizedScore(
  rosterId: number,
  rosterPositions: RosterPosition[],
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<number> {
  try {
    const optimizedLineup = await optimizeLineup(
      rosterId,
      rosterPositions,
      week,
      season,
      seasonType
    );

    let totalScore = 0;

    for (const slot of optimizedLineup) {
      if (slot.player_id) {
        // Get player to fetch player_id (string) for stats lookup
        const playerQuery = `SELECT player_id FROM players WHERE id = $1`;
        const playerResult = await pool.query(playerQuery, [slot.player_id]);

        if (playerResult.rows.length > 0) {
          const playerId = playerResult.rows[0].player_id;
          const score = await getPlayerStats(playerId, week, season, seasonType);
          totalScore += score;
        }
      }
    }

    return totalScore;
  } catch (error) {
    console.error("Error calculating optimized score:", error);
    return 0;
  }
}
