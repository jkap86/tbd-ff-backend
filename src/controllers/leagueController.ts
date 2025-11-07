import { Request, Response } from "express";
import pool from "../config/database";
import {
  getLeagueById,
  getLeaguesForUser,
  validateLeagueSettings,
  validateScoringSettings,
  validateRosterPositions,
} from "../models/League";
import {
  createRoster,
  getRosterByLeagueAndUser,
  getRostersByLeagueId,
  getNextRosterId,
} from "../models/Roster";
import { leagueBusinessService } from "../services/leagueBusinessService";

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
      enable_bestball,
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

    // Create league with business logic handled by service layer
    const league = await leagueBusinessService.createLeagueWithDefaults(
      commissioner_id,
      {
        name,
        commissioner_id,
        season,
        season_type,
        league_type,
        total_rosters,
        enable_bestball,
        settings,
        scoring_settings,
        roster_positions,
      }
    );

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

    // Optimized query: Use a single query with JOINs to fetch league and all rosters
    // This eliminates the N+1 query problem
    const result = await pool.query(`
      SELECT
        l.*,
        json_agg(
          json_build_object(
            'id', r.id,
            'league_id', r.league_id,
            'user_id', r.user_id,
            'roster_id', r.roster_id,
            'settings', r.settings,
            'starters', r.starters,
            'bench', r.bench,
            'taxi', r.taxi,
            'ir', r.ir,
            'wins', r.wins,
            'losses', r.losses,
            'ties', r.ties,
            'points_for', r.points_for,
            'points_against', r.points_against,
            'faab_budget', r.faab_budget,
            'waiver_position', r.waiver_position,
            'created_at', r.created_at,
            'updated_at', r.updated_at,
            'username', u.username,
            'email', u.email
          ) ORDER BY r.roster_id ASC
        ) FILTER (WHERE r.id IS NOT NULL) as rosters
      FROM leagues l
      LEFT JOIN rosters r ON r.league_id = l.id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE l.id = $1
      GROUP BY l.id
    `, [leagueId]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const row = result.rows[0];

    // Extract league data (all columns except rosters)
    const { rosters, ...leagueData } = row;

    // Extract commissioner ID from settings and add it to league object at top level
    const commissionerId =
      leagueData.settings && leagueData.settings.commissioner_id
        ? leagueData.settings.commissioner_id
        : null;

    // Add commissioner_id to league object so Flutter can parse it
    const leagueWithCommissioner = {
      ...leagueData,
      commissioner_id: commissionerId,
    };

    res.status(200).json({
      success: true,
      data: {
        league: leagueWithCommissioner,
        rosters: rosters || [],
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

    // Get user info for chat message
    const { getUserById } = await import("../models/User");
    const user = await getUserById(userId);

    // Create system notification in league chat
    try {
      const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
      const teamName = team_name || `Team ${nextRosterId}`;
      const username = user?.username || `User ${userId}`;

      await createLeagueChatMessage({
        league_id: leagueId,
        user_id: null, // System message
        message: `${username} has joined the league as ${teamName}`,
        message_type: "system",
        metadata: {
          type: "user_joined",
          joined_user_id: userId,
          joined_username: username,
          team_name: teamName,
          roster_id: roster.id,
        },
      });

      console.log(`[LeagueController] System message created for user ${userId} joining league ${leagueId}`);
    } catch (chatError: any) {
      console.error(`[LeagueController] Error creating system message for league join:`, chatError);
      // Don't fail the join if chat message creation fails
    }

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
      enable_bestball,
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

    // Get current league to check if total_rosters is changing
    const currentLeague = await getLeagueById(leagueId);
    if (!currentLeague) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const oldTotalRosters = currentLeague.total_rosters;
    const newTotalRosters = total_rosters ?? oldTotalRosters;
    const rosterCountChanged = oldTotalRosters !== newTotalRosters;

    // Import the update function
    const { updateLeagueSettings } = await import("../models/League");

    // Update league settings
    const updatedLeague = await updateLeagueSettings(leagueId, userId, {
      name,
      league_type,
      total_rosters,
      enable_bestball,
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

    // Handle draft order reset if roster count changed
    if (rosterCountChanged) {
      try {
        console.log(`[LeagueController] Roster count changed from ${oldTotalRosters} to ${newTotalRosters} for league ${leagueId}`);

        const { getDraftByLeagueId } = await import("../models/Draft");
        const { getRostersByLeagueId } = await import("../models/Roster");
        const { randomizeDraftOrder } = await import("../models/DraftOrder");

        const draft = await getDraftByLeagueId(leagueId);

        if (draft && draft.status === "not_started") {
          console.log(`[LeagueController] Resetting draft order for draft ${draft.id}`);

          // Get current rosters for the league
          const rosters = await getRostersByLeagueId(leagueId);
          const rosterIds = rosters.map((r) => r.id);

          if (rosterIds.length > 0) {
            // Regenerate randomized draft order
            await randomizeDraftOrder(draft.id, rosterIds);
            console.log(`[LeagueController] Draft order regenerated with ${rosterIds.length} rosters`);
          }
        } else if (draft) {
          console.log(`[LeagueController] Draft ${draft.id} has status "${draft.status}", skipping order reset (only reset for not_started drafts)`);
        }
      } catch (draftOrderError: any) {
        console.error("Error resetting draft order:", draftOrderError);
        // Don't fail the request if draft order reset fails
      }
    }

    // Send league chat notification about settings change
    try {
      const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
      const { emitLeagueChat } = await import("../socket/leagueSocket");
      const { io } = await import("../index");

      // Track detailed changes with old and new values
      const changes: Array<{field: string, label: string, oldValue: any, newValue: any}> = [];

      if (name !== undefined && name !== currentLeague.name) {
        changes.push({ field: 'name', label: 'League Name', oldValue: currentLeague.name, newValue: name });
      }
      if (league_type !== undefined && league_type !== currentLeague.league_type) {
        changes.push({ field: 'league_type', label: 'League Type', oldValue: currentLeague.league_type, newValue: league_type });
      }
      if (total_rosters !== undefined && total_rosters !== currentLeague.total_rosters) {
        changes.push({ field: 'total_rosters', label: 'Team Count', oldValue: currentLeague.total_rosters, newValue: total_rosters });
      }
      if (enable_bestball !== undefined && enable_bestball !== currentLeague.enable_bestball) {
        changes.push({ field: 'enable_bestball', label: 'Best Ball', oldValue: currentLeague.enable_bestball ? 'Enabled' : 'Disabled', newValue: enable_bestball ? 'Enabled' : 'Disabled' });
      }
      if (trade_notification_setting !== undefined && trade_notification_setting !== currentLeague.trade_notification_setting) {
        changes.push({ field: 'trade_notification_setting', label: 'Trade Notifications', oldValue: currentLeague.trade_notification_setting || 'Off', newValue: trade_notification_setting });
      }
      if (trade_details_setting !== undefined && trade_details_setting !== currentLeague.trade_details_setting) {
        changes.push({ field: 'trade_details_setting', label: 'Trade Details Visibility', oldValue: currentLeague.trade_details_setting || 'Public', newValue: trade_details_setting });
      }

      // Handle nested settings changes
      if (settings !== undefined) {
        const oldSettings = currentLeague.settings || {};
        for (const [key, value] of Object.entries(settings)) {
          if (oldSettings[key] !== value) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            changes.push({ field: `settings.${key}`, label, oldValue: oldSettings[key], newValue: value });
          }
        }
      }

      if (changes.length > 0) {
        const message = 'Commissioner has updated league settings';

        const chatMessage = await createLeagueChatMessage({
          league_id: leagueId,
          user_id: null, // System message
          message,
          message_type: "system",
          metadata: {
            type: 'league_settings_update',
            collapsible: true,
            details: {
              changes: changes,
              draft_order_regenerated: rosterCountChanged,
            },
          },
        });

        // Emit to league chat via socket
        emitLeagueChat(io, leagueId, chatMessage);
      }
    } catch (notificationError) {
      console.error("Error sending settings change notification:", notificationError);
      // Don't fail the request if notification fails
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
  const { leagueId } = req.params;
  const userId = (req as any).user?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
    return;
  }

  // Get league and verify user is commissioner (before transaction)
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

  // DYNASTY GUARD: Prevent reset for dynasty leagues
  if (league.league_type === 'dynasty') {
    res.status(400).json({
      success: false,
      message: "Dynasty leagues cannot be reset. Use season rollover to start a new season while keeping rosters intact.",
    });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // TODO: Update these functions to accept an optional client parameter for proper transaction support
    // For now, these operations use the global pool and are not part of the transaction
    // This means if any operation fails, previous operations may not be rolled back

    // Delete draft if it exists
    const { getDraftByLeagueId, deleteDraft } = await import("../models/Draft");
    const draft = await getDraftByLeagueId(parseInt(leagueId));
    if (draft) {
      // Stop draft timer broadcasts before deleting draft
      const { stopTimerBroadcast } = await import("../socket/draftSocket");
      stopTimerBroadcast(draft.id);

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

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: "League reset to pre-draft status successfully",
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("[resetLeagueHandler] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reset league",
    });
  } finally {
    client.release();
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

/**
 * Generate shareable league invitation link
 * POST /api/leagues/:leagueId/generate-invite-link
 *
 * Generates both web and app deep links for league invitations.
 * Only commissioners can generate invitation links.
 *
 * Response format:
 * {
 *   success: true,
 *   data: {
 *     leagueId: number,
 *     webLink: string,
 *     appLink: string
 *   }
 * }
 */
export async function generateInviteLinkHandler(
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

    // Get league and verify it exists
    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Verify user is commissioner
    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can generate invitation links",
      });
      return;
    }

    // Generate invitation links
    const webLink = `https://hypetrain.netlify.app/invite.html?leagueId=${leagueId}`;
    const appLink = `tbdff://league/invite?leagueId=${leagueId}`;

    res.status(200).json({
      success: true,
      data: {
        leagueId,
        webLink,
        appLink,
      },
    });
  } catch (error: any) {
    console.error("Generate invite link error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating invitation link",
    });
  }
}

/**
 * Get public league info for invite page
 * GET /api/leagues/:leagueId/public-info
 * No authentication required - returns full league details for preview
 */
export async function getPublicLeagueInfoHandler(
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

    // Get league and verify it exists
    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get all rosters for the league
    const rosters = await getRostersByLeagueId(leagueId);

    res.status(200).json({
      success: true,
      data: {
        league: {
          id: league.id,
          name: league.name,
          season: league.season,
          league_type: league.league_type,
          total_rosters: league.total_rosters,
          start_week: league.settings?.start_week,
          end_week: league.settings?.end_week,
          settings: league.settings,
          scoring_settings: league.scoring_settings,
          roster_positions: league.roster_positions,
        },
        rosters: rosters.map((roster: any) => ({
          roster_id: roster.roster_id,
          owner_id: roster.owner_id,
          owner_name: roster.owner_name,
          players: roster.players,
          settings: roster.settings,
        })),
      },
    });
  } catch (error: any) {
    console.error("Get public league info error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching league info",
    });
  }
}
