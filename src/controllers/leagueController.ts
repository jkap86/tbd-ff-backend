import { Request, Response } from "express";
import {
  createLeague,
  getLeagueById,
  getLeaguesForUser,
} from "../models/League";
import {
  createRoster,
  getRostersByLeagueId,
  getRosterByLeagueAndUser,
  getNextRosterId,
} from "../models/Roster";

/**
 * Create a new league
 * POST /api/leagues/create
 */
export async function createLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      name,
      season,
      season_type,
      total_rosters,
      settings,
      scoring_settings,
      roster_positions,
    } = req.body;

    // Validate required fields
    if (!name || !season) {
      res.status(400).json({
        success: false,
        message: "Name and season are required",
      });
      return;
    }

    // Get commissioner_id from authenticated user
    const commissioner_id = req.user?.userId;

    if (!commissioner_id) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Create league
    const league = await createLeague({
      name,
      commissioner_id,
      season,
      season_type,
      total_rosters,
      settings,
      scoring_settings,
      roster_positions,
    });

    res.status(201).json({
      success: true,
      message: "League created successfully",
      data: league,
    });
  } catch (error: any) {
    console.error("Create league error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating league",
    });
  }
}

/**
 * Get all leagues for a user
 * GET /api/leagues/user/:userId
 */
export async function getUserLeaguesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
      return;
    }

    const leagues = await getLeaguesForUser(userId);

    res.status(200).json({
      success: true,
      data: leagues,
    });
  } catch (error: any) {
    console.error("Get user leagues error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting user leagues",
    });
  }
}

/**
 * Get specific league with all rosters
 * GET /api/leagues/:leagueId
 */
export async function getLeagueDetailsHandler(
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

    // Get league details
    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get all rosters for this league
    const rosters = await getRostersByLeagueId(leagueId);

    // Extract commissioner ID from settings
    const commissionerId =
      league.settings && league.settings.commissioner_id
        ? league.settings.commissioner_id
        : null;

    res.status(200).json({
      success: true,
      data: {
        league,
        commissioner_id: commissionerId,
        rosters,
      },
    });
  } catch (error: any) {
    console.error("Get league details error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting league details",
    });
  }
}

/**
 * Join a league
 * POST /api/leagues/:leagueId/join
 */
export async function joinLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { team_name } = req.body;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Get user ID from authenticated user
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Check if league exists
    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if user already has a roster in this league
    const existingRoster = await getRosterByLeagueAndUser(leagueId, userId);

    if (existingRoster) {
      res.status(409).json({
        success: false,
        message: "User already has a roster in this league",
      });
      return;
    }

    // Check if league is full
    const rosters = await getRostersByLeagueId(leagueId);

    if (rosters.length >= league.total_rosters) {
      res.status(400).json({
        success: false,
        message: "League is full",
      });
      return;
    }

    // Get next available roster_id
    const nextRosterId = await getNextRosterId(leagueId);

    // Create roster for user
    const roster = await createRoster({
      league_id: leagueId,
      user_id: userId,
      roster_id: nextRosterId,
      settings: team_name ? { team_name } : {},
    });

    res.status(201).json({
      success: true,
      message: "Successfully joined league",
      data: roster,
    });
  } catch (error: any) {
    console.error("Join league error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error joining league",
    });
  }
}

/**
 * Get public leagues
 * GET /api/leagues/public
 */
export async function getPublicLeaguesHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const { getPublicLeagues } = await import("../models/League");
    const leagues = await getPublicLeagues();

    res.status(200).json({
      success: true,
      data: leagues,
    });
  } catch (error: any) {
    console.error("Get public leagues error:", error);
    res.status(500).json({
      success: false,
      message: "Error getting public leagues",
    });
  }
}

/**
 * Update league settings (name, total_rosters, settings, scoring_settings)
 * PUT /api/leagues/:leagueId
 */
