import { Request, Response } from "express";
import {
  Draft,
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraft,
  resetDraft,
} from "../models/Draft";
import { io } from "../index";
import {
  emitDraftPick,
  emitDraftStatusChange,
  emitDraftOrderUpdate,
  startTimerBroadcast,
  stopTimerBroadcast,
} from "../socket/draftSocket";
import {
  setDraftOrder,
  getDraftOrder,
  getDraftOrderWithDetails,
  randomizeDraftOrder,
  getRosterAtPosition,
} from "../models/DraftOrder";
import {
  getDraftPicks,
  getDraftPicksWithDetails,
} from "../models/DraftPick";
import { getAvailablePlayersForDraft } from "../models/Player";
import { getRostersByLeagueId, getRosterById } from "../models/Roster";
import { getLeagueById, updateLeague } from "../models/League";
import {
  startAutoPickMonitoring,
  stopAutoPickMonitoring,
} from "../services/autoPickService";
import { checkAndAutoPauseDraft } from "../services/draftScheduler";
import pool from "../config/database";
import { calculateADP } from "../services/adpService";

/**
 * Calculate which roster should be picking based on current pick number
 * Handles snake, linear, and 3rd round reversal logic
 */
export function calculateCurrentRoster(
  pickNumber: number,
  totalRosters: number,
  draftType: "snake" | "linear" | "auction" | "slow_auction",
  thirdRoundReversal: boolean
): { round: number; pickInRound: number; draftPosition: number} {
  // Auction drafts don't use traditional pick order
  if (draftType === "auction" || draftType === "slow_auction") {
    return { round: 1, pickInRound: 1, draftPosition: 1 };
  }
  const round = Math.ceil(pickNumber / totalRosters);
  const pickInRound = ((pickNumber - 1) % totalRosters) + 1;

  let draftPosition: number;

  if (draftType === "linear") {
    // Linear: same order every round
    draftPosition = pickInRound;
  } else {
    // Snake draft logic
    let isReversed: boolean;

    if (thirdRoundReversal && round === 3) {
      // Round 3 with reversal: goes forward (not reversed)
      isReversed = false;
    } else if (thirdRoundReversal && round > 3) {
      // After round 3 with reversal: adjust the pattern
      // Round 4 should be reversed, Round 5 forward, etc.
      isReversed = round % 2 === 0;
    } else {
      // Normal snake: odd rounds forward, even rounds reversed
      isReversed = round % 2 === 0;
    }

    draftPosition = isReversed ? totalRosters - pickInRound + 1 : pickInRound;
  }

  return { round, pickInRound, draftPosition };
}

/**
 * Create a new draft for a league
 * POST /api/drafts/create
 */
export async function createDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      league_id,
      draft_type = "snake",
      third_round_reversal = false,
      pick_time_seconds = 90,
      rounds = 15,
      timer_mode = "traditional",
      team_time_budget_seconds,
      settings = {},
    } = req.body;

    // Validate required fields
    if (!league_id) {
      res.status(400).json({
        success: false,
        message: "League ID is required",
      });
      return;
    }

    // Validate draft type
    if (!["snake", "linear", "auction", "slow_auction"].includes(draft_type)) {
      res.status(400).json({
        success: false,
        message: "Draft type must be 'snake', 'linear', 'auction', or 'slow_auction'",
      });
      return;
    }

    // Validate timer mode
    if (!["traditional", "chess"].includes(timer_mode)) {
      res.status(400).json({
        success: false,
        message: "Timer mode must be 'traditional' or 'chess'",
      });
      return;
    }

    // Validate chess timer requirements
    if (timer_mode === "chess") {
      if (!team_time_budget_seconds || team_time_budget_seconds <= 0) {
        res.status(400).json({
          success: false,
          message: "Chess timer mode requires a positive team_time_budget_seconds value",
        });
        return;
      }
    }

    // Check if league exists
    const league = await getLeagueById(league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if draft already exists for this league
    const existingDraft = await getDraftByLeagueId(league_id);
    if (existingDraft) {
      res.status(400).json({
        success: false,
        message: "Draft already exists for this league",
      });
      return;
    }

    // Create the draft
    const draft = await createDraft({
      league_id,
      draft_type,
      third_round_reversal,
      pick_time_seconds,
      rounds,
      timer_mode,
      team_time_budget_seconds,
      settings,
    });

    res.status(201).json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    console.error("Error creating draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating draft",
    });
  }
}

