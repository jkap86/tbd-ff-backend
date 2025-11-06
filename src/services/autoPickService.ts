import { getDraftById } from "../models/Draft";
import { getDraftOrder, getRosterAtPosition } from "../models/DraftOrder";
import { getLeagueById } from "../models/League";
import { calculateCurrentRoster } from "../controllers/draftController";
import { emitDraftPick, emitDraftStatusChange } from "../socket/draftSocket";
import { io } from "../index";
import { AutoPickFailedError } from "../errors/DraftErrors";
import pool from "../config/database";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import { DB_ERROR_CODES } from "../config/constants";

// Map to track active timers for each draft
const activeTimers: Map<number, NodeJS.Timeout> = new Map();

// Map to track in-progress auto-picks to prevent concurrent attempts
const inProgressAutoPicksMap: Map<number, boolean> = new Map();

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
    // Skip if an auto-pick is already in progress for this draft
    if (inProgressAutoPicksMap.get(draftId)) {
      console.log(`[AutoPick] Auto-pick already in progress for draft ${draftId}, skipping check`);
      return;
    }

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
      // Mark as in-progress to prevent concurrent attempts
      inProgressAutoPicksMap.set(draftId, true);
      try {
        await performAutoPickWithRetry(draftId, draft.current_roster_id);
      } finally {
        inProgressAutoPicksMap.delete(draftId);
      }
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
        // Mark as in-progress to prevent concurrent attempts
        inProgressAutoPicksMap.set(draftId, true);
        try {
          await performAutoPickWithRetry(draftId, draft.current_roster_id);
        } finally {
          inProgressAutoPicksMap.delete(draftId);
        }
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

      await makeDraftPickWithPlayerSelection(draftId, rosterId);
      console.log(`[AutoPick] Success: Auto-pick completed for roster ${rosterId}`);
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
    await setTransactionTimeouts(client);
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
  } catch (error: any) {
    await client.query('ROLLBACK');

    // Handle timeout errors
    if (error.code === DB_ERROR_CODES.STATEMENT_TIMEOUT) {
      console.error('[Transaction] Statement timeout in skipPick');
      throw new Error('Operation timed out, please try again');
    }

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
 * Make a draft pick with player selection inside the transaction
 * This prevents race conditions where player gets picked between selection and insertion
 */
async function makeDraftPickWithPlayerSelection(draftId: number, rosterId: number): Promise<void> {
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query('BEGIN');

    // Lock the draft row to prevent concurrent picks
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

    // SELECT the best available player INSIDE the transaction, after locking the draft
    // This ensures we get the most current available players and prevent double-drafting
    const availablePlayersResult = await client.query(
      `SELECT p.id, p.player_id, p.full_name, p.position, p.team
       FROM players p
       WHERE NOT EXISTS (
         SELECT 1
         FROM draft_picks dp
         WHERE dp.draft_id = $1
           AND dp.player_id = p.player_id
           AND dp.player_id IS NOT NULL
       )
       ORDER BY p.search_rank NULLS LAST, p.full_name
       LIMIT 1`,
      [draftId]
    );

    if (availablePlayersResult.rows.length === 0) {
      console.warn(`[AutoPick] No available players for roster ${rosterId}, skipping pick`);
      await client.query('ROLLBACK');
      await skipPick(draftId, rosterId);
      return;
    }

    const selectedPlayer = availablePlayersResult.rows[0];
    console.log(`[AutoPick] Selected player ${selectedPlayer.id} (${selectedPlayer.full_name}) for roster ${rosterId}`);

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

    // Create the pick
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
        selectedPlayer.player_id,
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

      await client.query('COMMIT');

      // Assign drafted players to rosters
      const { assignDraftedPlayersToRosters } = await import("../models/Draft");
      await assignDraftedPlayersToRosters(draftId);

      console.log(`[AutoPick] Draft completed and rosters assigned`);
    } else {
      // Calculate the next roster
      const nextRosterId = await getRosterAtPosition(draftId, calculateCurrentRoster(
        nextPickNumber,
        totalRosters,
        lockedDraft.draft_type,
        lockedDraft.third_round_reversal
      ).draftPosition);

      if (!nextRosterId) {
        throw new Error('Could not calculate next roster');
      }

      // Set the pick deadline for the next pick
      const pickDeadline = new Date();
      pickDeadline.setSeconds(pickDeadline.getSeconds() + lockedDraft.pick_time_seconds);

      // Update draft state
      const updateResult = await client.query(
        `UPDATE drafts
         SET current_pick = $1,
             current_round = $2,
             current_roster_id = $3,
             pick_deadline = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [
          nextPickNumber,
          calculateCurrentRoster(
            nextPickNumber,
            totalRosters,
            lockedDraft.draft_type,
            lockedDraft.third_round_reversal
          ).round,
          nextRosterId,
          pickDeadline,
          draftId
        ]
      );
      updatedDraft = updateResult.rows[0];

      // Update draft_order with deadline for next pick
      await client.query(
        `UPDATE draft_order
         SET pick_expiration = $1
         WHERE draft_id = $2 AND roster_id = $3`,
        [pickDeadline, draftId, nextRosterId]
      );

      await client.query('COMMIT');
    }

    // Enrich pick with player details before emitting
    const { getPlayerById } = await import("../models/Player");
    const { getRosterById } = await import("../models/Roster");
    const { getUserById } = await import("../models/User");

    const player = await getPlayerById(selectedPlayer.id);
    const roster = await getRosterById(rosterId);
    const user = roster?.user_id ? await getUserById(roster.user_id) : null;

    const pickWithDetails = {
      ...pick,
      player_id: selectedPlayer.id,  // Database player ID
      sleeper_player_id: selectedPlayer.player_id,  // Sleeper API ID
      player_name: player?.full_name,
      player_position: player?.position,
      player_team: player?.team,
      roster_number: roster?.roster_id,
      picked_by_username: user?.username,
    };

    console.log(`[AutoPick] Emitting pick with details:`, pickWithDetails);

    // Emit draft pick event with enriched details
    emitDraftPick(io, draftId, pickWithDetails, updatedDraft);

    // Emit updated draft state
    emitDraftStatusChange(io, draftId, 'in_progress', updatedDraft);

  } catch (error: any) {
    await client.query('ROLLBACK');

    // Handle timeout errors
    if (error.code === DB_ERROR_CODES.STATEMENT_TIMEOUT) {
      console.error('[Transaction] Statement timeout in makeDraftPickWithPlayerSelection');
      throw new Error('Operation timed out, please try again');
    }

    throw error;
  } finally {
    client.release();
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
