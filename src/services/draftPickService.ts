/**
 * Draft pick service - handles business logic for creating draft picks
 */

import { PoolClient } from "pg";
import { getRosterAtPosition } from "../models/DraftOrder";
import { getLeagueById, updateLeague } from "../models/League";
import { getRosterById } from "../models/Roster";
import { getPlayerById } from "../models/Player";
import { calculateCurrentRoster } from "../controllers/draftController";

export interface DraftPickRequest {
  draftId: number;
  rosterId: number;
  playerId: number;
  isAutoPick?: boolean;
  userId?: number;
}

export interface DraftPickResult {
  pick: any;
  updatedDraft: any;
  nextDeadline?: Date;
  isComplete: boolean;
}

/**
 * Validates that a pick can be made
 */
export async function validateDraftPick(
  client: PoolClient,
  request: DraftPickRequest
): Promise<{ valid: boolean; error?: string; statusCode?: number }> {
  const { draftId, rosterId, playerId, isAutoPick, userId } = request;

  // Check if player is already drafted
  const existingPickResult = await client.query(
    'SELECT id FROM draft_picks WHERE draft_id = $1 AND player_id = $2',
    [draftId, playerId]
  );

  if (existingPickResult.rows.length > 0) {
    return {
      valid: false,
      error: "Player has already been drafted",
      statusCode: 400,
    };
  }

  // Verify roster ownership (unless auto-pick)
  if (!isAutoPick) {
    if (!userId) {
      return {
        valid: false,
        error: "User not authenticated",
        statusCode: 401,
      };
    }

    const roster = await getRosterById(rosterId);
    if (!roster) {
      return {
        valid: false,
        error: "Roster not found",
        statusCode: 404,
      };
    }

    if (roster.user_id !== userId) {
      return {
        valid: false,
        error: "You can only make picks for your own roster",
        statusCode: 403,
      };
    }
  }

  return { valid: true };
}

/**
 * Creates a draft pick and advances the draft
 */