/**
 * Get draft by ID
 * GET /api/drafts/:draftId
 */
export async function getDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    console.error("Error getting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft",
    });
  }
}

/**
 * Update draft settings
 * PUT /api/drafts/:draftId/settings
 */
export async function updateDraftSettingsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { draft_type, third_round_reversal, pick_time_seconds, rounds, timer_mode, team_time_budget_seconds, settings } = req.body;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Only allow core draft settings updates if draft hasn't started
    // But allow settings (like overnight pause) to be updated anytime
    const isCoreSettingsUpdate = draft_type || typeof third_round_reversal === 'boolean' || pick_time_seconds || rounds || timer_mode || team_time_budget_seconds;
    if (isCoreSettingsUpdate && draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Cannot update draft type, rounds, or timer settings after draft has started",
      });
      return;
    }

    // Validate timer mode if provided
    if (timer_mode && !["traditional", "chess"].includes(timer_mode)) {
      res.status(400).json({
        success: false,
        message: "Timer mode must be 'traditional' or 'chess'",
      });
      return;
    }

    // Validate chess timer requirements
    const finalTimerMode = timer_mode || draft.timer_mode;
    const finalTimeBudget = team_time_budget_seconds !== undefined ? team_time_budget_seconds : draft.team_time_budget_seconds;

    if (finalTimerMode === "chess" && (!finalTimeBudget || finalTimeBudget <= 0)) {
      res.status(400).json({
        success: false,
        message: "Chess timer mode requires a positive team_time_budget_seconds value",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can update draft settings",
      });
      return;
    }

    // Update draft settings
    const updates: Partial<Draft> = {};
    if (draft_type) updates.draft_type = draft_type;
    if (typeof third_round_reversal === 'boolean') updates.third_round_reversal = third_round_reversal;
    if (pick_time_seconds) updates.pick_time_seconds = pick_time_seconds;
    if (rounds) updates.rounds = rounds;
    if (timer_mode) updates.timer_mode = timer_mode;
    if (team_time_budget_seconds !== undefined) updates.team_time_budget_seconds = team_time_budget_seconds;
    if (settings) updates.settings = settings;

    const updatedDraft = await updateDraft(parseInt(draftId), updates);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error updating draft settings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating draft settings",
    });
  }
}

/**
 * Get draft by league ID
 * GET /api/leagues/:leagueId/draft
 */
export async function getDraftByLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const userId = req.user?.userId;

    console.log('[Draft] getDraftByLeagueHandler called', {
      leagueId,
      userId,
      authenticated: !!userId,
    });

    const draft = await getDraftByLeagueId(parseInt(leagueId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found for this league",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    console.error("Error getting draft by league:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft by league",
    });
  }
}

/**
 * Set draft order (manual or randomized)
 * POST /api/drafts/:draftId/order
 */
