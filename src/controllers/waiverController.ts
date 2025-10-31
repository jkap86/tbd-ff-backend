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
import { validateCommissionerPermission } from "../models/League";
import {
  getWaiverSettingsByLeague,
  updateWaiverSettings,
} from "../models/WaiverSettings";
import { validateId } from "../utils/validation";
import { logger } from "../utils/logger";

/**
 * Submit a waiver claim
 * POST /api/leagues/:leagueId/waivers/claim
 */
export async function submitClaimHandler(req: Request, res: Response): Promise<void> {
  try {
    // Validate leagueId
    const leagueId = validateId(req.params.leagueId, "League ID");
    const { roster_id, player_id, drop_player_id, bid_amount } = req.body;

    // Validate required fields
    if (!roster_id || !player_id) {
      res.status(400).json({
        success: false,
        message: "roster_id and player_id are required",
      });
      return;
    }

    // Validate bid_amount
    if (bid_amount === undefined || bid_amount === null) {
      res.status(400).json({
        success: false,
        message: "bid_amount is required",
      });
      return;
    }

    if (typeof bid_amount !== "number" || bid_amount < 0) {
      res.status(400).json({
        success: false,
        message: "bid_amount must be a non-negative number",
      });
      return;
    }

    // Get authenticated user
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Verify roster belongs to user and league
    const roster = await getRosterByLeagueAndUser(leagueId, userId);
    if (!roster || roster.id !== roster_id) {
      res.status(403).json({
        success: false,
        message: "You do not own this roster",
      });
      return;
    }

    // Submit the claim
    const claim = await submitWaiverClaim(
      roster_id,
      player_id,
      drop_player_id || null,
      bid_amount
    );

    res.status(201).json({
      success: true,
      message: "Waiver claim submitted successfully",
      data: claim,
    });
  } catch (error: any) {
    logger.error("Submit claim error:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('League ID') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: error.message || "Error submitting waiver claim",
    });
  }
}

/**
 * Get all waiver claims for a league
 * GET /api/leagues/:leagueId/waivers/claims
 */
export async function getLeagueClaimsHandler(req: Request, res: Response): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { status } = req.query;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    const claims = await getWaiverClaimsByLeague(
      leagueId,
      status as string | undefined
    );

    res.status(200).json({
      success: true,
      data: claims,
    });
  } catch (error: any) {
    logger.error("Get league claims error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting waiver claims",
    });
  }
}

/**
 * Get waiver claims for a specific roster
 * GET /api/rosters/:rosterId/waivers/claims
 */
export async function getRosterClaimsHandler(req: Request, res: Response): Promise<void> {
  try {
    const rosterId = parseInt(req.params.rosterId);
    const { status } = req.query;

    if (isNaN(rosterId)) {
      res.status(400).json({
        success: false,
        message: "Invalid roster ID",
      });
      return;
    }

    const claims = await getWaiverClaimsByRoster(
      rosterId,
      status as string | undefined
    );

    res.status(200).json({
      success: true,
      data: claims,
    });
  } catch (error: any) {
    logger.error("Get roster claims error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting roster claims",
    });
  }
}

/**
 * Cancel a waiver claim
 * DELETE /api/waivers/claims/:claimId
 */
export async function cancelClaimHandler(req: Request, res: Response): Promise<void> {
  try {
    const claimId = parseInt(req.params.claimId);

    if (isNaN(claimId)) {
      res.status(400).json({
        success: false,
        message: "Invalid claim ID",
      });
      return;
    }

    // Get the claim
    const claim = await getWaiverClaimById(claimId);
    if (!claim) {
      res.status(404).json({
        success: false,
        message: "Claim not found",
      });
      return;
    }

    // Verify claim is still pending
    if (claim.status !== "pending") {
      res.status(400).json({
        success: false,
        message: `Cannot cancel a claim with status: ${claim.status}`,
      });
      return;
    }

    // Get authenticated user
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Verify user owns the roster (get roster to check user_id)
    const roster = await getRosterByLeagueAndUser(claim.league_id, userId);
    if (!roster || roster.id !== claim.roster_id) {
      res.status(403).json({
        success: false,
        message: "You do not own this claim",
      });
      return;
    }

    // Cancel the claim
    const updatedClaim = await cancelWaiverClaim(claimId);

    res.status(200).json({
      success: true,
      message: "Waiver claim cancelled successfully",
      data: updatedClaim,
    });
  } catch (error: any) {
    logger.error("Cancel claim error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error cancelling waiver claim",
    });
  }
}

