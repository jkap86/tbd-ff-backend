import { Request, Response } from "express";
import { getRosterWithPlayers, getRosterById, updateRoster, validateLineup, validateSlotAssignment, getRostersByLeagueId } from "../models/Roster";
import { logger } from "../config/logger";
import { BaseController } from "./BaseController";
import { io } from "../index";
import { sendSystemMessageSafe } from "../services/leagueChatService";
import pool from "../config/database";

// Before: 244 lines
// After: 254 lines
// Lines saved: -10 (added better structure)

class RosterController extends BaseController {
  /**
   * Migrate rosters from BN slots to bench array
   * POST /api/rosters/league/:leagueId/fix-bn-slots
   */
  fixBenchSlots = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;

    logger.info(`[MigrateBench] Starting BN slot to bench array migration`, { league_id: leagueId });

    // If leagueId is 'all', migrate all rosters across all leagues
    let rosters;
    if (leagueId === 'all') {
      const pool = await import("../config/database");
      const result = await pool.default.query('SELECT * FROM rosters');
      rosters = result.rows;
      logger.info(`[MigrateBench] Migrating ALL rosters across all leagues`);
    } else {
      // Validate leagueId
      const leagueIdNum = this.validateId(leagueId, "League ID");
      rosters = await getRostersByLeagueId(leagueIdNum);
    }

    logger.info(`[MigrateBench] Found rosters to migrate`, { count: rosters.length, roster_ids: rosters.map(r => r.id) });

    let migratedCount = 0;
    let totalPlayersMoved = 0;

    for (const roster of rosters) {
      const fullRoster = await getRosterById(roster.id);
      if (!fullRoster) continue;

      const currentStarters = fullRoster.starters || [];
      const currentBench = fullRoster.bench || [];

      // Find BN slots in starters
      const bnSlots = currentStarters.filter((slot: any) =>
        slot.slot?.startsWith('BN')
      );

      // Find non-BN starters (the ones we want to keep)
      const nonBnStarters = currentStarters.filter((slot: any) =>
        !slot.slot?.startsWith('BN')
      );

      logger.info(`[MigrateBench] Roster stats`, { roster_id: roster.id, bn_slots: bnSlots.length, scoring_slots: nonBnStarters.length });

      if (bnSlots.length > 0) {
        // Extract player IDs from BN slots
        const bnPlayerIds = bnSlots
          .map((slot: any) => slot.player_id)
          .filter((id: number | null) => id !== null);

        logger.info(`[MigrateBench] Moving players from BN slots to bench array`, { roster_id: roster.id, player_count: bnPlayerIds.length });

        // Combine with existing bench players
        const newBench = [...currentBench, ...bnPlayerIds];

        // Update roster: remove BN slots from starters, add players to bench
        await updateRoster(roster.id, {
          starters: nonBnStarters,
          bench: newBench,
        });

        migratedCount++;
        totalPlayersMoved += bnPlayerIds.length;
        logger.info(`[MigrateBench] Migrated roster`, { roster_id: roster.id, players_moved: bnPlayerIds.length });
      } else {
        logger.info(`[MigrateBench] Roster has no BN slots to migrate`, { roster_id: roster.id });
      }
    }

    logger.info(`[MigrateBench] Migration completed`, { rosters_migrated: migratedCount, total_players_moved: totalPlayersMoved });