export async function setDraftOrderHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { randomize, order } = req.body;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get commissioner ID from league settings
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can set draft order",
      });
      return;
    }

    // Don't allow changing order after draft has started
    if (draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Cannot change draft order after draft has started",
      });
      return;
    }

    if (randomize) {
      // Get all rosters for the league
      const rosters = await getRostersByLeagueId(draft.league_id);
      const rosterIds = rosters.map((r) => r.id);

      await randomizeDraftOrder(parseInt(draftId), rosterIds);
    } else if (order && Array.isArray(order)) {
      // Manual order: validate format
      if (
        !order.every(
          (item) =>
            item.roster_id && item.draft_position && typeof item.roster_id === "number" && typeof item.draft_position === "number"
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid order format. Each item must have roster_id and draft_position",
        });
        return;
      }

      // Get all rosters in the league
      const rosters = await getRostersByLeagueId(draft.league_id);
      const expectedRosterCount = rosters.length;

      // Validation 1: Count matches
      if (order.length !== expectedRosterCount) {
        res.status(400).json({
          success: false,
          message: `Draft order must include all ${expectedRosterCount} rosters`,
        });
        return;
      }

      // Validation 2: All roster IDs are valid
      const rosterIds = new Set(rosters.map(r => r.id));
      const orderRosterIds = order.map(o => o.roster_id);
      for (const rosterId of orderRosterIds) {
        if (!rosterIds.has(rosterId)) {
          res.status(400).json({
            success: false,
            message: `Roster ${rosterId} does not belong to this league`,
          });
          return;
        }
      }

      // Validation 3: No duplicate roster IDs
      const uniqueRosterIds = new Set(orderRosterIds);
      if (uniqueRosterIds.size !== order.length) {
        res.status(400).json({
          success: false,
          message: "Draft order contains duplicate roster IDs",
        });
        return;
      }

      // Validation 4: Positions are 1-N with no gaps or duplicates
      const positions = order.map(o => o.draft_position).sort((a, b) => a - b);
      for (let i = 0; i < positions.length; i++) {
        if (positions[i] !== i + 1) {
          res.status(400).json({
            success: false,
            message: `Draft positions must be 1-${expectedRosterCount} with no gaps or duplicates`,
          });
          return;
        }
      }

      // All validations passed, proceed with setting order
      await setDraftOrder(parseInt(draftId), order);
    } else {
      res.status(400).json({
        success: false,
        message: "Must provide either randomize=true or order array",
      });
      return;
    }

    // Get detailed draft order with team names and usernames
    const detailedDraftOrder = await getDraftOrderWithDetails(parseInt(draftId));

    // Emit draft order update via WebSocket
    emitDraftOrderUpdate(io, parseInt(draftId), detailedDraftOrder);

    // Return detailed draft order in HTTP response
    res.status(200).json({
      success: true,
      data: detailedDraftOrder,
    });
  } catch (error: any) {
    console.error("Error setting draft order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error setting draft order",
    });
  }
}

/**
 * Get draft order
 * GET /api/drafts/:draftId/order
 */
export async function getDraftOrderHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draftOrder = await getDraftOrderWithDetails(parseInt(draftId));

    res.status(200).json({
      success: true,
      data: draftOrder,
    });
  } catch (error: any) {
    console.error("Error getting draft order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft order",
    });
  }
}

/**
 * Start a draft
 * POST /api/drafts/:draftId/start
 */