/**
 * Process waivers manually (commissioner only)
 * POST /api/leagues/:leagueId/waivers/process
 */
export async function processWaiversHandler(req: Request, res: Response): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Get authenticated user
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Verify user is commissioner
    await validateCommissionerPermission(leagueId, userId);

    // Process waivers
    await processWaivers(leagueId);

    res.status(200).json({
      success: true,
      message: "Waivers processed successfully",
    });
  } catch (error: any) {
    logger.error("Process waivers error:", error);

    if (error.message === "Only the commissioner can perform this action") {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error processing waivers",
    });
  }
}

/**
 * Pick up a free agent immediately
 * POST /api/leagues/:leagueId/transactions/free-agent
 */
export async function pickupFreeAgentHandler(req: Request, res: Response): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { roster_id, player_id, drop_player_id } = req.body;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Validate required fields
    if (!roster_id || !player_id) {
      res.status(400).json({
        success: false,
        message: "roster_id and player_id are required",
      });
      return;
    }

    // Get authenticated user
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Verify roster belongs to user and league
    const roster = await getRosterByLeagueAndUser(leagueId, userId);
    if (!roster || roster.id !== roster_id) {
      res.status(403).json({
        success: false,
        message: "You do not own this roster",
      });
      return;
    }

    // Pick up the free agent
    const transaction = await pickupFreeAgent(
      roster_id,
      player_id,
      drop_player_id || null
    );

    res.status(201).json({
      success: true,
      message: "Free agent picked up successfully",
      data: transaction,
    });
  } catch (error: any) {
    logger.error("Pickup free agent error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error picking up free agent",
    });
  }
}

/**
 * Get transaction history for a league
 * GET /api/leagues/:leagueId/transactions
 */
export async function getLeagueTransactionsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Get transactions with player details
    const transactions = await getTransactionsWithPlayerDetails(leagueId, limit);

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error: any) {
    logger.error("Get league transactions error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting transactions",
    });
  }
}

/**
 * Get available players for a league
 * GET /api/leagues/:leagueId/players/available
 */
export async function getAvailablePlayersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    const availablePlayerIds = await getAvailablePlayers(leagueId);

    res.status(200).json({
      success: true,
      data: {
        count: availablePlayerIds.length,
        player_ids: availablePlayerIds,
      },
    });
  } catch (error: any) {
    logger.error("Get available players error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting available players",
    });
  }
}

/**
 * Get waiver settings for a league
 * GET /api/leagues/:leagueId/waivers/settings
 */
export async function getWaiverSettingsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    const settings = await getWaiverSettingsByLeague(leagueId);

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error("Get waiver settings error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting waiver settings",
    });
  }
}

/**
 * Update waiver settings for a league (commissioner only)
 * PUT /api/leagues/:leagueId/waivers/settings
 */
export async function updateWaiverSettingsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Get authenticated user
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Verify user is commissioner
    await validateCommissionerPermission(leagueId, userId);

    const {
      waiver_type,
      faab_budget,
      waiver_period_days,
      process_schedule,
      process_time,
    } = req.body;

    // Validate inputs
    if (waiver_type && !["faab", "rolling", "none"].includes(waiver_type)) {
      res.status(400).json({
        success: false,
        message: "Invalid waiver_type. Must be 'faab', 'rolling', or 'none'",
      });
      return;
    }

    if (
      process_schedule &&
      !["daily", "twice_weekly", "weekly", "manual"].includes(process_schedule)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid process_schedule. Must be 'daily', 'twice_weekly', 'weekly', or 'manual'",
      });
      return;
    }

    if (faab_budget !== undefined && (faab_budget < 0 || faab_budget > 10000)) {
      res.status(400).json({
        success: false,
        message: "faab_budget must be between 0 and 10000",
      });
      return;
    }

    if (
      waiver_period_days !== undefined &&
      (waiver_period_days < 0 || waiver_period_days > 7)
    ) {
      res.status(400).json({
        success: false,
        message: "waiver_period_days must be between 0 and 7",
      });
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

    res.status(200).json({
      success: true,
      message: "Waiver settings updated successfully",
      data: updatedSettings,
    });
  } catch (error: any) {
    logger.error("Update waiver settings error:", error);

    if (error.message === "Only the commissioner can perform this action") {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error updating waiver settings",
    });
  }
}
