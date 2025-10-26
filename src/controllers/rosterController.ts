import { Request, Response } from "express";
import { getRosterWithPlayers } from "../models/Roster";

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
