import { Request, Response } from "express";
import { BaseController } from "./BaseController";
import {
  createOpponentSelectionDraft,
  getOpponentSelectionDraftByLeague,
  startOpponentSelectionDraft,
  makeOpponentSelectionPick,
  getOpponentSelectionDraftPicksWithDetails,
  deleteOpponentSelectionDraft,
} from "../models/OpponentSelectionDraft";
import { getOpponentSelectionOrder } from "../models/OpponentSelectionOrder";
import { getLeagueById } from "../models/League";

class OpponentSelectionDraftController extends BaseController {
  /**
   * Create opponent selection draft
   * POST /api/opponent-selection-drafts (body: { league_id, time_limit_seconds })
   * POST /api/opponent-selection-drafts/league/:leagueId/create
   */
  createDraft = this.asyncHandler(async (req: Request, res: Response) => {
    // Support both URL param and body-based league ID
    const leagueId = req.params.leagueId
      ? this.validateId(req.params.leagueId, "League ID")
      : this.validateId(req.body.league_id, "League ID");
    const userId = this.getAuthenticatedUserId(req);

    // Verify league exists and user is commissioner
    const league = await getLeagueById(leagueId);
    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      return this.respondForbidden(res, "Only the commissioner can create opponent selection draft");
    }

    // Check if draft already exists
    const existingDraft = await getOpponentSelectionDraftByLeague(leagueId);
    if (existingDraft) {
      return this.respondBadRequest(res, "Opponent selection draft already exists for this league");
    }

    // Create draft - support both camelCase and snake_case
    const timeLimitSeconds = req.body.time_limit_seconds || req.body.timeLimitSeconds || 120;
    const draft = await createOpponentSelectionDraft(leagueId, timeLimitSeconds);

    this.respondCreated(res, draft, "Opponent selection draft created successfully");
  });

  /**
   * Get opponent selection draft by league
   * GET /api/opponent-selection-drafts/league/:leagueId
   */
  getDraftByLeague = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    const draft = await getOpponentSelectionDraftByLeague(leagueId);
    if (!draft) {
      return this.respondNotFound(res, "Opponent selection draft not found");
    }

    // Get picks
    const picks = await getOpponentSelectionDraftPicksWithDetails(draft.id);

    // Get selection order
    const selectionOrder = await getOpponentSelectionOrder(leagueId);

    this.respondSuccess(res, {
      draft,
      picks,
      selectionOrder,
    });
  });

  /**
   * Start opponent selection draft
   * POST /api/opponent-selection-drafts/:draftId/start
   * Body: { first_roster_id: number }
   */
  startDraft = this.asyncHandler(async (req: Request, res: Response) => {
    const draftId = this.validateId(req.params.draftId, "Draft ID");
    const userId = this.getAuthenticatedUserId(req);

    // Get draft and verify
    const draft = await getOpponentSelectionDraftByLeague(0); // TODO: Get by draft ID
    if (!draft) {
      return this.respondNotFound(res, "Draft not found");
    }

    // Verify league and commissioner
    const league = await getLeagueById(draft.league_id);
    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      return this.respondForbidden(res, "Only the commissioner can start the draft");
    }

    if (draft.status !== 'pending') {
      return this.respondBadRequest(res, "Draft has already been started");
    }

    // Get first roster ID from body or determine from selection order
    let firstRosterId = req.body.first_roster_id;

    if (!firstRosterId) {
      // Get selection order to determine first picker
      const selectionOrder = await getOpponentSelectionOrder(draft.league_id);
      if (selectionOrder.length === 0) {
        return this.respondBadRequest(res, "No selection order set");
      }

      const firstPicker = selectionOrder.find(order => order.selection_position === 1);
      if (!firstPicker) {
        return this.respondBadRequest(res, "Could not determine first picker");
      }

      firstRosterId = firstPicker.roster_id;
    }

    const updatedDraft = await startOpponentSelectionDraft(draftId, firstRosterId);

    this.respondSuccess(res, updatedDraft, "Draft started successfully");
  });

  /**
   * Make opponent selection pick
   * POST /api/opponent-selection-drafts/:draftId/pick
   */
  makePick = this.asyncHandler(async (req: Request, res: Response) => {
    const draftId = this.validateId(req.params.draftId, "Draft ID");
    // TODO: const userId = this.getAuthenticatedUserId(req);

    const { opponentRosterId, week } = req.body;

    if (!opponentRosterId || !week) {
      return this.respondBadRequest(res, "Opponent roster ID and week are required");
    }

    // Get draft
    const draft = await getOpponentSelectionDraftByLeague(0); // TODO: Get by draft ID
    if (!draft) {
      return this.respondNotFound(res, "Draft not found");
    }

    if (draft.status !== 'in_progress') {
      return this.respondBadRequest(res, "Draft is not in progress");
    }

    // TODO: Verify it's the user's turn
    // TODO: Verify opponent is valid
    // TODO: Verify week is valid

    // Get selection order to determine next picker
    const selectionOrder = await getOpponentSelectionOrder(draft.league_id);
    const currentIndex = selectionOrder.findIndex(
      order => order.roster_id === draft.current_turn_roster_id
    );

    let nextRosterId: number | null = null;
    if (currentIndex < selectionOrder.length - 1) {
      nextRosterId = selectionOrder[currentIndex + 1].roster_id;
    }

    // Make pick
    const pick = await makeOpponentSelectionPick(
      draftId,
      draft.current_turn_roster_id!,
      opponentRosterId,
      week,
      nextRosterId
    );

    this.respondSuccess(res, pick, "Pick made successfully");
  });

  /**
   * Delete opponent selection draft
   * DELETE /api/opponent-selection-drafts/:draftId
   */
  deleteDraft = this.asyncHandler(async (req: Request, res: Response) => {
    const draftId = this.validateId(req.params.draftId, "Draft ID");
    // TODO: Verify user is commissioner
    // const userId = this.getAuthenticatedUserId(req);

    await deleteOpponentSelectionDraft(draftId);

    this.respondSuccess(res, null, "Draft deleted successfully");
  });
}

const controller = new OpponentSelectionDraftController();

export const createOpponentSelectionDraftHandler = controller.createDraft;
export const getOpponentSelectionDraftByLeagueHandler = controller.getDraftByLeague;
export const startOpponentSelectionDraftHandler = controller.startDraft;
export const makeOpponentSelectionPickHandler = controller.makePick;
export const deleteOpponentSelectionDraftHandler = controller.deleteDraft;