export async function createDraftPick(
  client: PoolClient,
  request: DraftPickRequest
): Promise<DraftPickResult> {
  const { draftId, rosterId, playerId, isAutoPick = false } = request;

  // Lock and get draft
  const draftResult = await client.query(
    'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
    [draftId]
  );

  if (draftResult.rows.length === 0) {
    throw new Error("Draft not found");
  }

  const draft = draftResult.rows[0];

  // Check draft status
  if (draft.status !== "in_progress" && draft.status !== "paused") {
    throw new Error(
      `Draft is not in progress (current status: ${draft.status})`
    );
  }

  // Check if it's this roster's turn
  if (draft.current_roster_id !== rosterId) {
    throw new Error("It is not this roster's turn to pick");
  }

  // Validate the pick
  const validation = await validateDraftPick(client, request);
  if (!validation.valid) {
    const error: any = new Error(validation.error);
    error.statusCode = validation.statusCode;
    throw error;
  }

  // Get player's Sleeper ID for storage
  const playerForPick = await getPlayerById(playerId);
  if (!playerForPick) {
    throw new Error("Player not found");
  }
  const sleeperPlayerId = playerForPick.player_id;

  // Calculate pick time
  const pickTimeSeconds = draft.pick_deadline
    ? Math.max(
        0,
        draft.pick_time_seconds -
          Math.floor(
            (new Date().getTime() - new Date(draft.pick_deadline).getTime()) /
              1000
          ) +
          draft.pick_time_seconds
      )
    : null;

  // Get league and draft order for calculations
  const league = await getLeagueById(draft.league_id);
  const { getDraftOrder } = await import("../models/DraftOrder");
  const draftOrder = await getDraftOrder(draftId);
  const totalRosters = league?.total_rosters || draftOrder.length;

  const { round, pickInRound } = calculateCurrentRoster(
    draft.current_pick,
    totalRosters,
    draft.draft_type,
    draft.third_round_reversal
  );

  // Create the pick
  let pickResult;
  try {
    pickResult = await client.query(
      `INSERT INTO draft_picks (
        draft_id, pick_number, round, pick_in_round,
        roster_id, player_id, is_auto_pick, pick_time_seconds, pick_started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        draftId,
        draft.current_pick,
        round,
        pickInRound,
        rosterId,
        sleeperPlayerId,
        isAutoPick,
        pickTimeSeconds,
        null,
      ]
    );
  } catch (insertError: any) {
    if (
      insertError.code === "23505" &&
      insertError.constraint?.includes("player_id")
    ) {
      throw new Error("This player has already been drafted by another team");
    }
    throw insertError;
  }

  const pick = pickResult.rows[0];

  // Update chess timer if applicable
  if (draft.timer_mode === "chess" && pickTimeSeconds !== null) {
    try {
      await client.query(
        `UPDATE draft_order
         SET time_remaining_seconds = GREATEST(0, time_remaining_seconds - $1),
             time_used_seconds = time_used_seconds + $1
         WHERE draft_id = $2 AND roster_id = $3
         RETURNING time_remaining_seconds, time_used_seconds`,
        [pickTimeSeconds, draftId, rosterId]
      );
    } catch (error) {
      console.error(
        `[Draft] Failed to update chess timer for roster ${rosterId}:`,
        error
      );
      // Don't fail the pick if timer update fails
    }
  }

  // Calculate next pick
  const nextPickNumber = draft.current_pick + 1;
  const totalPicks = totalRosters * draft.rounds;

  let updatedDraft;
  let nextDeadline: Date | undefined;
  const isComplete = nextPickNumber > totalPicks;

  if (isComplete) {
    // Draft is complete - mark as 'completing'
    const completingDraftResult = await client.query(
      `UPDATE drafts
       SET status = 'completing',
           pick_deadline = NULL,
           current_roster_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [draftId]
    );
    updatedDraft = completingDraftResult.rows[0];
  } else {
    // Advance to next pick
    const nextPickInfo = calculateCurrentRoster(
      nextPickNumber,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    const nextRosterId = await getRosterAtPosition(draftId, nextPickInfo.draftPosition);

    if (!nextRosterId) {
      throw new Error(
        `Draft order mismatch: no roster found at position ${nextPickInfo.draftPosition}`
      );
    }

    nextDeadline = new Date();
    nextDeadline.setSeconds(nextDeadline.getSeconds() + draft.pick_time_seconds);

    // Update draft_order with deadline for next pick
    await client.query(
      `UPDATE draft_order
       SET pick_expiration = $1, pick_number = $2
       WHERE draft_id = $3 AND roster_id = $4`,
      [nextDeadline, nextPickNumber, draftId, nextRosterId]
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
      [nextPickNumber, nextPickInfo.round, nextRosterId, nextDeadline, draftId]
    );
    updatedDraft = updateDraftResult.rows[0];
  }

  return {
    pick,
    updatedDraft,
    nextDeadline,
    isComplete,
  };
}

/**
 * Completes a draft after all picks are made
 * Should be called outside of transaction after pick is committed
 */
export async function completeDraft(
  draftId: number,
  leagueId: number
): Promise<any> {
  const pool = (await import("../config/database")).default;

  try {
    // Assign drafted players to rosters
    const { assignDraftedPlayersToRosters } = await import("../models/Draft");
    await assignDraftedPlayersToRosters(draftId);

    // Mark draft as fully completed
    const completedDraftResult = await pool.query(
      `UPDATE drafts
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [draftId]
    );
    const updatedDraft = completedDraftResult.rows[0];

    // Update league status to 'in_season'
    const league = await getLeagueById(leagueId);
    if (league) {
      await updateLeague(league.id, { status: "in_season" });

      // Initialize season: generate matchups and calculate scores
      const { initializeSeasonFromLeague } = await import(
        "./draftCompletionService"
      );
      await initializeSeasonFromLeague(league);
    }

    return updatedDraft;
  } catch (error) {
    // Rollback draft status from 'completing' to 'in_progress'
    console.error(`[Draft] Failed to complete draft ${draftId}:`, error);
    await pool.query(
      `UPDATE drafts
       SET status = 'in_progress',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [draftId]
    );
    throw error;
  }
}
