import { Request, Response } from "express";
import {
  getWeeklyLineupWithPlayers,
  updateWeeklyLineup,
} from "../models/WeeklyLineup";
import { getTeamsWithGamesStarted } from "../services/sleeperScheduleService";
import { validateId, validatePositiveInteger } from "../utils/validation";
import { logger } from "../utils/logger";

/**
 * Get weekly lineup with player details
 * GET /api/weekly-lineups/roster/:rosterId/week/:week/season/:season
 */
export async function getWeeklyLineupHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { rosterId, week, season } = req.params;

    // Validate parameters
    const rosterIdNum = validateId(rosterId, "Roster ID");
    const weekNum = validatePositiveInteger(week, "Week");

    const lineup = await getWeeklyLineupWithPlayers(
      rosterIdNum,
      weekNum,
      season
    );

    res.status(200).json({
      success: true,
      data: lineup,
    });
  } catch (error: any) {
    logger.error("Error getting weekly lineup:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('Roster ID') || error.message.includes('Week') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error getting weekly lineup",
    });
  }
}

/**
 * Update weekly lineup
 * PUT /api/weekly-lineups/roster/:rosterId/week/:week/season/:season
 * Body: { starters: [{slot: string, player_id: number | null}] }
 */
export async function updateWeeklyLineupHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { rosterId, week, season } = req.params;
    const { starters, season_type = "regular" } = req.body;

    // Validate parameters
    const rosterIdNum = validateId(rosterId, "Roster ID");
    const weekNum = validatePositiveInteger(week, "Week");

    if (!starters || !Array.isArray(starters)) {
      res.status(400).json({
        success: false,
        message: "Starters array is required",
      });
      return;
    }

    // Check for locked players
    const teamsPlaying = await getTeamsWithGamesStarted(
      season,
      weekNum,
      season_type
    );

    // Get current lineup to check which players are being moved
    const currentLineup = await getWeeklyLineupWithPlayers(
      rosterIdNum,
      weekNum,
      season
    );

    // Get player details for the new starters
    const pool = await import("../config/database");
    const playerIds = starters
      .map((s) => s.player_id)
      .filter((id) => id !== null);

    if (playerIds.length > 0) {
      const playersQuery = `
        SELECT id, team
        FROM players
        WHERE id = ANY($1)
      `;
      const playersResult = await pool.default.query(playersQuery, [playerIds]);
      const playersMap = playersResult.rows.reduce((acc: any, p: any) => {
        acc[p.id] = p.team;
        return acc;
      }, {});

      // Check if any players being added to starters have games that started
      const lockedPlayers: string[] = [];
      for (const starter of starters) {
        if (starter.player_id) {
          const playerTeam = playersMap[starter.player_id];
          if (playerTeam && teamsPlaying.has(playerTeam)) {
            // Check if this player is being moved FROM bench to starters
            const wasInStarters = currentLineup.starters.some(
              (s: any) => s.player?.id === starter.player_id
            );

            if (!wasInStarters) {
              lockedPlayers.push(`Player ID ${starter.player_id} (${playerTeam})`);
            }
          }
        }
      }

      if (lockedPlayers.length > 0) {
        res.status(400).json({
          success: false,
          message: `Cannot move locked players to starters: ${lockedPlayers.join(", ")}. Their games have already started.`,
        });
        return;
      }
    }

    // If no locked players, proceed with update
    await updateWeeklyLineup(
      rosterIdNum,
      weekNum,
      season,
      starters
    );

    // Get lineup with player details to return
    const lineupWithPlayers = await getWeeklyLineupWithPlayers(
      rosterIdNum,
      weekNum,
      season
    );

    res.status(200).json({
      success: true,
      data: lineupWithPlayers,
      message: "Weekly lineup updated successfully",
    });
  } catch (error: any) {
    logger.error("Error updating weekly lineup:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('Roster ID') || error.message.includes('Week') || error.message.includes('must be'))) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error updating weekly lineup",
    });
  }
}
