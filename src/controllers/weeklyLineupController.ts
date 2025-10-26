import { Request, Response } from "express";
import {
  getWeeklyLineupWithPlayers,
  updateWeeklyLineup,
} from "../models/WeeklyLineup";
import { getTeamsWithGamesStarted } from "../services/sleeperScheduleService";

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

    const lineup = await getWeeklyLineupWithPlayers(
      parseInt(rosterId),
      parseInt(week),
      season
    );

    res.status(200).json({
      success: true,
      data: lineup,
    });
  } catch (error: any) {
    console.error("Error getting weekly lineup:", error);
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
      parseInt(week),
      season_type
    );

    // Get current lineup to check which players are being moved
    const currentLineup = await getWeeklyLineupWithPlayers(
      parseInt(rosterId),
      parseInt(week),
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
      parseInt(rosterId),
      parseInt(week),
      season,
      starters
    );

    // Get lineup with player details to return
    const lineupWithPlayers = await getWeeklyLineupWithPlayers(
      parseInt(rosterId),
      parseInt(week),
      season
    );

    res.status(200).json({
      success: true,
      data: lineupWithPlayers,
      message: "Weekly lineup updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating weekly lineup:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating weekly lineup",
    });
  }
}
