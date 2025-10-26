import { Request, Response } from "express";
import { getRosterWithPlayers, getRosterById, updateRoster, validateLineup, validateSlotAssignment } from "../models/Roster";

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

    const roster = await getRosterWithPlayers(parseInt(rosterId));

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
    console.error("Error getting roster with players:", error);
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

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get the roster to check ownership
    const roster = await getRosterById(parseInt(rosterId));

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
    const updatedRoster = await updateRoster(parseInt(rosterId), {
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
    const rosterWithPlayers = await getRosterWithPlayers(parseInt(rosterId));

    res.status(200).json({
      success: true,
      data: rosterWithPlayers,
      message: "Lineup updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating roster lineup:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating roster lineup",
    });
  }
}
