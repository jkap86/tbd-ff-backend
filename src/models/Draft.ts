import pool from "../config/database";

export interface Draft {
  id: number;
  league_id: number;
  draft_type: "snake" | "linear" | "auction" | "slow_auction";
  third_round_reversal: boolean;
  status: "not_started" | "in_progress" | "paused" | "completed";
  current_pick: number;
  current_round: number;
  current_roster_id: number | null;
  pick_time_seconds: number;
  pick_deadline: Date | null;
  rounds: number;
  timer_mode: "traditional" | "chess";
  team_time_budget_seconds: number | null;
  // Auction-specific fields
  starting_budget: number;
  min_bid: number;
  bid_increment: number;
  nominations_per_manager: number;
  nomination_timer_hours: number | null;
  reserve_budget_per_slot: boolean;
  started_at: Date | null;
  completed_at: Date | null;
  settings: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a new draft
 */
export async function createDraft(draftData: {
  league_id: number;
  draft_type: "snake" | "linear" | "auction" | "slow_auction";
  third_round_reversal?: boolean;
  pick_time_seconds?: number;
  rounds?: number;
  timer_mode?: "traditional" | "chess";
  team_time_budget_seconds?: number;
  // Auction-specific settings
  starting_budget?: number;
  min_bid?: number;
  bid_increment?: number;
  nominations_per_manager?: number;
  nomination_timer_hours?: number;
  reserve_budget_per_slot?: boolean;
  settings?: any;
}): Promise<Draft> {
  try {
    // Validate chess timer mode requirements
    const timerMode = draftData.timer_mode || "traditional";
    const timeBudget = draftData.team_time_budget_seconds;

    if (timerMode === "chess" && (!timeBudget || timeBudget <= 0)) {
      throw new Error("Chess timer mode requires a positive team_time_budget_seconds value");
    }

    console.log(`[Draft] Creating draft with timer_mode: ${timerMode}, budget: ${timeBudget || 'N/A'}, type: ${draftData.draft_type}`);

    const query = `
      INSERT INTO drafts (
        league_id, draft_type, third_round_reversal, pick_time_seconds,
        rounds, timer_mode, team_time_budget_seconds,
        starting_budget, min_bid, bid_increment, nominations_per_manager,
        nomination_timer_hours, reserve_budget_per_slot, settings
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await pool.query(query, [
      draftData.league_id,
      draftData.draft_type,
      draftData.third_round_reversal || false,
      draftData.pick_time_seconds || 90,
      draftData.rounds || 15,
      timerMode,
      timeBudget || null,
      draftData.starting_budget || 200,
      draftData.min_bid || 1,
      draftData.bid_increment || 1,
      draftData.nominations_per_manager || 3,
      draftData.nomination_timer_hours || null,
      draftData.reserve_budget_per_slot || false,
      JSON.stringify(draftData.settings || {}),
    ]);

    return result.rows[0];
  } catch (error: any) {
    console.error("Error creating draft:", error);

    // Check for unique constraint violation
    if (error.code === "23505") {
      throw new Error("Draft already exists for this league");
    }

    // Check for check constraint violation (chess mode without budget)
    if (error.code === "23514") {
      throw new Error("Chess timer mode requires a valid team time budget");
    }

    throw error;
  }
}

/**
 * Get draft by ID
 */
export async function getDraftById(draftId: number): Promise<Draft | null> {
  try {
    const query = `SELECT * FROM drafts WHERE id = $1`;
    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting draft:", error);
    throw new Error("Error getting draft");
  }
}

/**
 * Get draft by league ID
 */
export async function getDraftByLeagueId(
  leagueId: number
): Promise<Draft | null> {
  try {
    const query = `SELECT * FROM drafts WHERE league_id = $1`;
    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting draft by league:", error);
    throw new Error("Error getting draft by league");
  }
}

/**
 * Update draft
 */
export async function updateDraft(
  draftId: number,
  updates: Partial<Draft>
): Promise<Draft> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== "id" && key !== "created_at") {
        fields.push(`${key} = $${paramCount}`);
        values.push(
          key === "settings" && typeof value === "object"
            ? JSON.stringify(value)
            : value
        );
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(draftId);

    const query = `
      UPDATE drafts
      SET ${fields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating draft:", error);
    throw new Error("Error updating draft");
  }
}

/**
 * Start draft
 */
export async function startDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'in_progress',
          started_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error starting draft:", error);
    throw new Error("Error starting draft");
  }
}

/**
 * Pause draft
 */
export async function pauseDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'paused',
          pick_deadline = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error pausing draft:", error);
    throw new Error("Error pausing draft");
  }
}

