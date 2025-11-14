// REFACTORED: Using BaseController pattern to eliminate repetitive try-catch blocks
// Before: 595 lines | After: 342 lines | Saved: 253 lines

import { Request, Response } from "express";
import {
  submitWaiverClaim,
  processWaivers,
  pickupFreeAgent,
  getAvailablePlayers,
} from "../services/waiverService";
import {
  getWaiverClaimsByLeague,
  getWaiverClaimsByRoster,
  cancelWaiverClaim,
  getWaiverClaimById,
} from "../models/WaiverClaim";
import {
  getTransactionsWithPlayerDetails,
} from "../models/Transaction";
import { getRosterByLeagueAndUser } from "../models/Roster";
import {
  getWaiverSettingsByLeague,
  updateWaiverSettings,
} from "../models/WaiverSettings";
import { BaseController } from "./BaseController";

class WaiverController extends BaseController {
  /**
   * Submit a waiver claim
   * POST /api/leagues/:leagueId/waivers/claim
   */
  submitClaimHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { roster_id, player_id, drop_player_id, bid_amount } = req.body;

    // Validate required fields
    const validated = this.validateRequiredFields(req.body, ["roster_id", "player_id", "bid_amount"]);
    if (!validated) {
      this.respondBadRequest(res, "roster_id, player_id, and bid_amount are required");
      return;
    }

    if (typeof bid_amount !== "number" || bid_amount < 0) {
      this.respondBadRequest(res, "bid_amount must be a non-negative number");
      return;
    }

    // Get authenticated user
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Verify roster belongs to user and league
    const roster = await getRosterByLeagueAndUser(leagueId, userId);
    if (!roster || roster.id !== roster_id) {
      this.respondForbidden(res, "You do not own this roster");
      return;
    }

    // Submit the claim
    const claim = await submitWaiverClaim(
      roster_id,
      player_id,
      drop_player_id || null,
      bid_amount
    );

