import { getDraftById } from "../models/Draft";
import { getDraftOrder, getRosterAtPosition } from "../models/DraftOrder";
import { getAvailablePlayersForDraft } from "../models/Player";
import { getLeagueById, updateLeague } from "../models/League";
import { calculateCurrentRoster } from "../controllers/draftController";
import { emitDraftPick, emitDraftStatusChange } from "../socket/draftSocket";
import { io } from "../index";
import { AutoPickFailedError } from "../errors/DraftErrors";
import pool from "../config/database";

// Map to track active timers for each draft
const activeTimers: Map<number, NodeJS.Timeout> = new Map();

/**
 * Start monitoring a draft for auto-picks
 */
export function startAutoPickMonitoring(draftId: number): void {
  // Clear existing timer if any
  stopAutoPickMonitoring(draftId);

  // Check every second for expired picks
  const timer = setInterval(async () => {
    await checkAndAutoPickIfNeeded(draftId);
  }, 1000);

  activeTimers.set(draftId, timer);
  console.log(`[AutoPick] Started monitoring draft ${draftId}`);
}

/**
 * Stop monitoring a draft
 */
export function stopAutoPickMonitoring(draftId: number): void {
  const timer = activeTimers.get(draftId);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(draftId);
    console.log(`[AutoPick] Stopped monitoring draft ${draftId}`);
  }
}

/**
 * Check if current pick has expired and auto-pick if needed
 */
async function checkAndAutoPickIfNeeded(draftId: number): Promise<void> {
  try {
    const draft = await getDraftById(draftId);

    // Only auto-pick for drafts in progress
    if (!draft || draft.status !== "in_progress") {
      stopAutoPickMonitoring(draftId);
      return;
    }

    // Get the draft order to check if current roster has autodraft enabled
    const draftOrder = await getDraftOrder(draftId);
    const currentRosterOrder = draftOrder.find(
      (order) => order.roster_id === draft.current_roster_id
    );

    // Check if current roster has autodraft enabled
    if (currentRosterOrder?.is_autodrafting && draft.current_roster_id) {
      console.log(
        `[AutoPick] Roster ${draft.current_roster_id} has autodraft enabled, picking immediately`
      );
      await performAutoPickWithRetry(draftId, draft.current_roster_id);
      return;
    }

    // Check if pick deadline has passed
    if (!draft.pick_deadline) {
      return;
    }

    const now = new Date();
    const deadline = new Date(draft.pick_deadline);

    if (now >= deadline) {
      console.log(
        `[AutoPick] Pick deadline expired for draft ${draftId}, pick ${draft.current_pick}`
      );

      // Automatically enable autodraft for this roster since they timed out
      if (currentRosterOrder && !currentRosterOrder.is_autodrafting && draft.current_roster_id) {
        console.log(
          `[AutoPick] Enabling autodraft for roster ${draft.current_roster_id} due to timeout`
        );
        const { toggleAutodraft } = await import("../models/DraftOrder");
        await toggleAutodraft(draftId, draft.current_roster_id, true);

        // Broadcast autodraft status change to all clients
        const { io } = await import("../index");
        io.to(`draft_${draftId}`).emit("autodraft_toggled", {
          roster_id: draft.current_roster_id,
          is_autodrafting: true,
          username: "System (Timeout)",
          timestamp: new Date(),
        });
      }

      if (draft.current_roster_id) {
        await performAutoPickWithRetry(draftId, draft.current_roster_id);
      }
    }
  } catch (error) {
    console.error(`[AutoPick] Error checking draft ${draftId}:`, error);
  }
}

/**
 * Perform an automatic pick with retry logic
 */