/**
 * Resume draft
 */
export async function resumeDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'in_progress',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error resuming draft:", error);
    throw new Error("Error resuming draft");
  }
}

/**
 * Complete draft
 */
export async function completeDraft(draftId: number): Promise<Draft> {
  try {
    const query = `
      UPDATE drafts
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          pick_deadline = NULL,
          current_roster_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error completing draft:", error);
    throw new Error("Error completing draft");
  }
}

/**
 * Auto-populate starters from drafted players
 * Fills starter slots with drafted players, prioritizing early picks
 */
async function autoPopulateStarters(
  rosterId: number,
  playerIds: string[],
  leagueId: number
): Promise<{ starters: any[]; bench: string[] }> {
  try {
    // Get league roster positions
    const { getLeagueById } = await import("./League");
    const league = await getLeagueById(leagueId);

    if (!league || !league.roster_positions) {
      console.log(`[AutoPopulate] No roster positions found, all players to bench`);
      return { starters: [], bench: playerIds };
    }

    const rosterPositions = league.roster_positions;

    // Get player details (position info)
    const playersQuery = `
      SELECT id, position
      FROM players
      WHERE id = ANY($1)
    `;
    const playersResult = await pool.query(playersQuery, [playerIds]);
    const playersMap = playersResult.rows.reduce((acc: any, p: any) => {
      acc[p.id] = p.position;
      return acc;
    }, {});

    // Initialize starters array with slot structure (exclude BN slots - those are bench)
    const starters: any[] = rosterPositions
      .filter((pos: any) => !pos.position.startsWith('BN'))
      .map((pos: any) => ({
        slot: pos.position,
        player_id: null,
      }));

    const assignedPlayerIds = new Set<string>();

    // Fill starter slots (in order of draft position, which is playerIds order)
    // PRIORITIZE: Exact position matches first, then FLEX positions
    for (const playerId of playerIds) {
      const playerPosition = playersMap[playerId];
      if (!playerPosition) continue;

      // Helper function to check if player can fill a FLEX slot
      const canFillFlexSlot = (slotPos: string): boolean => {
        // Check FLEX positions
        if (slotPos === "FLEX" && ["RB", "WR", "TE"].includes(playerPosition))
          return true;
        if (
          slotPos === "SUPER_FLEX" &&
          ["QB", "RB", "WR", "TE"].includes(playerPosition)
        )
          return true;
        if (slotPos === "WRT" && ["WR", "RB", "TE"].includes(playerPosition))
          return true;
        if (slotPos === "REC_FLEX" && ["WR", "TE"].includes(playerPosition))
          return true;
        if (
          slotPos === "IDP_FLEX" &&
          ["DL", "LB", "DB"].includes(playerPosition)
        )
          return true;

        return false;
      };

      // First, try to find an EXACT position match
      let slotIndex = starters.findIndex((slot) => {
        if (slot.player_id !== null) return false;
        const slotPos = slot.slot.replace(/\d+$/, "");
        return playerPosition === slotPos; // Exact match only
      });

      // If no exact match, then try FLEX positions
      if (slotIndex === -1) {
        slotIndex = starters.findIndex((slot) => {
          if (slot.player_id !== null) return false;
          const slotPos = slot.slot.replace(/\d+$/, "");
          return canFillFlexSlot(slotPos); // FLEX match
        });
      }

      if (slotIndex !== -1) {
        starters[slotIndex].player_id = playerId;
        assignedPlayerIds.add(playerId);
        console.log(
          `[AutoPopulate] Assigned player ${playerId} (${playerPosition}) to slot ${starters[slotIndex].slot}`
        );
      }
    }

    // Remaining players go to bench
    const bench = playerIds.filter((id) => !assignedPlayerIds.has(id));

    console.log(
      `[AutoPopulate] Roster ${rosterId}: ${assignedPlayerIds.size} starters, ${bench.length} bench`
    );

    return { starters, bench };
  } catch (error) {
    console.error("Error auto-populating starters:", error);
    // Fallback: all players to bench
    return { starters: [], bench: playerIds };
  }
}

/**
 * Assign drafted players to rosters
 * This populates each roster with their drafted players, auto-filling starters
 */
export async function assignDraftedPlayersToRosters(draftId: number): Promise<void> {
  try {
    console.log(`[AssignPlayers] Starting roster assignment for draft ${draftId}`);

    // Get draft info to get league_id
    const draftQuery = `SELECT league_id FROM drafts WHERE id = $1`;
    const draftResult = await pool.query(draftQuery, [draftId]);
    const leagueId = draftResult.rows[0]?.league_id;

    if (!leagueId) {
      throw new Error("Draft not found or missing league_id");
    }

    // Get all draft picks with player IDs
    const picksQuery = `
      SELECT roster_id, player_id, pick_number
      FROM draft_picks
      WHERE draft_id = $1 AND player_id IS NOT NULL
      ORDER BY pick_number
    `;
    const picksResult = await pool.query(picksQuery, [draftId]);
    const picks = picksResult.rows;

    console.log(`[AssignPlayers] Found ${picks.length} picks to assign`);

    // Group picks by roster (maintaining draft order)
    const picksByRoster: { [key: number]: string[] } = {};
    for (const pick of picks) {
      if (!picksByRoster[pick.roster_id]) {
        picksByRoster[pick.roster_id] = [];
      }
      picksByRoster[pick.roster_id].push(pick.player_id);
    }

    // Update each roster with their drafted players
    const { updateRoster } = await import("./Roster");

    for (const [rosterIdStr, playerIds] of Object.entries(picksByRoster)) {
      const rosterId = parseInt(rosterIdStr);
      console.log(
        `[AssignPlayers] Auto-populating roster ${rosterId} with ${playerIds.length} players`
      );

      // Get existing roster to preserve BN slots
      const { getRosterById } = await import("./Roster");
      const existingRoster = await getRosterById(rosterId);

      // Auto-populate starters from drafted players (this excludes BN slots)
      const { starters, bench } = await autoPopulateStarters(
        rosterId,
        playerIds,
        leagueId
      );

      // Get BN slots from existing roster and assign bench players to them
      const bnSlots = existingRoster?.starters?.filter((slot: any) =>
        slot.slot?.startsWith('BN')
      ) || [];

      // Assign bench players to BN slots
      for (let i = 0; i < bnSlots.length && i < bench.length; i++) {
        bnSlots[i].player_id = bench[i];
      }

      // Combine non-BN starters with BN slots
      const allStarters = [...starters, ...bnSlots];

      // Remaining bench players (more than BN slots available)
      const remainingBench = bench.slice(bnSlots.length);

      await updateRoster(rosterId, {
        starters: allStarters,
        bench: remainingBench,
      });

      // Also populate weekly lineups for all weeks with these starters
      const { getLeagueById } = await import("./League");
      const league = await getLeagueById(leagueId);

      if (league) {
        const startWeek = league.settings?.start_week || 1;
        const playoffWeekStart = league.settings?.playoff_week_start || 15;
        const { updateWeeklyLineup } = await import("./WeeklyLineup");

        console.log(`[AssignPlayers] Populating weekly lineups for roster ${rosterId} from week ${startWeek} to ${playoffWeekStart - 1}`);

        // Filter out BN slots for weekly lineups (bench players don't go in weekly starters)
        const nonBenchStarters = starters.filter((slot: any) => {
          const slotName = slot.slot || '';
          return !slotName.startsWith('BN');
        });

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            await updateWeeklyLineup(rosterId, week, league.season, nonBenchStarters);
          } catch (error) {
            console.error(`[AssignPlayers] Failed to populate week ${week} lineup:`, error);
          }
        }
      }
    }

    console.log(`[AssignPlayers] Successfully assigned players to rosters and populated weekly lineups`);
  } catch (error) {
    console.error("Error assigning drafted players to rosters:", error);
    throw new Error("Error assigning drafted players to rosters");
  }
}

/**
 * Reset draft - clears all picks and resets to not_started
 */
export async function resetDraft(draftId: number): Promise<Draft> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete all draft picks
    await client.query("DELETE FROM draft_picks WHERE draft_id = $1", [
      draftId,
    ]);

    // Delete all draft chat messages
    await client.query("DELETE FROM draft_chat_messages WHERE draft_id = $1", [
      draftId,
    ]);

    // Reset draft to not_started
    const query = `
      UPDATE drafts
      SET status = 'not_started',
          current_pick = 1,
          current_round = 1,
          current_roster_id = NULL,
          pick_deadline = NULL,
          started_at = NULL,
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await client.query(query, [draftId]);

    if (result.rows.length === 0) {
      throw new Error("Draft not found");
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error resetting draft:", error);
    throw new Error("Error resetting draft");
  } finally {
    client.release();
  }
}

/**
 * Delete draft
 */
export async function deleteDraft(draftId: number): Promise<void> {
  try {
    const query = `DELETE FROM drafts WHERE id = $1`;
    await pool.query(query, [draftId]);
  } catch (error) {
    console.error("Error deleting draft:", error);
    throw new Error("Error deleting draft");
  }
}
