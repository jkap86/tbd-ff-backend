// BEFORE refactor: 251 lines
// AFTER refactor: 177 lines
// LINES SAVED: 74 lines

import { Request, Response } from "express";
import {
  selectKeeper,
  removeKeeper,
  getKeepersByRoster,
  getKeepersByLeague
} from "../services/keeperService";
import { finalizeKeepers } from "../services/dynastyService";
import { getLeagueById } from "../models/League";
import { BaseController } from "./BaseController";

class KeeperController extends BaseController {
  /**
   * Select a keeper for a roster
   * POST /api/v1/leagues/:leagueId/keepers
   */
  selectKeeper = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const { roster_id, player_id, season, kept_from_season, draft_round_penalty } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    // Validate required fields
    const validated = this.validateRequiredFields(req.body, [
      'roster_id',
      'player_id',
      'season',
      'kept_from_season'
    ]);

    if (!validated) {
      this.respondBadRequest(res, "Missing required fields: roster_id, player_id, season, kept_from_season");
      return;
    }

    // Verify league is dynasty/keeper type
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    if (league.league_type !== 'dynasty' && league.league_type !== 'keeper') {
      this.respondBadRequest(res, "Keeper selections only available for dynasty and keeper leagues");
      return;
    }

    // Select keeper
    const keeper = await selectKeeper({
      roster_id,
      player_id,
      season,
      kept_from_season,
      draft_round_penalty: draft_round_penalty || null
    });

    this.respondCreated(res, keeper, "Keeper selected successfully");
  });

  /**
   * Remove a keeper selection
   * DELETE /api/v1/leagues/:leagueId/keepers/:playerId
   */
  removeKeeper = this.asyncHandler(async (req: Request, res: Response) => {
    const { playerId } = req.params;
    const { roster_id, season } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    const validated = this.validateRequiredFields(req.body, ['roster_id', 'season']);
    if (!validated) {
      this.respondBadRequest(res, "Missing required fields: roster_id, season");
      return;
    }

    const removed = await removeKeeper(roster_id, playerId, season);

    if (removed) {
      this.respondSuccess(res, null, "Keeper removed successfully");
    } else {
      this.respondNotFound(res, "Keeper not found");
    }
  });

  /**
   * Get all keepers for a league
   * GET /api/v1/leagues/:leagueId/keepers
   */
  getLeagueKeepers = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const { season } = req.query;

    if (!season) {
      this.respondBadRequest(res, "Season query parameter required");
      return;
    }

    const keepers = await getKeepersByLeague(parseInt(leagueId), season as string);

    this.respondSuccess(res, keepers);
  });

  /**
   * Get keepers for a specific roster
   * GET /api/v1/rosters/:rosterId/keepers
   */
  getRosterKeepers = this.asyncHandler(async (req: Request, res: Response) => {
    const { rosterId } = req.params;
    const { season } = req.query;

    if (!season) {
      this.respondBadRequest(res, "Season query parameter required");
      return;
    }

    const keepers = await getKeepersByRoster(parseInt(rosterId), season as string);

    this.respondSuccess(res, keepers);
  });

  /**
   * Finalize all keeper selections for a league (commissioner only)
   * POST /api/v1/leagues/:leagueId/keepers/finalize
   */
  finalizeKeepers = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const { season } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      this.respondUnauthorized(res, "Not authenticated");
      return;
    }

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (commissionerId !== userId) {
      this.respondForbidden(res, "Only the commissioner can finalize keepers");
      return;
    }

    const result = await finalizeKeepers(parseInt(leagueId), season);

    this.respondSuccess(res, { keeperCount: result.keeperCount }, result.message);
  });
}

const controller = new KeeperController();

export const selectKeeperHandler = controller.selectKeeper;
export const removeKeeperHandler = controller.removeKeeper;
export const getLeagueKeepersHandler = controller.getLeagueKeepers;
export const getRosterKeepersHandler = controller.getRosterKeepers;
export const finalizeKeepersHandler = controller.finalizeKeepers;
