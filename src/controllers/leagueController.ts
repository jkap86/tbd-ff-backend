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
import { BaseController } from "./BaseController";

// Before: 1308 lines
// After: 1007 lines
// Lines saved: 301

class LeagueController extends BaseController {
  /**
   * Create a new league with all settings
   * POST /api/leagues/create
   */
  createLeague = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
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
    const validated = this.validateRequiredFields(req.body, ['name', 'season']);
    if (!validated) {
      return this.respondBadRequest(res, "Name and season are required");
    }

    // Validate name length
    if (name.length < 2 || name.length > 100) {
      return this.respondBadRequest(res, "League name must be between 2 and 100 characters");
    }

    // Validate season format (e.g., "2024", "2025")
    if (!/^\d{4}$/.test(season)) {
      return this.respondBadRequest(res, "Season must be a valid year (e.g., 2024)");
    }

    // Validate total_rosters if provided
    if (total_rosters !== undefined) {
      if (
        typeof total_rosters !== "number" ||
        total_rosters < 2 ||
        total_rosters > 100
      ) {
        return this.respondBadRequest(res, "Total rosters must be between 2 and 100");
      }
    }

    // Validate settings if provided
    if (settings) {
      try {
        validateLeagueSettings(settings);
      } catch (error: any) {
        return this.respondBadRequest(res, `Invalid settings: ${error.message}`);
      }
    }

    // Validate scoring_settings if provided
    if (scoring_settings) {
      try {
        validateScoringSettings(scoring_settings);
      } catch (error: any) {
        return this.respondBadRequest(res, `Invalid scoring settings: ${error.message}`);
      }
    }

    // Validate roster_positions if provided
    if (roster_positions) {
      try {
        validateRosterPositions(roster_positions);
      } catch (error: any) {
        return this.respondBadRequest(res, `Invalid roster positions: ${error.message}`);
      }
    }

    // Get commissioner_id from authenticated user
    const commissioner_id = this.getAuthenticatedUserId(req);