    this.respondSuccess(res, {
      migrated_count: migratedCount,
      total_players_moved: totalPlayersMoved,
    }, `Migrated ${migratedCount} rosters, moved ${totalPlayersMoved} players to bench array`);
  });

  /**
   * Diagnostic endpoint to check roster data
   * GET /api/rosters/:rosterId/debug
   */
  debugRoster = this.asyncHandler(async (req: Request, res: Response) => {
    const { rosterId } = req.params;

    // Validate rosterId
    const rosterIdNum = this.validateId(rosterId, "Roster ID");

    const roster = await getRosterById(rosterIdNum);

    if (!roster) {
      return this.respondNotFound(res, "Roster not found");
    }

    // Count slot types
    const starters = roster.starters || [];
    const bnSlots = starters.filter((s: any) => s.slot?.startsWith('BN'));
    const nonBnSlots = starters.filter((s: any) => !s.slot?.startsWith('BN'));
    const filledBnSlots = bnSlots.filter((s: any) => s.player_id != null);
    const filledStarters = nonBnSlots.filter((s: any) => s.player_id != null);

    const bench = roster.bench || [];
    const taxi = roster.taxi || [];
    const ir = roster.ir || [];

    this.respondSuccess(res, {
      roster_id: roster.roster_id,
      total_starter_slots: starters.length,
      bn_slots: {
        total: bnSlots.length,
        filled: filledBnSlots.length,
        empty: bnSlots.length - filledBnSlots.length,
        slots: bnSlots,
      },
      non_bn_starters: {
        total: nonBnSlots.length,
        filled: filledStarters.length,
        empty: nonBnSlots.length - filledStarters.length,
        slots: nonBnSlots,
      },
      bench_array: {
        length: bench.length,
        player_ids: bench,
      },
      taxi_array: {
        length: taxi.length,
        player_ids: taxi,
      },
      ir_array: {
        length: ir.length,
        player_ids: ir,
      },
      raw_data: {
        starters: roster.starters,
        bench: roster.bench,
        taxi: roster.taxi,
        ir: roster.ir,
      },
    });
  });

  /**
   * Get roster with player details
   * GET /api/rosters/:rosterId/players
   */
  getRosterWithPlayers = this.asyncHandler(async (req: Request, res: Response) => {
    const { rosterId } = req.params;

    // Validate rosterId
    const rosterIdNum = this.validateId(rosterId, "Roster ID");

    const roster = await getRosterWithPlayers(rosterIdNum);

    if (!roster) {
      return this.respondNotFound(res, "Roster not found");
    }

    this.respondSuccess(res, roster);
  });

  /**
   * Update roster lineup
   * PUT /api/rosters/:rosterId/lineup
   */
  updateRosterLineup = this.asyncHandler(async (req: Request, res: Response) => {
    const { rosterId } = req.params;
    const { starters, bench, taxi, ir } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    // Validate rosterId
    const rosterIdNum = this.validateId(rosterId, "Roster ID");

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Get the roster to check ownership
    const roster = await getRosterById(rosterIdNum);

    if (!roster) {
      return this.respondNotFound(res, "Roster not found");
    }

    // Verify user owns this roster
    if (roster.user_id !== userId) {
      return this.respondForbidden(res, "You can only update your own roster");
    }

    // Validate lineup if starters are being updated
    if (starters && starters.length > 0) {
      // Check if this is a single slot update by comparing with current roster
      const currentStarters = roster.starters || [];

      // Find which slots have changed
      const changedSlots = starters.filter((newSlot: any, index: number) => {
        const currentSlot = currentStarters[index];
        return !currentSlot || currentSlot.player_id !== newSlot.player_id;
      });

      // If only one slot changed, validate just that slot
      if (changedSlots.length === 1) {
        const changedSlot = changedSlots[0];
        const validation = await validateSlotAssignment(
          changedSlot.slot,
          changedSlot.player_id
        );
        if (!validation.valid) {
          return this.respondBadRequest(res, `Invalid lineup: ${validation.errors?.join(', ')}`);
        }
      } else {
        // Multiple changes, validate entire lineup
        const validation = await validateLineup(roster.league_id, starters);
        if (!validation.valid) {
          return this.respondBadRequest(res, `Invalid lineup: ${validation.errors?.join(', ')}`);
        }
      }
    }

    // Update the roster
    const updatedRoster = await updateRoster(rosterIdNum, {
      starters,
      bench,
      taxi,
      ir,
    });

    if (!updatedRoster) {
      return this.respondError(res, "Failed to update roster");
    }

    // Get updated roster with player details
    const rosterWithPlayers = await getRosterWithPlayers(rosterIdNum);

    this.respondSuccess(res, rosterWithPlayers, "Lineup updated successfully");
  });

  /**
   * Update roster dues paid status
   * PUT /api/rosters/:rosterId/dues
   */
  updateDuesStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const { rosterId } = req.params;
    const { dues_paid } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    // Validate rosterId
    const rosterIdNum = this.validateId(rosterId, "Roster ID");

    // Validate dues_paid is a boolean
    if (typeof dues_paid !== 'boolean') {
      return this.respondBadRequest(res, "dues_paid must be a boolean");
    }

    if (!userId) {
      return this.respondUnauthorized(res, "User not authenticated");
    }

    // Get the roster
    const roster = await getRosterById(rosterIdNum);

    if (!roster) {
      return this.respondNotFound(res, "Roster not found");
    }

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, roster.league_id);
    if (!auth) {
      return this.respondForbidden(res, "Only the league commissioner can perform this action");
    }

    // Update the roster settings with dues_paid status
    const currentSettings = roster.settings || {};
    const updatedSettings = {
      ...currentSettings,
      dues_paid,
    };

    // Update the roster
    const updatedRoster = await updateRoster(rosterIdNum, {
      settings: updatedSettings,
    });

    if (!updatedRoster) {
      return this.respondError(res, "Failed to update dues status");
    }

    // If marked as paid, send system message to league chat
    if (dues_paid) {
      // Get username from users table
      const userQuery = `SELECT username FROM users WHERE id = $1`;
      const userResult = await pool.query(userQuery, [roster.user_id]);
      const username = userResult.rows[0]?.username || "Unknown User";

      // Send system message (safe - won't fail the request)
      await sendSystemMessageSafe(io, roster.league_id, `${username} has paid`, {
        type: "dues_paid",
        roster_id: roster.id,
        user_id: roster.user_id,
      });
    }

    this.respondSuccess(res, updatedRoster, `Dues status updated to ${dues_paid ? 'paid' : 'unpaid'}`);
  });
}

const controller = new RosterController();

export const fixBenchSlotsHandler = controller.fixBenchSlots;
export const debugRosterHandler = controller.debugRoster;
export const getRosterWithPlayersHandler = controller.getRosterWithPlayers;
export const updateRosterLineupHandler = controller.updateRosterLineup;
export const updateDuesStatusHandler = controller.updateDuesStatus;
