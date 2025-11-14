import pool from "../config/database";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import { BaseRepository } from "./BaseRepository";
import { logger } from "../config/logger";

export interface Draft {
  id: number;
  league_id: number;
  draft_type: "snake" | "linear" | "auction" | "slow_auction";
  third_round_reversal: boolean;
  status: "not_started" | "in_progress" | "paused" | "completing" | "completed";
  current_pick: number;
  current_round: number;
  current_roster_id: number | null;
  pick_time_seconds: number;
  pick_deadline: Date | null;
  rounds: number;
  timer_mode: "traditional" | "chess";
  team_time_budget_seconds: number | null;
  // Scheduling fields
  scheduled_start_time: Date | null;
  auto_start: boolean;
  // Derby-specific fields
  derby_enabled: boolean;
  derby_time_limit_seconds: number | null;
  derby_timeout_behavior: "auto" | "skip";
  derby_skipped_user_time_limit_seconds: number | null;
  // Auction-specific fields
  starting_budget: number;
  min_bid: number;
  bid_increment: number;
  nominations_per_manager: number;
  nomination_timer_hours: number | null;
  bid_timer_seconds: number;
  reserve_budget_per_slot: boolean;
  started_at: Date | null;
  completed_at: Date | null;
  settings: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Repository class for Draft entities
 * Extends BaseRepository to inherit CRUD operations
 */
class DraftRepository extends BaseRepository<Draft> {
  constructor() {
    super('drafts', 'id');
  }
}

const draftRepository = new DraftRepository();

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
  // Scheduling settings
  scheduled_start_time?: Date;
  auto_start?: boolean;
  // Auction-specific settings
  starting_budget?: number;
  min_bid?: number;
  bid_increment?: number;
  nominations_per_manager?: number;
  nomination_timer_hours?: number;
  bid_timer_seconds?: number;
  reserve_budget_per_slot?: boolean;
  // Derby-specific settings
  derby_enabled?: boolean;
  derby_time_limit_seconds?: number;
  derby_timeout_behavior?: string;
  derby_skipped_user_time_limit_seconds?: number;
  settings?: any;
}): Promise<Draft> {
  try {
    // Validate chess timer mode requirements
    const timerMode = draftData.timer_mode || "traditional";
    const timeBudget = draftData.team_time_budget_seconds;

    if (timerMode === "chess" && (!timeBudget || timeBudget <= 0)) {
      throw new Error("Chess timer mode requires a positive team_time_budget_seconds value");
    }

    logger.info(`[Draft] Creating draft with timer_mode: ${timerMode}, budget: ${timeBudget || 'N/A'}, type: ${draftData.draft_type}`);

    const query = `
      INSERT INTO drafts (
        league_id, draft_type, third_round_reversal, pick_time_seconds,
        rounds, timer_mode, team_time_budget_seconds,
        scheduled_start_time, auto_start,
        starting_budget, min_bid, bid_increment, nominations_per_manager,
        nomination_timer_hours, bid_timer_seconds, reserve_budget_per_slot,
        derby_enabled, derby_time_limit_seconds, derby_timeout_behavior,
        derby_skipped_user_time_limit_seconds,
        settings
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
      draftData.scheduled_start_time || null,
      draftData.auto_start || false,
      draftData.starting_budget || 200,
      draftData.min_bid || 1,
      draftData.bid_increment || 1,
      draftData.nominations_per_manager || 3,
      draftData.nomination_timer_hours || null,
      draftData.bid_timer_seconds || 30,
      draftData.reserve_budget_per_slot || false,
      draftData.derby_enabled || false,
      draftData.derby_time_limit_seconds || null,
      draftData.derby_timeout_behavior || 'auto',
      draftData.derby_skipped_user_time_limit_seconds || null,
      JSON.stringify(draftData.settings || {}),
    ]);

    return result.rows[0];
  } catch (error: any) {
    logger.error("Error creating draft:", { error });

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
 * REFACTORED: Uses draftRepository.findById() for simplified query (13 lines saved)
 */
export async function getDraftById(draftId: number): Promise<Draft | null> {
  return draftRepository.findById(draftId);
}

/**
 * Get draft by league ID
 * REFACTORED: Uses draftRepository.findBy() for simplified query (13 lines saved)
 */
export async function getDraftByLeagueId(
  leagueId: number
): Promise<Draft | null> {
  const results = await draftRepository.findBy('league_id', leagueId);
  return results.length > 0 ? results[0] : null;
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
    logger.error("Error updating draft:", { error });
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
    logger.error("Error starting draft:", { error });
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
    logger.error("Error pausing draft:", { error });
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
    logger.error("Error resuming draft:", { error });
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
    logger.error("Error completing draft:", { error });
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
      logger.info(`[AutoPopulate] No roster positions found, all players to bench`);
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

    // Helper: Get eligible positions for a player
    const getEligiblePositions = (playerPosition: string): string[] => {
      const eligible: string[] = [playerPosition]; // Always eligible for exact position match

      // Add FLEX eligibility
      if (["RB", "WR", "TE"].includes(playerPosition)) {
        eligible.push("FLEX", "WRT");
      }
      if (["QB", "RB", "WR", "TE"].includes(playerPosition)) {
        eligible.push("SUPER_FLEX");
      }
      if (["WR", "TE"].includes(playerPosition)) {
        eligible.push("REC_FLEX");
      }
      if (["DL", "LB", "DB"].includes(playerPosition)) {
        eligible.push("IDP_FLEX");
      }

      return eligible;
    };

    // Helper: Check if player can fill a slot
    const canFillSlot = (playerId: string, slotPos: string): boolean => {
      const playerPosition = playersMap[playerId];
      if (!playerPosition) {
        logger.warn(`[AutoPopulate] WARNING: No position found for player ${playerId}`);
        return false;
      }

      const eligiblePositions = getEligiblePositions(playerPosition);
      const canFill = eligiblePositions.includes(slotPos);

      // Extra validation: QB can ONLY go in QB or SUPER_FLEX
      if (playerPosition === "QB" && !["QB", "SUPER_FLEX"].includes(slotPos)) {
        logger.warn(`[AutoPopulate] BLOCKED: QB ${playerId} cannot fill ${slotPos}`);
        return false;
      }

      // Validate non-QB cannot go in QB slot
      if (slotPos === "QB" && playerPosition !== "QB") {
        logger.warn(`[AutoPopulate] BLOCKED: ${playerPosition} player ${playerId} cannot fill QB slot`);
        return false;
      }

      return canFill;
    };

    // Helper: Get slot restrictiveness score (lower = more restrictive)
    const getSlotRestrictiveness = (slotPos: string): number => {
      // Single-position slots are most restrictive
      if (["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].includes(slotPos)) {
        return 1;
      }
      // Multi-position FLEX slots are less restrictive (ordered by flexibility)
      if (slotPos === "REC_FLEX") return 2; // WR, TE
      if (slotPos === "WRT") return 3; // WR, RB, TE
      if (slotPos === "FLEX") return 4; // RB, WR, TE
      if (slotPos === "IDP_FLEX") return 5; // DL, LB, DB
      if (slotPos === "SUPER_FLEX") return 6; // QB, RB, WR, TE

      // Unknown slot types default to very flexible
      return 99;
    };

    // Sort slots by restrictiveness (most restrictive first)
    const sortedSlots = [...starters].sort((a, b) => {
      const aPos = a.slot.replace(/\d+$/, "");
      const bPos = b.slot.replace(/\d+$/, "");
      const aScore = getSlotRestrictiveness(aPos);
      const bScore = getSlotRestrictiveness(bPos);

      // If same restrictiveness, maintain original order
      if (aScore === bScore) {
        return starters.indexOf(a) - starters.indexOf(b);
      }

      return aScore - bScore;
    });

    // NEW ALGORITHM: Fill most restrictive slots first
    // For each slot (most restrictive to least):
    //   - Find all unassigned players that fit
    //   - Pick the one drafted earliest (earliest in playerIds array)
    logger.info(`[AutoPopulate] Starting slot assignment with ${playerIds.length} players`);
    logger.debug(`[AutoPopulate] Players map:`, { playersMap });

    for (const slot of sortedSlots) {
      const slotPos = slot.slot.replace(/\d+$/, "");

      logger.debug(`[AutoPopulate] Filling slot ${slot.slot} (${slotPos}, restrictiveness: ${getSlotRestrictiveness(slotPos)})`);

      // Find all unassigned players that can fill this slot
      const eligiblePlayers = playerIds.filter(
        (playerId) => !assignedPlayerIds.has(playerId) && canFillSlot(playerId, slotPos)
      );

      logger.debug(`[AutoPopulate]   Found ${eligiblePlayers.length} eligible players:`, { eligiblePlayers: eligiblePlayers.map(id => `${id}(${playersMap[id]})`) });

      if (eligiblePlayers.length > 0) {
        // Pick the first one (earliest draft pick)
        const selectedPlayer = eligiblePlayers[0];
        const playerPosition = playersMap[selectedPlayer];

        // Find the slot in the original starters array and assign
        const slotIndex = starters.findIndex((s) => s.slot === slot.slot);
        if (slotIndex !== -1) {
          starters[slotIndex].player_id = selectedPlayer;
          assignedPlayerIds.add(selectedPlayer);
          logger.debug(
            `[AutoPopulate] ✓ Assigned player ${selectedPlayer} (${playerPosition}) to slot ${starters[slotIndex].slot}`
          );
        }
      } else {
        logger.debug(`[AutoPopulate]   No eligible players for slot ${slot.slot}`);
      }
    }

    // Remaining players go to bench
    const bench = playerIds.filter((id) => !assignedPlayerIds.has(id));

    logger.info(
      `[AutoPopulate] Roster ${rosterId}: ${assignedPlayerIds.size} starters, ${bench.length} bench`
    );

    return { starters, bench };
  } catch (error) {
    logger.error("Error auto-populating starters:", { error });
    // Fallback: all players to bench
    return { starters: [], bench: playerIds };
  }
}

/**
 * Assign drafted players to rosters
 * This populates each roster with their drafted players, auto-filling starters
 * IDEMPOTENT: Safe to call multiple times - checks if already assigned
 */
export async function assignDraftedPlayersToRosters(draftId: number): Promise<void> {
  try {
    logger.info(`[AssignPlayers] Starting roster assignment for draft ${draftId}`);

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

    logger.info(`[AssignPlayers] Found ${picks.length} picks to assign`);

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

      // IDEMPOTENCY CHECK: Get existing roster and check if players are already assigned
      const { getRosterById } = await import("./Roster");
      const existingRoster = await getRosterById(rosterId);

      // Collect all player IDs currently in the roster
      const existingPlayerIds = new Set<string>();
      if (existingRoster?.starters) {
        existingRoster.starters.forEach((slot: any) => {
          if (slot.player_id) existingPlayerIds.add(slot.player_id);
        });
      }
      if (existingRoster?.bench) {
        existingRoster.bench.forEach((playerId: string) => {
          if (playerId) existingPlayerIds.add(playerId);
        });
      }

      // Check if all drafted players are already assigned
      const allPlayersAssigned = playerIds.every(id => existingPlayerIds.has(id));

      if (allPlayersAssigned && playerIds.length === existingPlayerIds.size) {
        logger.info(`[AssignPlayers] Roster ${rosterId} already has all ${playerIds.length} drafted players assigned, skipping`);
        continue;
      }

      logger.info(
        `[AssignPlayers] Auto-populating roster ${rosterId} with ${playerIds.length} players`
      );

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

        logger.info(`[AssignPlayers] Populating weekly lineups for roster ${rosterId} from week ${startWeek} to ${playoffWeekStart - 1}`);

        // Filter out BN slots for weekly lineups (bench players don't go in weekly starters)
        const nonBenchStarters = starters.filter((slot: any) => {
          const slotName = slot.slot || '';
          return !slotName.startsWith('BN');
        });

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            await updateWeeklyLineup(rosterId, week, league.season, nonBenchStarters);
          } catch (error) {
            logger.error(`[AssignPlayers] Failed to populate week ${week} lineup:`, { error });
          }
        }
      }
    }

    logger.info(`[AssignPlayers] Successfully assigned players to rosters and populated weekly lineups`);
  } catch (error) {
    logger.error("Error assigning drafted players to rosters:", { error });
    throw new Error("Error assigning drafted players to rosters");
  }
}

/**
 * Reset draft - clears all picks and resets to not_started
 */
export async function resetDraft(draftId: number): Promise<Draft> {
  const client = await pool.connect();
    await setTransactionTimeouts(client);
  try {
    await client.query("BEGIN");

    // Lock the draft row to prevent concurrent resets
    const lockResult = await client.query(
      "SELECT id FROM drafts WHERE id = $1 FOR UPDATE",
      [draftId]
    );

    if (lockResult.rows.length === 0) {
      throw new Error("Draft not found");
    }

    // Delete all draft picks
    await client.query("DELETE FROM draft_picks WHERE draft_id = $1", [
      draftId,
    ]);

    // Delete all draft chat messages
    await client.query("DELETE FROM draft_chat_messages WHERE draft_id = $1", [
      draftId,
    ]);

    // Reset derby if it exists (delete selections, reset to pending)
    const { resetDraftDerby } = await import("./DraftDerby");
    await resetDraftDerby(draftId);

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
    logger.error("Error resetting draft:", { error });
    throw new Error("Error resetting draft");
  } finally {
    client.release();
  }
}

/**
 * Delete draft
 * REFACTORED: Uses draftRepository.delete() for simplified query (8 lines saved)
 */
export async function deleteDraft(draftId: number): Promise<void> {
  await draftRepository.delete(draftId);
}
