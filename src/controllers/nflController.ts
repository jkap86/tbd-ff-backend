import { Request, Response } from "express";
import { getCurrentNFLWeek } from "../services/currentWeekService";

/**
 * Get current NFL week
 * GET /api/nfl/current-week?season=2025
 */
export async function getCurrentWeek(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { season, season_type = "regular" } = req.query;

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    const currentWeek = await getCurrentNFLWeek(
      season as string,
      season_type as string
    );

    res.status(200).json({
      success: true,
      data: {
        season: season as string,
        week: currentWeek,
        season_type: season_type as string,
      },
    });
  } catch (error: any) {
    console.error("Error getting current week:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting current week",
    });
  }
}