    if (!commissioner_id) {
      return this.respondUnauthorized(res, "User not authenticated");
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

    this.respondCreated(res, league, "League created successfully");
  });

  /**
   * Get all leagues for a user
   * GET /api/leagues/user/:userId
   */
  getUserLeagues = this.asyncHandler(async (req: Request, res: Response) => {
    console.log('[getUserLeagues] Request for userId:', req.params.userId);
    const userId = this.validateId(req.params.userId, "User ID");

    const leagues = await getLeaguesForUser(userId);
    console.log('[getUserLeagues] Found', leagues.length, 'leagues');

    this.respondSuccess(res, leagues);
  });

  /**
   * Get all public leagues
   * GET /api/leagues/public
   */
  getPublicLeagues = this.asyncHandler(async (_req: Request, res: Response) => {
    const { getPublicLeagues } = await import("../models/League");
    const leagues = await getPublicLeagues();

    this.respondSuccess(res, leagues);
  });

  /**
   * Get specific league with all rosters
   * GET /api/leagues/:leagueId
   */
  getLeagueDetails = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

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
      return this.respondNotFound(res, "League not found");
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

    this.respondSuccess(res, {
      league: leagueWithCommissioner,
      rosters: rosters || [],
    });
  });

  /**
   * Join a league
   * POST /api/leagues/:leagueId/join
   */
  joinLeague = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { team_name } = req.body;

    // Get user ID from authenticated user
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Check if league exists
    const league = await getLeagueById(leagueId);

    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    // Check if user already has a roster in this league
    const existingRoster = await getRosterByLeagueAndUser(leagueId, userId);

    if (existingRoster) {
      return this.respondError(res, "User already has a roster in this league", 409);
    }

    // Check if league is full
    const rosters = await getRostersByLeagueId(leagueId);

    if (rosters.length >= league.total_rosters) {
      return this.respondBadRequest(res, "League is full");
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

    this.respondCreated(res, roster, "Successfully joined league");
  });

  /**
   * Update league settings (name, total_rosters, settings, scoring_settings, roster_positions)
   * PUT /api/leagues/:leagueId
   */
  updateLeagueSettings = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
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

    // Get user ID from authenticated user
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Validate name if provided
    if (name !== undefined) {
      if (name.length < 2 || name.length > 100) {
        return this.respondBadRequest(res, "League name must be between 2 and 100 characters");
      }
    }

    // Validate total_rosters if provided
    if (total_rosters !== undefined) {
      if (
        typeof total_rosters !== "number" ||
        total_rosters < 2 ||
        total_rosters > 100
      ) {
        return this.respondBadRequest(res, "Total rosters must be between 2 and 100");
      }
    }

    // Validate settings if provided
    if (settings) {
      try {
        validateLeagueSettings(settings);
      } catch (error: any) {
        return this.respondBadRequest(res, `Invalid settings: ${error.message}`);
      }
    }

    // Validate scoring_settings if provided
    if (scoring_settings) {
      try {
        // Get the league to check its type
        const league = await getLeagueById(leagueId);

        if (!league) {
          return this.respondNotFound(res, "League not found");
        }

        validateScoringSettings(scoring_settings);
      } catch (error: any) {
        return this.respondBadRequest(res, `Invalid scoring settings: ${error.message}`);
      }
    }

    // Validate roster_positions if provided
    if (roster_positions) {
      try {
        validateRosterPositions(roster_positions);
      } catch (error: any) {
        return this.respondBadRequest(res, `Invalid roster positions: ${error.message}`);
      }
    }

    // Get current league to check if total_rosters is changing
    const currentLeague = await getLeagueById(leagueId);
    if (!currentLeague) {
      return this.respondNotFound(res, "League not found");
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
      return this.respondNotFound(res, "League not found");
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

      // Handle scoring settings changes
      if (scoring_settings !== undefined) {
        const oldScoring = currentLeague.scoring_settings || {};
        for (const [stat, points] of Object.entries(scoring_settings)) {
          const oldPoints = oldScoring[stat];
          if (oldPoints !== points) {
            // Format stat name nicely (e.g., "pass_td" -> "Pass TD")
            const label = stat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            changes.push({
              field: `scoring.${stat}`,
              label: `${label} Points`,
              oldValue: oldPoints ?? 0,
              newValue: points
            });
          }
        }
      }

      // Handle roster positions changes
      if (roster_positions !== undefined) {
        const oldPositions = currentLeague.roster_positions || [];

        // Create maps for easier comparison
        const oldPosMap = new Map(oldPositions.map((p: any) => [p.position, p.count]));
        const newPosMap = new Map(roster_positions.map((p: any) => [p.position, p.count]));

        // Check for changed or new positions
        for (const pos of roster_positions) {
          const oldCount = oldPosMap.get(pos.position);
          if (oldCount !== pos.count) {
            changes.push({
              field: `roster.${pos.position}`,
              label: `${pos.position} Slots`,
              oldValue: oldCount ?? 0,
              newValue: pos.count
            });
          }
        }

        // Check for removed positions
        for (const [position, count] of oldPosMap.entries()) {
          if (!newPosMap.has(position)) {
            changes.push({
              field: `roster.${position}`,
              label: `${position} Slots`,
              oldValue: count,
              newValue: 0
            });
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

        // Parse metadata before emitting (it's stored as JSON string in DB)
        const messageToEmit = {
          ...chatMessage,
          metadata: typeof chatMessage.metadata === 'string'
            ? JSON.parse(chatMessage.metadata)
            : chatMessage.metadata
        };

        // Emit to league chat via socket
        emitLeagueChat(io, leagueId, messageToEmit);
      }
    } catch (notificationError) {
      console.error("Error sending settings change notification:", notificationError);
      // Don't fail the request if notification fails
    }

    this.respondSuccess(res, updatedLeague, "League settings updated successfully");
  });

  /**
   * Transfer commissioner role to another user
   * POST /api/leagues/:leagueId/transfer-commissioner
   */
  transferCommissioner = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { newCommissionerId } = req.body;

    if (!newCommissionerId) {
      return this.respondBadRequest(res, "New commissioner ID is required");
    }

    // Get current user ID from authenticated user
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
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
      return this.respondNotFound(res, "League not found");
    }

    this.respondSuccess(res, updatedLeague, "Commissioner role transferred successfully");
  });

  /**
   * Check if user is commissioner of a league
   * GET /api/leagues/:leagueId/is-commissioner
   */
  isCommissioner = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);
    const isCommissioner = commissionerId === userId;

    this.respondSuccess(res, {
      isCommissioner,
      commissionerId,
    });
  });

  /**
   * Remove a user from a league
   * POST /api/leagues/:leagueId/remove-member
   */
  removeLeagueMember = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const { userIdToRemove } = req.body;

    if (!userIdToRemove) {
      return this.respondBadRequest(res, "User ID to remove is required");
    }

    // Get current user ID from authenticated user
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Get league and verify user is commissioner
    const league = await getLeagueById(leagueId);

    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);

    if (commissionerId !== userId) {
      return this.respondForbidden(res, "Only the commissioner can remove members");
    }

    // Prevent removing commissioner
    if (userIdToRemove === commissionerId) {
      return this.respondBadRequest(res, "Cannot remove the commissioner from the league");
    }

    // Remove user's roster from league
    const { deleteRosterByLeagueAndUser } = await import("../models/Roster");
    await deleteRosterByLeagueAndUser(leagueId, userIdToRemove);

    this.respondSuccess(res, null, "Member removed from league successfully");
  });

  /**
   * Get league statistics
   * GET /api/leagues/:leagueId/stats
   */
  getLeagueStats = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    // Get league
    const league = await getLeagueById(leagueId);

