// Original: 225 lines | Refactored: 138 lines | Saved: 87 lines
import { Request, Response } from "express";
import {
  proposeTrade,
  acceptTrade,
  declineTrade,
  getTradeablePicksByRoster,
  getTradesByLeague
} from "../services/draftPickTradeService";
import { getLeagueById } from "../models/League";
import { BaseController } from "./BaseController";

class DraftPickTradeController extends BaseController {
  /**
   * Propose a draft pick trade
   * POST /api/v1/leagues/:leagueId/draft-picks/trade
   */
  proposeDraftPickTrade = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const { from_roster_id, to_roster_id, season, round, original_roster_id } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    // Validate required fields
    const validated = this.validateRequiredFields(req.body, [
      "from_roster_id",
      "to_roster_id",
      "season",
      "round"
    ]);

    if (!validated) {
      this.respondBadRequest(
        res,
        "Missing required fields: from_roster_id, to_roster_id, season, round"
      );
      return;
    }

    // Verify league is dynasty
    const leagueIdNum = this.validateId(leagueId, "League ID");
    const league = await getLeagueById(leagueIdNum);

    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    if (league.league_type !== 'dynasty') {
      this.respondBadRequest(
        res,
        "Draft pick trading only available for dynasty leagues"
      );
      return;
    }

    // Propose trade
    const trade = await proposeTrade({
      league_id: leagueIdNum,
      from_roster_id,
      to_roster_id,
      season,
      round,
      original_roster_id
    });

    this.respondCreated(res, trade, "Draft pick trade proposed successfully");
  });

  /**
   * Accept a draft pick trade
   * POST /api/v1/draft-picks/trade/:tradeId/accept
   */
  acceptDraftPickTrade = this.asyncHandler(async (req: Request, res: Response) => {
    const { tradeId } = req.params;
    const { roster_id } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    if (!roster_id) {
      this.respondBadRequest(res, "roster_id is required");
      return;
    }

    const tradeIdNum = this.validateId(tradeId, "Trade ID");
    const trade = await acceptTrade(tradeIdNum, roster_id);

    this.respondSuccess(res, trade, "Draft pick trade accepted");
  });

  /**
   * Decline a draft pick trade
   * POST /api/v1/draft-picks/trade/:tradeId/decline
   */
  declineDraftPickTrade = this.asyncHandler(async (req: Request, res: Response) => {
    const { tradeId } = req.params;
    const { roster_id } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    if (!roster_id) {
      this.respondBadRequest(res, "roster_id is required");
      return;
    }

    const tradeIdNum = this.validateId(tradeId, "Trade ID");
    const trade = await declineTrade(tradeIdNum, roster_id);

    this.respondSuccess(res, trade, "Draft pick trade declined");
  });

  /**
   * Get all draft pick trades for a league
   * GET /api/v1/leagues/:leagueId/draft-picks/trades
   */
  getLeagueDraftPickTrades = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const leagueIdNum = this.validateId(leagueId, "League ID");
    const trades = await getTradesByLeague(leagueIdNum);
    this.respondSuccess(res, trades);
  });

  /**
   * Get tradeable picks for a roster
   * GET /api/v1/rosters/:rosterId/draft-picks/tradeable
   */
  getTradeablePicks = this.asyncHandler(async (req: Request, res: Response) => {
    const { rosterId } = req.params;
    const { league_id, season } = req.query;

    if (!league_id || !season) {
      this.respondBadRequest(
        res,
        "league_id and season query parameters required"
      );
      return;
    }

    const rosterIdNum = this.validateId(rosterId, "Roster ID");
    const picks = await getTradeablePicksByRoster(
      rosterIdNum,
      parseInt(league_id as string),
      season as string
    );

    this.respondSuccess(res, picks);
  });
}

const draftPickTradeController = new DraftPickTradeController();

export const proposeDraftPickTradeHandler = draftPickTradeController.proposeDraftPickTrade;
export const acceptDraftPickTradeHandler = draftPickTradeController.acceptDraftPickTrade;
export const declineDraftPickTradeHandler = draftPickTradeController.declineDraftPickTrade;
export const getLeagueDraftPickTradesHandler = draftPickTradeController.getLeagueDraftPickTrades;
export const getTradeablePicksHandler = draftPickTradeController.getTradeablePicks;
