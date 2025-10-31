import { Request, Response } from "express";
import { getRosterWithPlayers, getRosterById, updateRoster, validateLineup, validateSlotAssignment, getRostersByLeagueId } from "../models/Roster";
import { validateId } from "../utils/validation";
import { logger } from "../utils/logger";

/**
 * Migrate rosters from BN slots to bench array
 * POST /api/rosters/league/:leagueId/fix-bn-slots
 */
export async function fixBenchSlotsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;

    console.log(`[MigrateBench] Starting BN slot to bench array migration for league ${leagueId}`);

    // If leagueId is 'all', migrate all rosters across all leagues
    let rosters;
    if (leagueId === 'all') {
      const pool = await import("../config/database");
      const result = await pool.default.query('SELECT * FROM rosters');
      rosters = result.rows;
      console.log(`[MigrateBench] Migrating ALL rosters across all leagues`);
    } else {
      // Validate leagueId
      const leagueIdNum = validateId(leagueId, "League ID");
      rosters = await getRostersByLeagueId(leagueIdNum);
    }

    console.log(`[MigrateBench] Found ${rosters.length} rosters to migrate`);
    console.log(`[MigrateBench] Roster IDs:`, rosters.map(r => r.id));

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

      console.log(`[MigrateBench] Roster ${roster.id}: ${bnSlots.length} BN slots, ${nonBnStarters.length} scoring slots`);

      if (bnSlots.length > 0) {
        // Extract player IDs from BN slots
        const bnPlayerIds = bnSlots
          .map((slot: any) => slot.player_id)
          .filter((id: number | null) => id !== null);

        console.log(`[MigrateBench] Roster ${roster.id}: Moving ${bnPlayerIds.length} players from BN slots to bench array`);

        // Combine with existing bench players
        const newBench = [...currentBench, ...bnPlayerIds];

        // Update roster: remove BN slots from starters, add players to bench
        await updateRoster(roster.id, {
          starters: nonBnStarters,
          bench: newBench,
        });

        migratedCount++;
        totalPlayersMoved += bnPlayerIds.length;
        console.log(`[MigrateBench] Migrated roster ${roster.id}: ${bnPlayerIds.length} players moved to bench`);
      } else {
        console.log(`[MigrateBench] Roster ${roster.id} has no BN slots to migrate`);
      }
    }

    console.log(`[MigrateBench] Completed: Migrated ${migratedCount} rosters, moved ${totalPlayersMoved} total players`);

    res.status(200).json({
      success: true,
      message: `Migrated ${migratedCount} rosters, moved ${totalPlayersMoved} players to bench array`,
      migrated_count: migratedCount,
      total_players_moved: totalPlayersMoved,
    });
  } catch (error: any) {
    logger.error("[FixBN] Error fixing bench slots:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('League ID') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error fixing bench slots",
    });
  }
}

/**
 * Diagnostic endpoint to check roster data
 * GET /api/rosters/:rosterId/debug
 */
export async function debugRosterHandler(req: Request, res: Response): Promise<void> {
  try {
    const { rosterId } = req.params;

    // Validate rosterId
    const rosterIdNum = validateId(rosterId, "Roster ID");

    const roster = await getRosterById(rosterIdNum);

    if (!roster) {
      res.status(404).json({
        success: false,
        message: "Roster not found",
      });
      return;
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

    res.status(200).json({
      success: true,
      data: {
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
      },
    });
  } catch (error: any) {
    logger.error("Error debugging roster:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('Roster ID') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error debugging roster",
    });
  }
}

/**
 * Get roster with player details
 * GET /api/rosters/:rosterId/players
 */
export async function getRosterWithPlayersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { rosterId } = req.params;

    // Validate rosterId
    const rosterIdNum = validateId(rosterId, "Roster ID");

    const roster = await getRosterWithPlayers(rosterIdNum);

    if (!roster) {
      res.status(404).json({
        success: false,
        message: "Roster not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: roster,
    });
  } catch (error: any) {
    logger.error("Error getting roster with players:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('Roster ID') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error getting roster with players",
    });
  }
}

/**
 * Update roster lineup
 * PUT /api/rosters/:rosterId/lineup
 */
export async function updateRosterLineupHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { rosterId } = req.params;
    const { starters, bench, taxi, ir } = req.body;
    const userId = req.user?.userId;

    // Validate rosterId
    const rosterIdNum = validateId(rosterId, "Roster ID");

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get the roster to check ownership
    const roster = await getRosterById(rosterIdNum);

    if (!roster) {
      res.status(404).json({
        success: false,
        message: "Roster not found",
      });
      return;
    }

    // Verify user owns this roster
    if (roster.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "You can only update your own roster",
      });
      return;
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
          res.status(400).json({
            success: false,
            message: "Invalid lineup",
            errors: validation.errors,
          });
          return;
        }
      } else {
        // Multiple changes, validate entire lineup
        const validation = await validateLineup(roster.league_id, starters);
        if (!validation.valid) {
          res.status(400).json({
            success: false,
            message: "Invalid lineup",
            errors: validation.errors,
          });
          return;
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
      res.status(500).json({
        success: false,
        message: "Failed to update roster",
      });
      return;
    }

    // Get updated roster with player details
    const rosterWithPlayers = await getRosterWithPlayers(rosterIdNum);

    res.status(200).json({
      success: true,
      data: rosterWithPlayers,
      message: "Lineup updated successfully",
    });
  } catch (error: any) {
    logger.error("Error updating roster lineup:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('Roster ID') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error updating roster lineup",
    });
  }
}