export async function startDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { draftId } = req.params;

    // Lock the draft row to prevent concurrent state changes
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const draft = draftResult.rows[0];

    // Check if already started
    if (draft.status !== "not_started") {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Draft has already started",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);

    // For auction drafts, start is simpler - just set status
    if (draft.draft_type === "auction" || draft.draft_type === "slow_auction") {
      // Get first roster for turn tracking using draft order
      const draftOrder = await getDraftOrder(parseInt(draftId));
      let firstRosterId = null;

      if (draftOrder.length > 0) {
        // Use draft order (sorted by draft_position)
        const orderedRosters = draftOrder.sort((a, b) => a.draft_position - b.draft_position);
        firstRosterId = orderedRosters[0].roster_id;
      } else {
        // Fallback: use rosters sorted by roster_id if no draft order exists
        const { getRostersByLeagueId } = await import("../models/Roster");
        const rosters = await getRostersByLeagueId(draft.league_id);
        rosters.sort((a, b) => a.roster_id - b.roster_id);
        firstRosterId = rosters.length > 0 ? rosters[0].id : null;
      }

      // Start the draft using transaction client
      const updateDraftResult = await client.query(
        `UPDATE drafts
         SET status = 'in_progress',
             started_at = CURRENT_TIMESTAMP,
             current_roster_id = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [firstRosterId, draftId]
      );
      const updatedDraft = updateDraftResult.rows[0];

      // Commit transaction
      await client.query('COMMIT');

      // Update league status to 'drafting'
      if (league) {
        await updateLeague(league.id, { status: "drafting" });
      }

      // Emit draft status change via WebSocket
      emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

      // For regular auctions (not slow), start turn timer
      if (draft.draft_type === "auction" && firstRosterId) {
        const { scheduleTurnTimer } = await import("../socket/auctionSocket");
        scheduleTurnTimer(io, parseInt(draftId), firstRosterId, draft.pick_time_seconds);
      }

      res.status(200).json({
        success: true,
        data: updatedDraft,
      });
      return;
    }

    // For snake/linear drafts, check draft order and set current pick
    const draftOrder = await getDraftOrder(parseInt(draftId));
    if (draftOrder.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Draft order must be set before starting",
      });
      return;
    }

    // Calculate first roster to pick
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { draftPosition } = calculateCurrentRoster(
      1,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    const firstRosterId = await getRosterAtPosition(
      parseInt(draftId),
      draftPosition
    );

    // Set pick deadline for first pick
    const pickDeadline = new Date();
    pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

    // Update draft_order with deadline for first pick using transaction client
    await client.query(
      `UPDATE draft_order
       SET pick_expiration = $1, pick_number = $2
       WHERE draft_id = $3 AND roster_id = $4`,
      [pickDeadline, 1, draftId, firstRosterId]
    );

    // Start the draft using transaction client
    const updateDraftResult = await client.query(
      `UPDATE drafts
       SET status = 'in_progress',
           started_at = CURRENT_TIMESTAMP,
           current_pick = 1,
           current_round = 1,
           current_roster_id = $1,
           pick_deadline = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [firstRosterId, pickDeadline, draftId]
    );
    const updatedDraft = updateDraftResult.rows[0];

    // Commit transaction
    await client.query('COMMIT');

    // Update league status to 'drafting'
    if (league) {
      await updateLeague(league.id, { status: "drafting" });
    }

    // Start timer broadcast
    startTimerBroadcast(io, parseInt(draftId));

    // Emit draft status change via WebSocket with deadline
    emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

    // Broadcast initial timer state
    io.to(`draft_${draftId}`).emit("draft_started", {
      draft: updatedDraft,
      deadline: pickDeadline.toISOString(),
      server_time: new Date().toISOString(),
    });

    // Start auto-pick monitoring
    startAutoPickMonitoring(parseInt(draftId));

    // Check if draft should be immediately auto-paused for overnight
    await checkAndAutoPauseDraft(parseInt(draftId));

    // Get the latest draft state (may have been auto-paused)
    const finalDraft = await getDraftById(parseInt(draftId));

    res.status(200).json({
      success: true,
      data: finalDraft,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error starting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error starting draft",
    });
  } finally {
    client.release();
  }
}

/**
 * Make a draft pick
 * POST /api/drafts/:draftId/pick
 */
