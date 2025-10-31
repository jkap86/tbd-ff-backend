import { Request, Response } from "express";
import {
  createDraftDerby,
  getDraftDerbyByDraftId,
  getDraftDerbyWithDetails,
  startDraftDerby,
  makeDerbySelection,
  skipDerbyTurn,
  autoAssignDerbyPosition,
} from "../models/DraftDerby";
import { getDraftById } from "../models/Draft";
import { getRostersByLeagueId } from "../models/Roster";
import { setDraftOrder } from "../models/DraftOrder";
import { getLeagueById } from "../models/League";
import {
  emitDerbyUpdate,
  emitDerbySelectionMade,
  emitDerbyTurnChanged,
  emitDerbyCompleted,
} from "../socket/derbySocket";

/**
 * Create and start a draft derby
 * POST /api/drafts/:draftId/derby/create
 */
export async function createDerbyHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get draft
    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if derby is enabled
    if (!draft.derby_enabled) {
      res.status(400).json({
        success: false,
        message: "Derby is not enabled for this draft",
      });
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get commissioner ID from league settings
    const commissionerId =
      typeof league.settings === "object" && league.settings !== null
        ? (league.settings as any).commissioner_user_id
        : null;

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can create the derby",
      });
      return;
    }

    // Check draft status
    if (draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Derby can only be created before draft starts",
      });
      return;
    }

    // Check for auction drafts
    if (draft.draft_type === "auction" || draft.draft_type === "slow_auction") {
      res.status(400).json({
        success: false,
        message: "Derby is not available for auction drafts",
      });
      return;
    }

    // Check if derby already exists
    const existingDerby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (existingDerby) {
      res.status(400).json({
        success: false,
        message: "Derby already exists for this draft",
      });
      return;
    }

    // Get all rosters
    const rosters = await getRostersByLeagueId(draft.league_id);
    const rosterIds = rosters.map((r) => r.id);

    if (rosterIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "No rosters found for this league",
      });
      return;
    }

    // Create derby
    const derby = await createDraftDerby(parseInt(draftId), rosterIds);

    res.status(201).json({
      success: true,
      data: derby,
      message: "Derby created successfully",
    });
  } catch (error: any) {
    console.error("Create derby error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating derby",
    });
  }
}

/**
 * Start the derby
 * POST /api/drafts/:draftId/derby/start
 */
export async function startDerbyHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get draft
    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId =
      typeof league.settings === "object" && league.settings !== null
        ? (league.settings as any).commissioner_user_id
        : null;

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can start the derby",
      });
      return;
    }

    // Start derby
    const derby = await startDraftDerby(parseInt(draftId));

    // Emit socket event
    emitDerbyUpdate(parseInt(draftId), derby);
    emitDerbyTurnChanged(parseInt(draftId), derby.current_turn_roster_id!);

    res.status(200).json({
      success: true,
      data: derby,
      message: "Derby started successfully",
    });
  } catch (error: any) {
    console.error("Start derby error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error starting derby",
    });
  }
}

/**
 * Get derby status and details
 * GET /api/drafts/:draftId/derby
 */
export async function getDerbyHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const derby = await getDraftDerbyWithDetails(parseInt(draftId));

    if (!derby) {
      res.status(404).json({
        success: false,
        message: "Derby not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: derby,
    });
  } catch (error: any) {
    console.error("Get derby error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting derby",
    });
  }
}

/**
 * Make a derby selection
 * POST /api/drafts/:draftId/derby/select
 */
export async function makeDerbySelectionHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { roster_id, draft_position } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Validate inputs
    if (!roster_id || !draft_position) {
      res.status(400).json({
        success: false,
        message: "roster_id and draft_position are required",
      });
      return;
    }

    // Make selection
    const selection = await makeDerbySelection(
      parseInt(draftId),
      roster_id,
      draft_position
    );

    // Get updated derby
    const derby = await getDraftDerbyWithDetails(parseInt(draftId));

    if (!derby) {
      throw new Error("Derby not found after selection");
    }

    // Emit socket events
    emitDerbySelectionMade(parseInt(draftId), selection);
    emitDerbyUpdate(parseInt(draftId), derby);

    // Check if derby is complete
    if (derby.status === "completed") {
      // Apply selections to draft order
      const draftOrderData = derby.selections.map((s) => ({
        roster_id: s.roster_id,
        draft_position: s.draft_position,
      }));

      await setDraftOrder(parseInt(draftId), draftOrderData);

      // Emit completion event
      emitDerbyCompleted(parseInt(draftId));
    } else {
      // Emit turn change
      if (derby.current_turn_roster_id) {
        emitDerbyTurnChanged(parseInt(draftId), derby.current_turn_roster_id);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        selection,
        derby,
      },
      message: "Selection made successfully",
    });
  } catch (error: any) {
    console.error("Make derby selection error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error making selection",
    });
  }
}

/**
 * Skip current turn (for timeout or commissioner action)
 * POST /api/drafts/:draftId/derby/skip
 */
export async function skipDerbyTurnHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get draft to check settings
    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Verify commissioner or check timeout
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId =
      typeof league.settings === "object" && league.settings !== null
        ? (league.settings as any).commissioner_user_id
        : null;

    const isCommissioner = commissionerId === userId;

    // Check if derby timeout behavior is 'skip'
    if (draft.derby_timeout_behavior === "skip" || isCommissioner) {
      const derby = await skipDerbyTurn(parseInt(draftId));

      // Emit socket events
      emitDerbyUpdate(parseInt(draftId), derby);

      if (derby.current_turn_roster_id) {
        emitDerbyTurnChanged(parseInt(draftId), derby.current_turn_roster_id);
      }

      res.status(200).json({
        success: true,
        data: derby,
        message: "Turn skipped successfully",
      });
    } else if (draft.derby_timeout_behavior === "auto") {
      // Auto-assign random position
      const selection = await autoAssignDerbyPosition(parseInt(draftId));

      // Get updated derby
      const derby = await getDraftDerbyWithDetails(parseInt(draftId));

      if (!derby) {
        throw new Error("Derby not found after auto-assign");
      }

      // Emit socket events
      emitDerbySelectionMade(parseInt(draftId), selection);
      emitDerbyUpdate(parseInt(draftId), derby);

      // Check if derby is complete
      if (derby.status === "completed") {
        const draftOrderData = derby.selections.map((s) => ({
          roster_id: s.roster_id,
          draft_position: s.draft_position,
        }));

        await setDraftOrder(parseInt(draftId), draftOrderData);
        emitDerbyCompleted(parseInt(draftId));
      } else if (derby.current_turn_roster_id) {
        emitDerbyTurnChanged(parseInt(draftId), derby.current_turn_roster_id);
      }

      res.status(200).json({
        success: true,
        data: {
          selection,
          derby,
        },
        message: "Position auto-assigned due to timeout",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid timeout behavior",
      });
    }
  } catch (error: any) {
    console.error("Skip derby turn error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error skipping turn",
    });
  }
}