if (!league) {
      return this.respondNotFound(res, "League not found");

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

    this.respondSuccess(res, stats);
  });

  /**
   * Reset league to pre-draft status
   * POST /api/leagues/:leagueId/reset
   */
  resetLeague = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "Not authenticated");
    }

    // Get league and verify user is commissioner (before transaction)
    const { getLeagueById, getCommissionerIdFromLeague, updateLeague } = await import("../models/League");
    const league = await getLeagueById(leagueId);

    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    const commissionerId = getCommissionerIdFromLeague(league);

    if (commissionerId !== userId) {
      return this.respondForbidden(res, "Only the commissioner can reset the league");
    }

    // DYNASTY GUARD: Prevent reset for dynasty leagues
    if (league.league_type === 'dynasty') {
      return this.respondBadRequest(res, "Dynasty leagues cannot be reset. Use season rollover to start a new season while keeping rosters intact.");
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete draft if it exists
      const { getDraftByLeagueId, deleteDraft } = await import("../models/Draft");
      const draft = await getDraftByLeagueId(leagueId);
      if (draft) {
        // Stop draft timer broadcasts before deleting draft
        const { stopTimerBroadcast } = await import("../socket/draftSocket");
        stopTimerBroadcast(draft.id);

        await deleteDraft(draft.id);
      }

      // Clear all roster lineups (remove all players but keep rosters)
      const { clearAllRosterLineups } = await import("../models/Roster");
      await clearAllRosterLineups(leagueId);

      // Delete all weekly lineups
      const { deleteWeeklyLineupsForLeague } = await import("../models/WeeklyLineup");
      await deleteWeeklyLineupsForLeague(leagueId);

      // Delete all matchups
      const { deleteMatchupsForLeague } = await import("../models/Matchup");
      await deleteMatchupsForLeague(leagueId);

      // Reset all roster records to 0-0-0
      const { resetAllRosterRecords } = await import("../services/recordService");
      await resetAllRosterRecords(leagueId);

      // Update league status to pre_draft
      await updateLeague(leagueId, {
        status: "pre_draft",
      });

      await client.query('COMMIT');

      // Send league chat notification about league reset
      try {
        const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
        const { emitLeagueChat } = await import("../socket/leagueSocket");
        const { io } = await import("../index");

        const message = 'Commissioner has reset the league to pre-draft status';

        const chatMessage = await createLeagueChatMessage({
          league_id: leagueId,
          user_id: null, // System message
          message,
          message_type: "system",
          metadata: {
            type: 'league_reset',
            collapsible: true,
            details: {
              description: 'All rosters, matchups, weekly lineups, and draft data have been cleared. The league is ready for a new draft.',
            }
          },
        });

        // Parse metadata before emitting (it's stored as JSON string in DB)
        const messageToEmit = {
          ...chatMessage,
          username: null,
          team_name: null,
          metadata: typeof chatMessage.metadata === 'string'
            ? JSON.parse(chatMessage.metadata)
            : chatMessage.metadata
        };

        // Emit to league chat via socket
        emitLeagueChat(io, leagueId, messageToEmit);
      } catch (notificationError) {
        console.error("Error sending league reset notification:", notificationError);
        // Don't fail the request if notification fails
      }

      // Emit socket event to notify clients that league was reset
      const { io } = await import("../index");
      io.to(`league_${leagueId}`).emit("league_reset", {
        leagueId: leagueId,
        message: "League has been reset to pre-draft status",
      });

      this.respondSuccess(res, null, "League reset to pre-draft status successfully");
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error("[resetLeagueHandler] Error:", error);
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Delete a league (commissioner only)
   * DELETE /api/leagues/:leagueId
   */
  deleteLeague = this.asyncHandler(async (
    req: Request,
    res: Response
  ) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");
    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Get league to check commissioner
    const league = await getLeagueById(leagueId);
    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      return this.respondForbidden(res, "Only the commissioner can delete the league");
    }

    // Delete all related data in cascade
    const pool = (await import("../config/database")).default;

    // Delete draft if it exists
    const { getDraftByLeagueId, deleteDraft } = await import("../models/Draft");
    const draft = await getDraftByLeagueId(leagueId);
    if (draft) {
      await deleteDraft(draft.id);
    }

    // Delete weekly lineups
    const { deleteWeeklyLineupsForLeague } = await import("../models/WeeklyLineup");
    await deleteWeeklyLineupsForLeague(leagueId);

    // Delete matchups
    const { deleteMatchupsForLeague } = await import("../models/Matchup");
    await deleteMatchupsForLeague(leagueId);

    // Delete league chat messages
    const { deleteLeagueChatMessages } = await import("../models/LeagueChatMessage");
    await deleteLeagueChatMessages(leagueId);

    // Delete rosters (this will cascade to roster-related tables)
    await pool.query("DELETE FROM rosters WHERE league_id = $1", [leagueId]);

    // Delete league invites
    await pool.query("DELETE FROM league_invites WHERE league_id = $1", [leagueId]);

    // Finally, delete the league itself
    await pool.query("DELETE FROM leagues WHERE id = $1", [leagueId]);

    this.respondSuccess(res, null, "League deleted successfully");
  });

  /**
   * Generate shareable league invitation link
   * POST /api/leagues/:leagueId/generate-invite-link
   */
  generateInviteLink = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    const userId = this.getAuthenticatedUserId(req);

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Get league and verify it exists
    const league = await getLeagueById(leagueId);

    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    // Verify user is commissioner
    const { getCommissionerIdFromLeague } = await import("../models/League");
    const commissionerId = getCommissionerIdFromLeague(league);

    if (commissionerId !== userId) {
      return this.respondForbidden(res, "Only the commissioner can generate invitation links");
    }

    // Generate invitation links
    const webLink = `https://hypetrain.netlify.app/invite.html?leagueId=${leagueId}`;
    const appLink = `tbdff://league/invite?leagueId=${leagueId}`;

    this.respondSuccess(res, {
      leagueId,
      webLink,
      appLink,
    });
  });

  /**
   * Get public league info for invite page
   * GET /api/leagues/:leagueId/public-info
   */
  getPublicLeagueInfo = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    // Get league and verify it exists
    const league = await getLeagueById(leagueId);

    if (!league) {
      return this.respondNotFound(res, "League not found");
    }

    // Get all rosters for the league
    const rosters = await getRostersByLeagueId(leagueId);

    this.respondSuccess(res, {
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
    });
  });
}

const controller = new LeagueController();

export const createLeagueHandler = controller.createLeague;
export const getUserLeaguesHandler = controller.getUserLeagues;
export const getPublicLeaguesHandler = controller.getPublicLeagues;
export const getLeagueDetailsHandler = controller.getLeagueDetails;
export const joinLeagueHandler = controller.joinLeague;
export const updateLeagueSettingsHandler = controller.updateLeagueSettings;
export const transferCommissionerHandler = controller.transferCommissioner;
export const isCommissionerHandler = controller.isCommissioner;
export const removeLeagueMemberHandler = controller.removeLeagueMember;
export const getLeagueStatsHandler = controller.getLeagueStats;
export const resetLeagueHandler = controller.resetLeague;
export const deleteLeagueHandler = controller.deleteLeague;
export const generateInviteLinkHandler = controller.generateInviteLink;
export const getPublicLeagueInfoHandler = controller.getPublicLeagueInfo;