export async function makeDraftPickHandler(
  req: Request,
  res: Response
): Promise<void> {
  const pool = (await import("../config/database")).default;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { draftId } = req.params;
    const { roster_id, player_id, is_auto_pick = false } = req.body;

    if (!roster_id || !player_id) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "roster_id and player_id are required",
      });
      return;
    }

    // Lock the draft row to prevent concurrent picks
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const draft = draftResult.rows[0];

    // Check if draft is in progress
    if (draft.status !== "in_progress") {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Draft is not in progress",
      });
      return;
    }

    // Check if it's this roster's turn
    if (draft.current_roster_id !== roster_id) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "It is not this roster's turn to pick",
      });
      return;
    }

    // Verify that the user making the pick owns the roster (unless it's an auto-pick)
    if (!is_auto_pick) {
      const userId = req.user?.userId;
      if (!userId) {
        await client.query('ROLLBACK');
        res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
        return;
      }

      const roster = await getRosterById(roster_id);
      if (!roster) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "Roster not found",
        });
        return;
      }

      if (roster.user_id !== userId) {
        await client.query('ROLLBACK');
        res.status(403).json({
          success: false,
          message: "You can only make picks for your own roster",
        });
        return;
      }
    }

    // Check if player is already drafted (prevent double-draft)
    const existingPickResult = await client.query(
      'SELECT id FROM draft_picks WHERE draft_id = $1 AND player_id = $2',
      [draftId, player_id]
    );

    if (existingPickResult.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Player has already been drafted",
      });
      return;
    }

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
    const draftOrder = await getDraftOrder(parseInt(draftId));
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { round, pickInRound } = calculateCurrentRoster(
      draft.current_pick,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    // Create the pick using the transaction client
    // Wrap in try-catch to handle unique constraint violations gracefully
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
          parseInt(draftId),
          draft.current_pick,
          round,
          pickInRound,
          roster_id,
          player_id,
          is_auto_pick,
          pickTimeSeconds,
          null
        ]
      );
    } catch (insertError: any) {
      // Check if this is a unique constraint violation on (draft_id, player_id)
      if (insertError.code === '23505' && insertError.constraint?.includes('player_id')) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: "This player has already been drafted by another team",
        });
        return;
      }
      // Re-throw other errors
      throw insertError;
    }

    const pick = pickResult.rows[0];

    // Decrement chess timer budget if applicable
    if (draft.timer_mode === 'chess' && pickTimeSeconds !== null) {
      try {
        // Deduct the time used from the roster's remaining time budget
        const updateTimeResult = await client.query(
          `UPDATE draft_order
           SET time_remaining_seconds = GREATEST(0, time_remaining_seconds - $1),
               time_used_seconds = time_used_seconds + $1
           WHERE draft_id = $2 AND roster_id = $3
           RETURNING time_remaining_seconds, time_used_seconds`,
          [pickTimeSeconds, parseInt(draftId), roster_id]
        );

        if (updateTimeResult.rows.length > 0) {
          const { time_remaining_seconds, time_used_seconds } = updateTimeResult.rows[0];
          console.log(`[Draft] Chess timer: Roster ${roster_id} used ${pickTimeSeconds}s, ${time_remaining_seconds}s remaining, ${time_used_seconds}s total used`);
        } else {
          console.error(`[Draft] Failed to update chess timer: Roster ${roster_id} not found in draft_order`);
        }
      } catch (error) {
        console.error(`[Draft] Failed to update chess timer for roster ${roster_id}:`, error);
        // Don't fail the pick if timer update fails, just log it
      }
    }

    // Calculate next pick
    const nextPickNumber = draft.current_pick + 1;
    const totalPicks = totalRosters * draft.rounds;

    console.log(`Pick calculation - Current pick: ${draft.current_pick}, Next pick: ${nextPickNumber}, Total rosters: ${totalRosters}, Rounds: ${draft.rounds}, Total picks: ${totalPicks}`);

    let updatedDraft;

    if (nextPickNumber > totalPicks) {
      // Draft is complete
      console.log(`Draft ${draftId} is complete! Total picks: ${totalPicks}`);

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
      await assignDraftedPlayersToRosters(parseInt(draftId));

      // Update league status to 'in_season'
      const league = await getLeagueById(draft.league_id);
      console.log(`League before update:`, league ? `ID ${league.id}, Status: ${league.status}` : 'not found');
      if (league) {
        const updatedLeague = await updateLeague(league.id, { status: "in_season" });
        console.log(`League after update:`, updatedLeague ? `ID ${updatedLeague.id}, Status: ${updatedLeague.status}` : 'update failed');

        const startWeek = league.settings?.start_week || 1;
        const playoffWeekStart = league.settings?.playoff_week_start || 15;

        // Generate matchups if they don't exist (e.g., after league reset)
        console.log(`[DraftComplete] Checking/generating matchups...`);
        const { generateMatchupsForWeek } = await import("../models/Matchup");
        const { getMatchupsByLeagueAndWeek } = await import("../models/Matchup");

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            const existingMatchups = await getMatchupsByLeagueAndWeek(league.id, week);
            if (existingMatchups.length === 0) {
              console.log(`[DraftComplete] Generating matchups for week ${week}...`);
              await generateMatchupsForWeek(league.id, week, league.season);
            }
          } catch (error) {
            console.error(`[DraftComplete] Failed to generate matchups for week ${week}:`, error);
          }
        }

        // Calculate scores for all weeks that have already occurred
        console.log(`[DraftComplete] Calculating scores for all weeks...`);
        const { updateMatchupScoresForWeek } = await import("../services/scoringService");
        const { finalizeWeekScores, recalculateAllRecords } = await import("../services/recordService");

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            console.log(`[DraftComplete] Updating scores for week ${week}...`);
            await updateMatchupScoresForWeek(league.id, week, league.season, "regular");
            await finalizeWeekScores(league.id, week, league.season, "regular");
          } catch (error) {
            console.error(`[DraftComplete] Failed to update scores for week ${week}:`, error);
          }
        }

        // Recalculate all records to ensure they're correct after score updates
        console.log(`[DraftComplete] Recalculating all records...`);
        try {
          await recalculateAllRecords(league.id, league.season);
        } catch (error) {
          console.error(`[DraftComplete] Failed to recalculate records:`, error);
        }
      }

      // Stop timer broadcasts
      stopTimerBroadcast(parseInt(draftId));

      // Stop auto-pick monitoring
      stopAutoPickMonitoring(parseInt(draftId));

      // Emit status change to notify clients that draft is complete
      console.log(`Emitting draft completion status for draft ${draftId}`);
      emitDraftStatusChange(io, parseInt(draftId), "completed", updatedDraft);

      // Trigger ADP recalculation (don't await - run in background)
      const season = league?.season || new Date().getFullYear().toString();
      calculateADP(season).catch(err =>
        console.error('Failed to update ADP after draft:', err)
      );
    } else {
      // Advance to next pick
      const nextPickInfo = calculateCurrentRoster(
        nextPickNumber,
        totalRosters,
        draft.draft_type,
        draft.third_round_reversal
      );

      const nextRosterId = await getRosterAtPosition(
        parseInt(draftId),
        nextPickInfo.draftPosition
      );

      const nextPickDeadline = new Date();
      nextPickDeadline.setSeconds(
        nextPickDeadline.getSeconds() + draft.pick_time_seconds
      );

      // Update draft_order with deadline for next pick
      await client.query(
        `UPDATE draft_order
         SET pick_expiration = $1, pick_number = $2
         WHERE draft_id = $3 AND roster_id = $4`,
        [nextPickDeadline, nextPickNumber, draftId, nextRosterId]
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
        [nextPickNumber, nextPickInfo.round, nextRosterId, nextPickDeadline, draftId]
      );
      updatedDraft = updateDraftResult.rows[0];

      // Commit transaction
      await client.query('COMMIT');
    }

    // Get player details and roster info for WebSocket emission (after successful commit)
    const { getPlayerById } = await import("../models/Player");
    const player = await getPlayerById(player_id);
    const roster = await getRosterById(roster_id);
    const { getUserById } = await import("../models/User");
    const user = roster?.user_id ? await getUserById(roster.user_id) : null;

    console.log(`[MakePick] Player details:`, {
      id: player?.id,
      full_name: player?.full_name,
      position: player?.position,
      team: player?.team,
    });
    console.log(`[MakePick] Roster details:`, {
      id: roster?.id,
      roster_id: roster?.roster_id,
      user_id: roster?.user_id,
    });
    console.log(`[MakePick] User details:`, { username: user?.username });

    // Emit draft pick via WebSocket with player details and next deadline
    const pickWithDetails = {
      ...pick,
      player_name: player?.full_name,
      player_position: player?.position,
      player_team: player?.team,
      roster_number: roster?.roster_id,
      picked_by_username: user?.username,
    };
    console.log(`[MakePick] Emitting pick with details:`, pickWithDetails);

    // Include next deadline if draft continues
    if (updatedDraft.status === "in_progress" && updatedDraft.pick_deadline) {
      io.to(`draft_${draftId}`).emit("pick_made", {
        pick: pickWithDetails,
        draft: updatedDraft,
        next_deadline: updatedDraft.pick_deadline.toISOString(),
        server_time: new Date().toISOString(),
        timestamp: new Date(),
      });
    } else {
      emitDraftPick(io, parseInt(draftId), pickWithDetails, updatedDraft);
    }

    res.status(201).json({
      success: true,
      data: {
        pick,
        draft: updatedDraft,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error making draft pick:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error making draft pick",
    });
  } finally {
    client.release();
  }
}

