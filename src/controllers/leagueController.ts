import { Request, Response } from "express";
import pool from "../config/database";
import { logger } from "../config/logger";
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
import {
  randomizeOpponentSelectionOrder,
  getOpponentSelectionOrderWithDetails,
} from "../models/OpponentSelectionOrder";
import { leagueBusinessService } from "../services/leagueBusinessService";
import { BaseController } from "./BaseController";
import { eventBus } from "../index";
import { sendSystemMessageSafe, sendCollapsibleSystemMessageSafe } from "../services/leagueChatService";
import { invalidateLeagueCache } from "../utils/cache";

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
    logger.info('[getUserLeagues] Request for userId', { userId: req.params.userId });
    const userId = this.validateId(req.params.userId, "User ID");

    const leagues = await getLeaguesForUser(userId);
    logger.info('[getUserLeagues] Found leagues', { count: leagues.length });

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

    // Check for empty roster slots (user_id is null)
    const rosters = await getRostersByLeagueId(leagueId);
    const emptyRoster = rosters.find((r: any) => r.user_id === null);

    let roster;

    if (emptyRoster) {
      // Assign user to existing empty roster slot
      const { updateRoster } = await import("../models/Roster");
      const teamName = team_name || emptyRoster.settings?.team_name || `Team ${emptyRoster.roster_id}`;

      roster = await updateRoster(emptyRoster.id, {
        user_id: userId,
        settings: {
          ...emptyRoster.settings,
          team_name: teamName,
        },
      });

      logger.info('[LeagueController] Assigned user to existing roster', { user_id: userId, roster_id: emptyRoster.roster_id, league_id: leagueId });
    } else {
      // No empty slots, check if league is full
      if (rosters.length >= league.total_rosters) {
        return this.respondBadRequest(res, `League is full (${rosters.length}/${league.total_rosters} teams)`);
      }

      // Get next available roster_id
      const nextRosterId = await getNextRosterId(leagueId);

      // Create roster for user
      roster = await createRoster({
        league_id: leagueId,
        user_id: userId,
        roster_id: nextRosterId,
        team_name: team_name || `Team ${nextRosterId}`,
      });

      logger.info('[LeagueController] Created new roster', { roster_id: nextRosterId, user_id: userId, league_id: leagueId });
    }

    // Ensure roster was created/updated successfully
    if (!roster) {
      return this.respondError(res, "Failed to create or update roster", 500);
    }

    // Send system notification to league chat
    const { getUserById } = await import("../models/User");
    const user = await getUserById(userId);
    const teamName = roster.settings?.team_name || team_name || `Team ${roster.roster_id}`;
    const username = user?.username || `User ${userId}`;

    // TODO: Refactor sendSystemMessageSafe to accept IEventBus
    const io = eventBus.getSocketIOInstance();
    await sendSystemMessageSafe(io, leagueId, `${username} has joined the league as ${teamName}`, {
      type: "user_joined",
      joined_user_id: userId,
      joined_username: username,
      team_name: teamName,
      roster_id: roster.id,
    });

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
      buy_in,
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

    // Validate that we're not reducing total_rosters below occupied roster count
    if (total_rosters !== undefined && total_rosters < oldTotalRosters) {
      const { getRostersByLeagueId } = await import("../models/Roster");
      const currentRosters = await getRostersByLeagueId(leagueId);

      // Only count rosters that have users assigned (not empty slots)
      const occupiedRosters = currentRosters.filter((r: any) => r.user_id !== null);

      if (occupiedRosters.length > total_rosters) {
        return this.respondBadRequest(
          res,
          `Cannot reduce team limit to ${total_rosters}. League currently has ${occupiedRosters.length} teams with users. Remove teams first or set limit to at least ${occupiedRosters.length}.`
        );
      }
    }

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
      buy_in,
    });

    if (!updatedLeague) {
      return this.respondNotFound(res, "League not found");
    }

    // Clean up empty rosters if we reduced the limit
    if (total_rosters !== undefined && total_rosters < oldTotalRosters) {
      const { getRostersByLeagueId } = await import("../models/Roster");
      const currentRosters = await getRostersByLeagueId(leagueId);

      // Delete empty rosters (user_id = null) beyond the new limit
      const rostersToDelete = currentRosters.filter(
        (r: any) => r.user_id === null && r.roster_id > total_rosters
      );

      if (rostersToDelete.length > 0) {
        logger.info('[LeagueController] Deleting empty rosters', { count: rostersToDelete.length, limit: total_rosters });

        for (const roster of rostersToDelete) {
          await pool.query('DELETE FROM rosters WHERE id = $1', [roster.id]);
        }
      }
    }

    // Handle draft order reset if roster count changed
    if (rosterCountChanged) {
      try {
        logger.info('[LeagueController] Roster count changed', { old_total: oldTotalRosters, new_total: newTotalRosters, league_id: leagueId });

        const { getDraftByLeagueId } = await import("../models/Draft");
        const { getRostersByLeagueId } = await import("../models/Roster");
        const { randomizeDraftOrder } = await import("../models/DraftOrder");

        const draft = await getDraftByLeagueId(leagueId);

        if (draft && draft.status === "not_started") {
          logger.info('[LeagueController] Resetting draft order', { draft_id: draft.id });

          // Get current rosters for the league
          const rosters = await getRostersByLeagueId(leagueId);
          const rosterIds = rosters.map((r) => r.id);

          if (rosterIds.length > 0) {
            // Regenerate randomized draft order
            await randomizeDraftOrder(draft.id, rosterIds);
            logger.info('[LeagueController] Draft order regenerated', { roster_count: rosterIds.length });
          }
        } else if (draft) {
          logger.info('[LeagueController] Draft status is not "not_started", skipping order reset', { draft_id: draft.id, status: draft.status });
        }
      } catch (draftOrderError: any) {
        logger.error("Error resetting draft order:", draftOrderError);
        // Don't fail the request if draft order reset fails
      }
    }

    // Send league chat notification about settings change
    try {

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
          // Skip payout_structure - it will be handled separately
          if (key === 'payout_structure') continue;

          // Special handling for dues to handle type coercion
          if (key === 'dues') {
            const oldDues = Number(oldSettings[key] || 0);
            const newDues = Number(value || 0);
            if (oldDues !== newDues) {
              changes.push({
                field: `settings.${key}`,
                label: 'Buy In',
                oldValue: `$${oldDues.toFixed(2)}`,
                newValue: `$${newDues.toFixed(2)}`
              });
            }
          } else if (oldSettings[key] !== value) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            changes.push({ field: `settings.${key}`, label, oldValue: oldSettings[key], newValue: value });
          }
        }

        // Handle payout_structure changes separately
        if ('payout_structure' in settings) {
          const oldPayouts = oldSettings['payout_structure'] || [];
          const newPayouts = settings['payout_structure'] || [];

          // Format payout structure for display
          const formatPayouts = (payouts: any[]) => {
            if (!Array.isArray(payouts) || payouts.length === 0) {
              return 'None';
            }

            // Group payouts by type
            const groupedByType: {[key: string]: any[]} = {};
            payouts.forEach((p: any) => {
              if (!groupedByType[p.type]) {
                groupedByType[p.type] = [];
              }
              groupedByType[p.type].push(p);
            });

            const typeLabels: {[key: string]: string} = {
              'placement': 'Playoff Finish',
              'placement_points': 'Points Ranking',
              'highest_weekly_score': 'Highest Week Score',
              'regular_season_winner': 'Regular Season Finish',
              'highest_points_non_playoff': 'Highest Points (Non-Playoff)',
            };

            const ordinal = (n: number) => {
              if (n === 1) return '1st';
              if (n === 2) return '2nd';
              if (n === 3) return '3rd';
              return `${n}th`;
            };

            // Format each type group
            const lines: string[] = [];
            for (const [type, typePayouts] of Object.entries(groupedByType)) {
              const typeLabel = typeLabels[type] || type;
              lines.push(`${typeLabel}:`);

              // Add each place on its own line
              typePayouts
                .sort((a, b) => (a.place || 0) - (b.place || 0))
                .forEach((p: any) => {
                  const placeLabel = p.place ? ordinal(p.place) : '';
                  const percentage = p.percentage ? `${p.percentage.toFixed(1)}%` : '';
                  if (placeLabel) {
                    lines.push(`  ${placeLabel}: ${percentage}`);
                  } else {
                    lines.push(`  ${percentage}`);
                  }
                });
            }

            return lines.join('\n');
          };

          const oldPayoutStr = formatPayouts(oldPayouts);
          const newPayoutStr = formatPayouts(newPayouts);

          if (oldPayoutStr !== newPayoutStr) {
            changes.push({
              field: 'settings.payout_structure',
              label: 'Payout Structure',
              oldValue: oldPayoutStr,
              newValue: newPayoutStr
            });
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
        // TODO: Refactor sendCollapsibleSystemMessageSafe to accept IEventBus
        const io = eventBus.getSocketIOInstance();
        await sendCollapsibleSystemMessageSafe(
          io,
          leagueId,
          'Commissioner has updated league settings',
          'league_settings_update',
          {
            changes: changes,
            draft_order_regenerated: rosterCountChanged,
          }
        );
      }
    } catch (notificationError) {
      logger.error("Error sending settings change notification:", notificationError);
      // Don't fail the request if notification fails
    }

    // Invalidate league cache after settings update
    await invalidateLeagueCache(leagueId);

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

      // TODO: Refactor sendCollapsibleSystemMessageSafe to accept IEventBus
      const io = eventBus.getSocketIOInstance();

      // Send league chat notification about league reset
      await sendCollapsibleSystemMessageSafe(
        io,
        leagueId,
        'Commissioner has reset the league to pre-draft status',
        'league_reset',
        {
          description: 'All rosters, matchups, weekly lineups, and draft data have been cleared. The league is ready for a new draft.',
        }
      );

      // Emit socket event to notify clients that league was reset
      eventBus.emitToRoom(`league_${leagueId}`, "league_reset", {
        leagueId: leagueId,
        message: "League has been reset to pre-draft status",
      });

      // Invalidate all league cache after reset
      await invalidateLeagueCache(leagueId);

      this.respondSuccess(res, null, "League reset to pre-draft status successfully");
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error("[resetLeagueHandler] Error:", error);
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
    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, leagueId);
    if (!auth) {
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

  /**
   * Get opponent selection order for a league
   * GET /api/leagues/:leagueId/opponent-selection-order
   */
  getOpponentSelectionOrder = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    // Get the opponent selection order with details
    const orderWithDetails = await getOpponentSelectionOrderWithDetails(leagueId);

    this.respondSuccess(res, orderWithDetails);
  });

  /**
   * Randomize opponent selection order for a league
   * POST /api/leagues/:leagueId/randomize-opponent-selection-order
   */
  randomizeOpponentSelectionOrder = this.asyncHandler(async (req: Request, res: Response) => {
    const leagueId = this.validateId(req.params.leagueId, "League ID");

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, leagueId);
    if (!auth) {
      return this.respondForbidden(res, "Only the commissioner can randomize opponent selection order");
    }

    // Get all rosters for the league
    const rosters = await getRostersByLeagueId(leagueId);
    if (rosters.length === 0) {
      return this.respondBadRequest(res, "No rosters found for this league");
    }

    // Randomize the opponent selection order
    const rosterIds = rosters.map(r => r.id);
    await randomizeOpponentSelectionOrder(leagueId, rosterIds);

    // Get the randomized order with details
    const orderWithDetails = await getOpponentSelectionOrderWithDetails(leagueId);

    this.respondSuccess(res, orderWithDetails, "Opponent selection order randomized successfully");
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
export const getOpponentSelectionOrderHandler = controller.getOpponentSelectionOrder;
export const randomizeOpponentSelectionOrderHandler = controller.randomizeOpponentSelectionOrder;
