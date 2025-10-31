import { Request, Response } from "express";
import {
  createLeague,
  getLeagueById,
  getLeaguesForUser,
  validateLeagueSettings,
  validateScoringSettings,
  validateRosterPositions,
} from "../models/League";
import {
  createRoster,
  getRostersByLeagueId,
  getRosterByLeagueAndUser,
  getNextRosterId,
} from "../models/Roster";

/**
 * Create a new league with all settings
 * POST /api/leagues/create
 *
 * Request body:
 * {
 *   name: string,
 *   season: string,
 *   season_type?: "pre" | "regular" | "post",
 *   league_type?: "redraft" | "keeper" | "dynasty",
 *   total_rosters?: number (2-100),
 *   settings?: {
 *     is_public?: boolean,
 *     start_week?: number (1-17),
 *     end_week?: number (1-17),
 *     league_median?: boolean
 *   },
 *   scoring_settings?: { [stat]: points },
 *   roster_positions?: [{ position: string, count: number }]
 * }
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
      league_type,
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

    // Validate name length
    if (name.length < 2 || name.length > 100) {
      res.status(400).json({
        success: false,
        message: "League name must be between 2 and 100 characters",
      });
      return;
    }

    // Validate season format (e.g., "2024", "2025")
    if (!/^\d{4}$/.test(season)) {
      res.status(400).json({
        success: false,
        message: "Season must be a valid year (e.g., 2024)",
      });
      return;
    }

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

    // Validate settings if provided
    if (settings) {
      try {
        validateLeagueSettings(settings);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: `Invalid settings: ${error.message}`,
        });
        return;
      }
    }

    // Validate scoring_settings if provided
    if (scoring_settings) {
      try {
        validateScoringSettings(scoring_settings);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: `Invalid scoring settings: ${error.message}`,
        });
        return;
      }
    }

    // Validate roster_positions if provided
    if (roster_positions) {
      try {
        validateRosterPositions(roster_positions);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: `Invalid roster positions: ${error.message}`,
        });
        return;
      }
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
      league_type,
      total_rosters,
      settings,
      scoring_settings,
      roster_positions,
    });

    // Auto-generate matchups for all regular season weeks
    const startWeek = settings.start_week || 1;
    const playoffWeekStart = settings.playoff_week_start || 15;
    const { generateMatchupsForWeek } = await import("../models/Matchup");

    console.log(`[CreateLeague] Auto-generating matchups for weeks ${startWeek} to ${playoffWeekStart - 1}...`);

    for (let week = startWeek; week < playoffWeekStart; week++) {
      try {
        await generateMatchupsForWeek(league.id, week, season);
        console.log(`[CreateLeague] Generated matchups for week ${week}`);
      } catch (error) {
        console.error(`[CreateLeague] Failed to generate matchups for week ${week}:`, error);
        // Continue with other weeks even if one fails
      }
    }

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
    console.log('[getUserLeagues] Request for userId:', req.params.userId);
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      console.log('[getUserLeagues] Invalid user ID');
      res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
      return;
    }

    const leagues = await getLeaguesForUser(userId);
    console.log('[getUserLeagues] Found', leagues.length, 'leagues');

    res.status(200).json({
      success: true,
      data: leagues,
    });
  } catch (error: any) {
    console.error("Get user leagues error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting user leagues",
    });
  }
}

/**
 * Get all public leagues
 * GET /api/leagues/public
 */