/**
 * Get all picks for a draft
 * GET /api/drafts/:draftId/picks
 */
export async function getDraftPicksHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { withDetails } = req.query;

    let picks;
    if (withDetails === "true") {
      picks = await getDraftPicksWithDetails(parseInt(draftId));
    } else {
      picks = await getDraftPicks(parseInt(draftId));
    }

    res.status(200).json({
      success: true,
      data: picks,
    });
  } catch (error: any) {
    console.error("Error getting draft picks:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft picks",
    });
  }
}

/**
 * Get available players for a draft
 * GET /api/drafts/:draftId/players/available
 */
export async function getAvailablePlayersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { position, team, search } = req.query;

    const players = await getAvailablePlayersForDraft(parseInt(draftId), {
      position: position as string,
      team: team as string,
      search: search as string,
    });

    res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error: any) {
    console.error("Error getting available players:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting available players",
    });
  }
}

/**
 * Pause draft
 * POST /api/drafts/:draftId/pause
 */
export async function pauseDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { draftId } = req.params;

    // Lock the draft row to prevent concurrent state changes
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const draft = draftResult.rows[0];

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      await client.query('ROLLBACK');
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: "Only the commissioner can pause the draft",
      });
      return;
    }

    if (draft.status !== "in_progress") {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Draft is not in progress",
      });
      return;
    }

    // Pause the draft using transaction client
    const updateDraftResult = await client.query(
      `UPDATE drafts
       SET status = 'paused',
           pick_deadline = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [draftId]
    );
    const updatedDraft = updateDraftResult.rows[0];

    // Commit transaction
    await client.query('COMMIT');

    // Stop timer broadcasts
    stopTimerBroadcast(parseInt(draftId));

    // Stop auto-pick monitoring when paused
    stopAutoPickMonitoring(parseInt(draftId));

    // Cancel turn timer for auctions
    if (draft.draft_type === "auction" || draft.draft_type === "slow_auction") {
      const { cancelTurnTimer } = await import("../socket/auctionSocket");
      cancelTurnTimer(parseInt(draftId));
    }

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "paused", updatedDraft);

    io.to(`draft_${draftId}`).emit("draft_paused", {
      draft: updatedDraft,
    });

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error pausing draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error pausing draft",
    });
  } finally {
    client.release();
  }
}

/**
 * Resume draft
 * POST /api/drafts/:draftId/resume
 */
export async function resumeDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { draftId } = req.params;

    // Lock the draft row to prevent concurrent state changes
    const draftResult = await client.query(
      'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const draft = draftResult.rows[0];

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      await client.query('ROLLBACK');
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: "Only the commissioner can resume the draft",
      });
      return;
    }

    if (draft.status !== "paused") {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Draft is not paused",
      });
      return;
    }

    // Calculate new deadline based on remaining time if possible
    let newDeadline: Date;

    // Query the current pick's expiration using transaction client
    const currentTurn = await client.query(
      `SELECT pick_expiration FROM draft_order
       WHERE draft_id = $1 AND pick_number = $2`,
      [draftId, draft.current_pick]
    );

    if (currentTurn.rows.length > 0 && currentTurn.rows[0].pick_expiration) {
      const previousDeadline = new Date(currentTurn.rows[0].pick_expiration);
      const pausedAt = new Date(draft.updated_at);
      const remainingMs = previousDeadline.getTime() - pausedAt.getTime();
      // Minimum 10 seconds
      newDeadline = new Date(Date.now() + Math.max(remainingMs, 10000));
    } else {
      newDeadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
    }

    // Update draft_order with new deadline using transaction client
    await client.query(
      `UPDATE draft_order
       SET pick_expiration = $1
       WHERE draft_id = $2 AND pick_number = $3`,
      [newDeadline, draftId, draft.current_pick]
    );

    // Resume the draft using transaction client
    const updateDraftResult = await client.query(
      `UPDATE drafts
       SET status = 'in_progress',
           pick_deadline = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newDeadline, draftId]
    );
    const updatedDraft = updateDraftResult.rows[0];

    // Commit transaction
    await client.query('COMMIT');

    // Restart timer broadcasts
    startTimerBroadcast(io, parseInt(draftId));

    // Restart auto-pick monitoring when resumed
    startAutoPickMonitoring(parseInt(draftId));

    // Restart turn timer for auctions
    if ((draft.draft_type === "auction" || draft.draft_type === "slow_auction") && updatedDraft.current_roster_id) {
      const { scheduleTurnTimer } = await import("../socket/auctionSocket");
      scheduleTurnTimer(io, parseInt(draftId), updatedDraft.current_roster_id, draft.pick_time_seconds);
    }

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

    io.to(`draft_${draftId}`).emit("draft_resumed", {
      draft: updatedDraft,
      deadline: newDeadline.toISOString(),
      server_time: new Date().toISOString(),
    });

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error resuming draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resuming draft",
    });
  } finally {
    client.release();
  }
}