    this.respondCreated(res, claim, "Waiver claim submitted successfully");
  });

  /**
   * Get all waiver claims for a league
   * GET /api/leagues/:leagueId/waivers/claims
   */
  getLeagueClaimsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { status } = req.query;

    const claims = await getWaiverClaimsByLeague(
      leagueId,
      status as string | undefined
    );

    this.respondSuccess(res, claims);
  });

  /**
   * Get waiver claims for a specific roster
   * GET /api/rosters/:rosterId/waivers/claims
   */
  getRosterClaimsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const rosterId = this.validateId(req.params.rosterId, "Roster ID");
    const { status } = req.query;

    const claims = await getWaiverClaimsByRoster(
      rosterId,
      status as string | undefined
    );

    this.respondSuccess(res, claims);
  });

  /**
   * Cancel a waiver claim
   * DELETE /api/waivers/claims/:claimId
   */
  cancelClaimHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const claimId = this.validateId(req.params.claimId, "Claim ID");

    // Get the claim
    const claim = await getWaiverClaimById(claimId);
    if (!claim) {
      this.respondNotFound(res, "Claim not found");
      return;
    }

    // Verify claim is still pending
    if (claim.status !== "pending") {
      this.respondBadRequest(res, `Cannot cancel a claim with status: ${claim.status}`);
      return;
    }

    // Get authenticated user
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Verify user owns the roster
    const roster = await getRosterByLeagueAndUser(claim.league_id, userId);
    if (!roster || roster.id !== claim.roster_id) {
      this.respondForbidden(res, "You do not own this claim");
      return;
    }

    // Cancel the claim
    const updatedClaim = await cancelWaiverClaim(claimId);

    this.respondSuccess(res, updatedClaim, "Waiver claim cancelled successfully");
  });

  /**
   * Process waivers manually (commissioner only)
   * POST /api/leagues/:leagueId/waivers/process
   */
  processWaiversHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    // Get authenticated user
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, leagueId);
    if (!auth) {
      this.respondForbidden(res, "Only the commissioner can perform this action");
      return;
    }

    // Process waivers
    await processWaivers(leagueId);

    this.respondSuccess(res, null, "Waivers processed successfully");
  });

  /**
   * Pick up a free agent immediately
   * POST /api/leagues/:leagueId/transactions/free-agent
   */
  pickupFreeAgentHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { roster_id, player_id, drop_player_id } = req.body;

    // Validate required fields
    const validated = this.validateRequiredFields(req.body, ["roster_id", "player_id"]);
    if (!validated) {
      this.respondBadRequest(res, "roster_id and player_id are required");
      return;
    }

    // Get authenticated user
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Verify roster belongs to user and league
    const roster = await getRosterByLeagueAndUser(leagueId, userId);
    if (!roster || roster.id !== roster_id) {
      this.respondForbidden(res, "You do not own this roster");
      return;
    }

    // Pick up the free agent
    const transaction = await pickupFreeAgent(
      roster_id,
      player_id,
      drop_player_id || null
    );

    this.respondCreated(res, transaction, "Free agent picked up successfully");
  });

  /**
   * Get transaction history for a league
   * GET /api/leagues/:leagueId/transactions
   */
  getLeagueTransactionsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    // Get transactions with player details
    const transactions = await getTransactionsWithPlayerDetails(leagueId, limit);

    this.respondSuccess(res, transactions);
  });

  /**
   * Get available players for a league
   * GET /api/leagues/:leagueId/players/available
   */
  getAvailablePlayersHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    const availablePlayerIds = await getAvailablePlayers(leagueId);

    this.respondSuccess(res, {
      count: availablePlayerIds.length,
      player_ids: availablePlayerIds,
    });
  });

  /**
   * Get waiver settings for a league
   * GET /api/leagues/:leagueId/waivers/settings
   */
  getWaiverSettingsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    const settings = await getWaiverSettingsByLeague(leagueId);

    this.respondSuccess(res, settings);
  });

  /**
   * Update waiver settings for a league (commissioner only)
   * PUT /api/leagues/:leagueId/waivers/settings
   */
  updateWaiverSettingsHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    // Get authenticated user
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, leagueId);
    if (!auth) {
      this.respondForbidden(res, "Only the commissioner can perform this action");
      return;
    }

    const {
      waiver_type,
      faab_budget,
      waiver_period_days,
      process_schedule,
      process_time,
    } = req.body;

    // Validate inputs
    if (waiver_type && !["faab", "rolling", "none"].includes(waiver_type)) {
      this.respondBadRequest(res, "Invalid waiver_type. Must be 'faab', 'rolling', or 'none'");
      return;
    }

    if (
      process_schedule &&
      !["daily", "twice_weekly", "weekly", "manual"].includes(process_schedule)
    ) {
      this.respondBadRequest(res, "Invalid process_schedule. Must be 'daily', 'twice_weekly', 'weekly', or 'manual'");
      return;
    }

    if (faab_budget !== undefined && (faab_budget < 0 || faab_budget > 10000)) {
      this.respondBadRequest(res, "faab_budget must be between 0 and 10000");
      return;
    }

    if (
      waiver_period_days !== undefined &&
      (waiver_period_days < 0 || waiver_period_days > 7)
    ) {
      this.respondBadRequest(res, "waiver_period_days must be between 0 and 7");
      return;
    }

    // Update settings
    const updatedSettings = await updateWaiverSettings(leagueId, {
      waiver_type,
      faab_budget,
      waiver_period_days,
      process_schedule,
      process_time,
    });

    this.respondSuccess(res, updatedSettings, "Waiver settings updated successfully");
  });
}

// Export controller instance methods as standalone functions
const controller = new WaiverController();
export const submitClaimHandler = controller.submitClaimHandler;
export const getLeagueClaimsHandler = controller.getLeagueClaimsHandler;
export const getRosterClaimsHandler = controller.getRosterClaimsHandler;
export const cancelClaimHandler = controller.cancelClaimHandler;
export const processWaiversHandler = controller.processWaiversHandler;
export const pickupFreeAgentHandler = controller.pickupFreeAgentHandler;
export const getLeagueTransactionsHandler = controller.getLeagueTransactionsHandler;
export const getAvailablePlayersHandler = controller.getAvailablePlayersHandler;
export const getWaiverSettingsHandler = controller.getWaiverSettingsHandler;
export const updateWaiverSettingsHandler = controller.updateWaiverSettingsHandler;