async function performAutoPickWithRetry(
  draftId: number,
  rosterId: number,
  maxRetries: number = 3
): Promise<boolean> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      console.log(`[AutoPick] Attempt ${attempt + 1}/${maxRetries} for draft ${draftId}, roster ${rosterId}`);

      const draft = await getDraftById(draftId);
      if (!draft) {
        throw new Error(`Draft ${draftId} not found`);
      }

      const player = await selectBestAvailablePlayer(draftId, rosterId);

      if (!player) {
        console.warn(`[AutoPick] No available players for roster ${rosterId}`);
        // Skip pick as last resort
        await skipPick(draftId, rosterId);
        return true;
      }

      await makeDraftPick(draftId, rosterId, player.id, draft);
      console.log(`[AutoPick] Success: Drafted ${player.full_name} for roster ${rosterId}`);
      return true;

    } catch (error: any) {
      lastError = error;
      attempt++;

      console.error(`[AutoPick] Attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`[AutoPick] Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries failed
  console.error(`[AutoPick] Failed after ${maxRetries} attempts for draft ${draftId}, roster ${rosterId}`);

  // Create error event for monitoring
  await createAutoPickFailureEvent(draftId, rosterId, lastError?.message || 'Unknown error');

  throw new AutoPickFailedError(draftId, lastError?.message || 'Max retries exceeded');
}

/**
 * Skip a pick and move to the next roster (last resort when all retries fail)
 */
async function skipPick(draftId: number, rosterId: number): Promise<void> {
  // Skip this pick and move to next
  // This is a last resort when no players are available or all retries fail
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE SKIP LOCKED',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      throw new Error(`Draft ${draftId} is currently being modified by another transaction`);
    }

    const draft = draftResult.rows[0];
    const nextPick = draft.current_pick + 1;

    await client.query(
      `UPDATE drafts
       SET current_pick = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [nextPick, draftId]
    );

    await client.query('COMMIT');

    console.log(`[AutoPick] Skipped pick ${draft.current_pick} for roster ${rosterId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Log auto-pick failure to audit table
 */
async function createAutoPickFailureEvent(
  draftId: number,
  rosterId: number,
  reason: string
): Promise<void> {
  // Log to audit table or send to monitoring service
  try {
    await pool.query(
      `INSERT INTO draft_audit_log (draft_id, roster_id, event_type, details, created_at)
       VALUES ($1, $2, 'auto_pick_failed', $3, CURRENT_TIMESTAMP)`,
      [draftId, rosterId, JSON.stringify({ reason })]
    );
  } catch (error) {
    console.error('[AutoPick] Failed to log failure event:', error);
  }
}

/**
 * Make the actual draft pick (used by retry logic)
 */
async function makeDraftPick(draftId: number, rosterId: number, playerId: number, draft: any): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(
      `[AutoPick] Auto-picking player ${playerId} for roster ${rosterId}`
    );

    // Lock the draft row to prevent concurrent picks
    // Use SKIP LOCKED to avoid race condition with manual picks
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE SKIP LOCKED',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      throw new Error(`Draft ${draftId} is currently being modified by another transaction`);
    }

    const lockedDraft = draftResult.rows[0];

    // Validate draft is in progress
    if (lockedDraft.status !== 'in_progress') {
      throw new Error(`Draft is not in progress (status: ${lockedDraft.status})`);
    }

    // Validate it's this roster's turn
    if (lockedDraft.current_roster_id !== rosterId) {
      throw new Error(`Not roster ${rosterId}'s turn (current: ${lockedDraft.current_roster_id})`);
    }

    // Check if player is already drafted (prevent double-draft)
    const existingPickResult = await client.query(
      'SELECT id FROM draft_picks WHERE draft_id = $1 AND player_id = $2',
      [draftId, playerId]
    );

    if (existingPickResult.rows.length > 0) {
      throw new Error(`Player ${playerId} already drafted`);
    }

    // Get league and draft order for calculations
    const league = await getLeagueById(lockedDraft.league_id);
    const draftOrder = await getDraftOrder(draftId);
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { round, pickInRound } = calculateCurrentRoster(
      lockedDraft.current_pick,
      totalRosters,
      lockedDraft.draft_type,
      lockedDraft.third_round_reversal
    );

    // Create the auto-pick using transaction client
    const pickResult = await client.query(
      `INSERT INTO draft_picks (
        draft_id, pick_number, round, pick_in_round,
        roster_id, player_id, is_auto_pick, pick_time_seconds, pick_started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        draftId,
        lockedDraft.current_pick,
        round,
        pickInRound,
        rosterId,
        playerId,
        true,
        0,
        null
      ]
    );

    const pick = pickResult.rows[0];

    console.log(`[AutoPick] Created pick:`, pick);

    // Calculate next pick
    const nextPickNumber = lockedDraft.current_pick + 1;
    const totalPicks = totalRosters * lockedDraft.rounds;

    let updatedDraft;

    if (nextPickNumber > totalPicks) {
      // Draft is complete
      console.log(`[AutoPick] Draft ${draftId} is complete! Total picks: ${totalPicks}`);

      // Update draft status to completed
      const completeDraftResult = await client.query(
        `UPDATE drafts
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             pick_deadline = NULL,
             current_roster_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [draftId]
      );
      updatedDraft = completeDraftResult.rows[0];

      // Commit transaction before performing side effects
      await client.query('COMMIT');

      // Assign drafted players to rosters
      const { assignDraftedPlayersToRosters } = await import("../models/Draft");
      await assignDraftedPlayersToRosters(draftId);

      // Update league status to 'in_season'
      if (league) {
        await updateLeague(league.id, { status: "in_season" });
        console.log(`[AutoPick] League ${league.id} status updated to in_season`);
      }

      stopAutoPickMonitoring(draftId);

      // Emit status change to notify clients that draft is complete
      emitDraftStatusChange(io, draftId, "completed", updatedDraft);
    } else {
      // Move to next pick
      const nextPickInfo = calculateCurrentRoster(
        nextPickNumber,
        totalRosters,
        lockedDraft.draft_type,
        lockedDraft.third_round_reversal
      );

      const nextRosterId = await getRosterAtPosition(
        draftId,
        nextPickInfo.draftPosition
      );

      if (!nextRosterId) {
        throw new Error(`Could not find roster at position ${nextPickInfo.draftPosition}`);
      }

      // Calculate new pick deadline
      const pickDeadline = new Date();
      pickDeadline.setSeconds(
        pickDeadline.getSeconds() + lockedDraft.pick_time_seconds
      );

      const updateDraftResult = await client.query(
        `UPDATE drafts
         SET current_pick = $1,
             current_round = $2,
             current_roster_id = $3,
             pick_deadline = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [nextPickNumber, nextPickInfo.round, nextRosterId, pickDeadline, draftId]
      );
      updatedDraft = updateDraftResult.rows[0];

      // Commit transaction
      await client.query('COMMIT');
    }

    // Get roster and user details for WebSocket emission
    const { getRosterById } = await import("../models/Roster");
    const roster = await getRosterById(rosterId);
    const { getUserById } = await import("../models/User");
    const user = roster?.user_id ? await getUserById(roster.user_id) : null;

    // Get player details for WebSocket emission
    const { getPlayerById } = await import("../models/Player");
    const player = await getPlayerById(playerId);

    // Emit socket event for the auto-pick
    const pickWithDetails = {
      ...pick,
      player_name: player?.full_name,
      player_position: player?.position,
      player_team: player?.team,
      roster_number: roster?.roster_id,
      picked_by_username: user?.username,
    };
    console.log(`[AutoPick] Emitting pick with details:`, pickWithDetails);
    emitDraftPick(io, draftId, pickWithDetails, updatedDraft);

    // Emit auto-pick notification
    io.to(`draft_${draftId}`).emit("auto_pick_made", {
      draftId,
      pickNumber: draft.current_pick,
      rosterId,
      playerId: playerId,
      playerName: player?.full_name,
      playerPosition: player?.position,
      round,
      pickInRound,
    });

    console.log(
      `[AutoPick] Successfully auto-picked ${player?.full_name} for roster ${rosterId}`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[AutoPick] Error performing auto-pick:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Select the best available player based on ADP and roster needs
 */
async function selectBestAvailablePlayer(
  draftId: number,
  _rosterId: number
): Promise<any | null> {
  try {
    // Get available players sorted by search_rank (best available by default)
    const allAvailablePlayers = await getAvailablePlayersForDraft(draftId);

    if (allAvailablePlayers.length === 0) {
      return null;
    }

    // Limit to top 100 for performance
    const availablePlayers = allAvailablePlayers.slice(0, 100);

    // TODO: Future enhancement - analyze roster needs
    // const allPicks = await getDraftPicks(draftId);
    // const rosterPicks = allPicks.filter((pick) => pick.roster_id === rosterId);
    // Count positions already drafted and pick based on needs

    // Simple strategy: Pick best available by position priority
    // Priority order: QB, RB, WR, TE, FLEX positions first
    const positionPriority = ["QB", "RB", "WR", "TE", "K", "DEF"];

    // Try to find best player following position priority
    for (const position of positionPriority) {
      const playerOfPosition = availablePlayers.find(
        (p) => p.position === position
      );
      if (playerOfPosition) {
        return playerOfPosition;
      }
    }

    // If no priority position found, just take best available
    return availablePlayers[0];
  } catch (error) {
    console.error(`[AutoPick] Error selecting best player:`, error);
    return null;
  }
}

/**
 * Stop all auto-pick monitoring (cleanup on server shutdown)
 */
export function stopAllAutoPickMonitoring(): void {
  for (const [draftId, timer] of activeTimers.entries()) {
    clearInterval(timer);
    console.log(`[AutoPick] Stopped monitoring draft ${draftId}`);
  }
  activeTimers.clear();
}