/**
 * Manually trigger roster assignment from draft picks
 * POST /api/drafts/:draftId/assign-rosters
 */
export async function assignRostersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    console.log(`[AssignRostersHandler] Manually triggering roster assignment for draft ${draftId}`);

    const { assignDraftedPlayersToRosters } = await import("../models/Draft");
    await assignDraftedPlayersToRosters(parseInt(draftId));

    console.log(`[AssignRostersHandler] Roster assignment completed successfully`);

    res.status(200).json({
      success: true,
      message: "Rosters assigned successfully",
    });
  } catch (error: any) {
    console.error("Error assigning rosters:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error assigning rosters",
    });
  }
}

/**
 * Reset draft - clears all picks and resets to not_started
 * POST /api/drafts/:draftId/reset
 */
export async function resetDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get commissioner ID from league settings
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can reset the draft",
      });
      return;
    }

    // Stop auto-pick monitoring
    stopAutoPickMonitoring(parseInt(draftId));

    // Reset the draft
    const updatedDraft = await resetDraft(parseInt(draftId));

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "not_started", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error resetting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resetting draft",
    });
  }
}

/**
 * Get draft health status
 * GET /api/drafts/:draftId/health
 */
export async function getDraftHealthHandler(req: Request, res: Response) {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    // Check for issues
    const issues: string[] = [];

    // Check if stuck (hasn't progressed in >10 minutes while in_progress)
    if (draft.status === 'in_progress') {
      const lastUpdate = new Date(draft.updated_at);
      const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 60000;

      if (minutesSinceUpdate > 10) {
        issues.push(`Draft hasn't progressed in ${minutesSinceUpdate.toFixed(0)} minutes`);
      }
    }

    // Check for duplicate picks
    const duplicateCheck = await pool.query(
      `SELECT player_id, COUNT(*) as count
       FROM draft_picks
       WHERE draft_id = $1
       GROUP BY player_id
       HAVING COUNT(*) > 1`,
      [draftId]
    );

    if (duplicateCheck.rows.length > 0) {
      issues.push(`${duplicateCheck.rows.length} players drafted multiple times`);
    }

    // Check budget integrity for auctions
    if (draft.draft_type === 'auction' || draft.draft_type === 'slow_auction') {
      const budgetCheck = await pool.query(
        `SELECT r.id, r.settings->>'team_name' as team_name,
          COALESCE(SUM(ab.bid_amount), 0) as spent,
          $1 as budget
         FROM rosters r
         LEFT JOIN auction_bids ab ON ab.roster_id = r.id AND ab.is_winning = true
         WHERE r.league_id = (SELECT league_id FROM drafts WHERE id = $2)
         GROUP BY r.id
         HAVING COALESCE(SUM(ab.bid_amount), 0) > $1`,
        [draft.starting_budget, draftId]
      );

      if (budgetCheck.rows.length > 0) {
        issues.push(`${budgetCheck.rows.length} rosters exceeded budget`);
      }
    }

    return res.json({
      success: true,
      data: {
        draft,
        health: issues.length === 0 ? 'healthy' : 'issues_detected',
        issues,
      },
    });

  } catch (error: any) {
    console.error('Error checking draft health:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