export async function updateLeagueSettingsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { name, total_rosters, settings, scoring_settings } = req.body;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Get user ID from authenticated user
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Import the update function
    const { updateLeagueSettings } = await import("../models/League");

    // Validate total_rosters if provided
    if (total_rosters !== undefined) {
      if (
        typeof total_rosters !== "number" ||
        total_rosters < 2 ||
        total_rosters > 100
      ) {
        res.status(400).json({
          success: false,
          message: "Total rosters must be between 2 and 100",
        });
        return;
      }
    }

    // Update league settings
    const updatedLeague = await updateLeagueSettings(leagueId, userId, {
      name,
      total_rosters,
      settings,
      scoring_settings,
    });

    if (!updatedLeague) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "League settings updated successfully",
      data: updatedLeague,
    });
  } catch (error: any) {
    console.error("Update league settings error:", error);

    if (error.message === "Only the commissioner can update league settings") {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error updating league settings",
    });
  }
}

/**
 * Transfer commissioner role to another user
 * POST /api/leagues/:leagueId/transfer-commissioner
 */
export async function transferCommissionerHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { newCommissionerId } = req.body;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!newCommissionerId) {
      res.status(400).json({
        success: false,
        message: "New commissioner ID is required",
      });
      return;
    }

    // Get current user ID from authenticated user
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Import the transfer function
    const { transferCommissioner } = await import("../models/League");

    // Transfer commissioner role
    const updatedLeague = await transferCommissioner(
      leagueId,
      userId,
      newCommissionerId
    );

    if (!updatedLeague) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Commissioner role transferred successfully",
      data: updatedLeague,
    });
  } catch (error: any) {
    console.error("Transfer commissioner error:", error);

    if (
      error.message === "Only the commissioner can transfer their role" ||
      error.message === "New commissioner must be a member of the league"
    ) {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error transferring commissioner",
    });
  }
}

/**
 * Check if user is commissioner of a league
 * GET /api/leagues/:leagueId/is-commissioner
 */
export async function isCommissionerHandler(
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

    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);
    const isCommissioner = commissionerId === userId;

    res.status(200).json({
      success: true,
      data: {
        isCommissioner,
        commissionerId,
      },
    });
  } catch (error: any) {
    console.error("Is commissioner check error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error checking commissioner status",
    });
  }
}

/**
 * Remove a user from a league
 * POST /api/leagues/:leagueId/remove-member
 */
export async function removeLeagueMemberHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const { userIdToRemove } = req.body;

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!userIdToRemove) {
      res.status(400).json({
        success: false,
        message: "User ID to remove is required",
      });
      return;
    }

    // Get current user ID from authenticated user
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get league and verify user is commissioner
    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can remove members",
      });
      return;
    }

    // Prevent removing commissioner
    if (userIdToRemove === commissionerId) {
      res.status(400).json({
        success: false,
        message: "Cannot remove the commissioner from the league",
      });
      return;
    }

    // Remove user's roster from league
    const { deleteRosterByLeagueAndUser } = await import("../models/Roster");
    await deleteRosterByLeagueAndUser(leagueId, userIdToRemove);

    res.status(200).json({
      success: true,
      message: "Member removed from league successfully",
    });
  } catch (error: any) {
    console.error("Remove league member error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error removing member from league",
    });
  }
}

/**
 * Get league statistics
 * GET /api/leagues/:leagueId/stats
 */
export async function getLeagueStatsHandler(
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

    // Get league
    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get rosters
    const rosters = await getRostersByLeagueId(leagueId);

    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);

    const stats = {
      league_id: league.id,
      league_name: league.name,
      total_rosters: league.total_rosters,
      filled_rosters: rosters.length,
      available_spots: league.total_rosters - rosters.length,
      commissioner_id: commissionerId,
      season: league.season,
      status: league.status,
      created_at: league.created_at,
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("Get league stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting league stats",
    });
  }
}