export async function getPublicLeaguesHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    // Get public leagues from database
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
      message: error.message || "Error getting public leagues",
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

    // Extract commissioner ID from settings and add it to league object at top level
    const commissionerId =
      league.settings && league.settings.commissioner_id
        ? league.settings.commissioner_id
        : null;

    // Add commissioner_id to league object so Flutter can parse it
    const leagueWithCommissioner = {
      ...league,
      commissioner_id: commissionerId,
    };

    res.status(200).json({
      success: true,
      data: {
        league: leagueWithCommissioner,
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
      team_name: team_name || `Team ${nextRosterId}`,
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
 * Update league settings (name, total_rosters, settings, scoring_settings, roster_positions)
 * PUT /api/leagues/:leagueId
 *
 * Request body can include any of:
 * {
 *   name?: string,
 *   total_rosters?: number,
 *   settings?: { is_public, season_type, start_week, end_week, league_median },
 *   scoring_settings?: { [stat]: points },
 *   roster_positions?: [{ position: string, count: number }]
 * }
 */
export async function updateLeagueSettingsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const {
      name,
      league_type,
      total_rosters,
      settings,
      scoring_settings,
      roster_positions,
      trade_notification_setting,
      trade_details_setting,
    } = req.body;

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

    // Validate name if provided
    if (name !== undefined) {
      if (name.length < 2 || name.length > 100) {
        res.status(400).json({
          success: false,
          message: "League name must be between 2 and 100 characters",
        });
        return;
      }
    }

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

    // Validate settings if provided
    if (settings) {
      try {
        validateLeagueSettings(settings);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: `Invalid settings: ${error.message}`,
        });
        return;
      }
    }

    // Validate scoring_settings if provided
    if (scoring_settings) {
      try {
        // Get the league to check its type
        const league = await getLeagueById(leagueId);

        if (!league) {
          res.status(404).json({
            success: false,
            message: "League not found",
          });
          return;
        }

        validateScoringSettings(scoring_settings);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: `Invalid scoring settings: ${error.message}`,
        });
        return;
      }
    }

    // Validate roster_positions if provided
    if (roster_positions) {
      try {
        validateRosterPositions(roster_positions);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: `Invalid roster positions: ${error.message}`,
        });
        return;
      }
    }

    // Import the update function
    const { updateLeagueSettings } = await import("../models/League");

    // Update league settings
    const updatedLeague = await updateLeagueSettings(leagueId, userId, {
      name,
      league_type,
      total_rosters,
      settings,
      scoring_settings,
      roster_positions,
      trade_notification_setting,
      trade_details_setting,
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
      settings: league.settings,
      scoring_settings: league.scoring_settings,
      roster_positions: league.roster_positions,
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

/**
 * Reset league to pre-draft status
 * POST /api/leagues/:leagueId/reset
 * - Sets league status to 'pre_draft'
 * - Deletes the draft and all picks
 * - Clears all roster lineups (keeps teams but removes players)
 * - Keeps league members intact
 */
export async function resetLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get league and verify user is commissioner
    const { getLeagueById, getCommissionerIdFromLeague, updateLeague } = await import("../models/League");
    const league = await getLeagueById(parseInt(leagueId));

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = getCommissionerIdFromLeague(league);

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can reset the league",
      });
      return;
    }

    // Delete draft if it exists
    const { getDraftByLeagueId, deleteDraft } = await import("../models/Draft");
    const draft = await getDraftByLeagueId(parseInt(leagueId));
    if (draft) {
      await deleteDraft(draft.id);
    }

    // Clear all roster lineups (remove all players but keep rosters)
    const { clearAllRosterLineups } = await import("../models/Roster");
    await clearAllRosterLineups(parseInt(leagueId));

    // Delete all weekly lineups
    const { deleteWeeklyLineupsForLeague } = await import("../models/WeeklyLineup");
    await deleteWeeklyLineupsForLeague(parseInt(leagueId));

    // Delete all matchups
    const { deleteMatchupsForLeague } = await import("../models/Matchup");
    await deleteMatchupsForLeague(parseInt(leagueId));

    // Reset all roster records to 0-0-0
    const { resetAllRosterRecords } = await import("../services/recordService");
    await resetAllRosterRecords(parseInt(leagueId));

    // Update league status to pre_draft
    await updateLeague(parseInt(leagueId), {
      status: "pre_draft",
    });

    res.status(200).json({
      success: true,
      message: "League reset to pre-draft status successfully",
    });
  } catch (error: any) {
    console.error("Reset league error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resetting league",
    });
  }
}

/**
 * Delete a league (commissioner only)
 * DELETE /api/leagues/:leagueId
 */
export async function deleteLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get league to check commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can delete the league",
      });
      return;
    }

    // Delete all related data in cascade
    const pool = (await import("../config/database")).default;

    // Delete draft if it exists
    const { getDraftByLeagueId, deleteDraft } = await import("../models/Draft");
    const draft = await getDraftByLeagueId(parseInt(leagueId));
    if (draft) {
      await deleteDraft(draft.id);
    }

    // Delete weekly lineups
    const { deleteWeeklyLineupsForLeague } = await import("../models/WeeklyLineup");
    await deleteWeeklyLineupsForLeague(parseInt(leagueId));

    // Delete matchups
    const { deleteMatchupsForLeague } = await import("../models/Matchup");
    await deleteMatchupsForLeague(parseInt(leagueId));

    // Delete league chat messages
    const { deleteLeagueChatMessages } = await import("../models/LeagueChatMessage");
    await deleteLeagueChatMessages(parseInt(leagueId));

    // Delete rosters (this will cascade to roster-related tables)
    await pool.query("DELETE FROM rosters WHERE league_id = $1", [parseInt(leagueId)]);

    // Delete league invites
    await pool.query("DELETE FROM league_invites WHERE league_id = $1", [parseInt(leagueId)]);

    // Finally, delete the league itself
    await pool.query("DELETE FROM leagues WHERE id = $1", [parseInt(leagueId)]);

    res.status(200).json({
      success: true,
      message: "League deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete league error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting league",
    });
  }
}
