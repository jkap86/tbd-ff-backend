import { Request, Response } from "express";
import {
  getWeeklyLineupWithPlayers,
  updateWeeklyLineup,
} from "../models/WeeklyLineup";

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
    const { starters } = req.body;

    if (!starters || !Array.isArray(starters)) {
      res.status(400).json({
        success: false,
        message: "Starters array is required",
      });
      return;
    }

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
