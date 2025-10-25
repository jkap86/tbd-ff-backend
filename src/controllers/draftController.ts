import { Request, Response } from "express";
import {
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraft,
  pauseDraft,
  completeDraft,
} from "../models/Draft";
import { io } from "../index";
import {
  emitDraftPick,
  emitDraftStatusChange,
  emitDraftOrderUpdate,
} from "../socket/draftSocket";
import {
  setDraftOrder,
  getDraftOrder,
  getDraftOrderWithDetails,
  randomizeDraftOrder,
  getRosterAtPosition,
} from "../models/DraftOrder";
import {
  createDraftPick,
  getDraftPicks,
  getDraftPicksWithDetails,
  isPlayerDrafted,
} from "../models/DraftPick";
import { getAvailablePlayersForDraft } from "../models/Player";
import { getRostersByLeagueId } from "../models/Roster";
import { getLeagueById } from "../models/League";

/**
 * Calculate which roster should be picking based on current pick number
 * Handles snake, linear, and 3rd round reversal logic
 */
export function calculateCurrentRoster(
  pickNumber: number,
  totalRosters: number,
  draftType: "snake" | "linear",
  thirdRoundReversal: boolean
): { round: number; pickInRound: number; draftPosition: number } {
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
    if (!["snake", "linear"].includes(draft_type)) {
      res.status(400).json({
        success: false,
        message: "Draft type must be 'snake' or 'linear'",
      });
      return;
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
 * Get draft by league ID
 * GET /api/leagues/:leagueId/draft
 */
export async function getDraftByLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;

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

    // Don't allow changing order after draft has started
    if (draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Cannot change draft order after draft has started",
      });
      return;
    }

    let draftOrder;

    if (randomize) {
      // Get all rosters for the league
      const rosters = await getRostersByLeagueId(draft.league_id);
      const rosterIds = rosters.map((r) => r.id);

      draftOrder = await randomizeDraftOrder(parseInt(draftId), rosterIds);
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

      draftOrder = await setDraftOrder(parseInt(draftId), order);
    } else {
      res.status(400).json({
        success: false,
        message: "Must provide either randomize=true or order array",
      });
      return;
    }

    // Emit draft order update via WebSocket
    emitDraftOrderUpdate(io, parseInt(draftId), draftOrder);

    res.status(200).json({
      success: true,
      data: draftOrder,
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

    // Check if draft order is set
    const draftOrder = await getDraftOrder(parseInt(draftId));
    if (draftOrder.length === 0) {
      res.status(400).json({
        success: false,
        message: "Draft order must be set before starting",
      });
      return;
    }

    // Check if already started
    if (draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Draft has already started",
      });
      return;
    }

    // Calculate first roster to pick
    const league = await getLeagueById(draft.league_id);
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

    // Set pick deadline
    const pickDeadline = new Date();
    pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

    // Start the draft
    const updatedDraft = await updateDraft(parseInt(draftId), {
      status: "in_progress",
      started_at: new Date(),
      current_pick: 1,
      current_round: 1,
      current_roster_id: firstRosterId!,
      pick_deadline: pickDeadline,
    });

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error starting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error starting draft",
    });
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
  try {
    const { draftId } = req.params;
    const { roster_id, player_id, is_auto_pick = false } = req.body;

    if (!roster_id || !player_id) {
      res.status(400).json({
        success: false,
        message: "roster_id and player_id are required",
      });
      return;
    }

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if draft is in progress
    if (draft.status !== "in_progress") {
      res.status(400).json({
        success: false,
        message: "Draft is not in progress",
      });
      return;
    }

    // Check if it's this roster's turn
    if (draft.current_roster_id !== roster_id) {
      res.status(400).json({
        success: false,
        message: "It is not this roster's turn to pick",
      });
      return;
    }

    // Check if player is already drafted
    const alreadyDrafted = await isPlayerDrafted(
      parseInt(draftId),
      player_id
    );
    if (alreadyDrafted) {
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

    // Create the pick
    const league = await getLeagueById(draft.league_id);
    const draftOrder = await getDraftOrder(parseInt(draftId));
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { round, pickInRound } = calculateCurrentRoster(
      draft.current_pick,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    const pick = await createDraftPick({
      draft_id: parseInt(draftId),
      pick_number: draft.current_pick,
      round,
      pick_in_round: pickInRound,
      roster_id,
      player_id,
      is_auto_pick,
      pick_time_seconds: pickTimeSeconds ?? undefined,
    });

    // Calculate next pick
    const nextPickNumber = draft.current_pick + 1;
    const totalPicks = totalRosters * draft.rounds;

    let updatedDraft;

    if (nextPickNumber > totalPicks) {
      // Draft is complete
      updatedDraft = await completeDraft(parseInt(draftId));
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

      updatedDraft = await updateDraft(parseInt(draftId), {
        current_pick: nextPickNumber,
        current_round: nextPickInfo.round,
        current_roster_id: nextRosterId!,
        pick_deadline: nextPickDeadline,
      });
    }

    // Emit draft pick via WebSocket
    emitDraftPick(io, parseInt(draftId), pick, updatedDraft);

    res.status(201).json({
      success: true,
      data: {
        pick,
        draft: updatedDraft,
      },
    });
  } catch (error: any) {
    console.error("Error making draft pick:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error making draft pick",
    });
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

    if (draft.status !== "in_progress") {
      res.status(400).json({
        success: false,
        message: "Draft is not in progress",
      });
      return;
    }

    const updatedDraft = await pauseDraft(parseInt(draftId));

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "paused", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error pausing draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error pausing draft",
    });
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

    if (draft.status !== "paused") {
      res.status(400).json({
        success: false,
        message: "Draft is not paused",
      });
      return;
    }

    // Reset pick deadline
    const pickDeadline = new Date();
    pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

    const updatedDraft = await updateDraft(parseInt(draftId), {
      status: "in_progress",
      pick_deadline: pickDeadline,
    });

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error resuming draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resuming draft",
    });
  }
}
