import { Request, Response } from "express";
import {
  getPlayerADP,
  getTopPlayersByADP,
  calculateADP,
  syncSleeperADP,
} from "../services/adpService";
import { validateOptionalPositiveInteger } from "../utils/validation";
import { logger } from "../utils/logger";

export async function getPlayerADPHandler(req: Request, res: Response) {
  try {
    const { playerId } = req.params;
    const { season, draftType, leagueSize } = req.query;

    // Validate optional leagueSize parameter
    const leagueSizeNum = validateOptionalPositiveInteger(
      leagueSize as string | undefined,
      "League size"
    );

    const adp = await getPlayerADP(
      playerId,
      (season as string) || new Date().getFullYear().toString(),
      (draftType as string) || "all",
      leagueSizeNum
    );

    return res.json({
      success: true,
      data: adp,
    });
  } catch (error: any) {
    logger.error("Error fetching player ADP:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('size') || error.message.includes('must be'))) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getADPRankingsHandler(req: Request, res: Response) {
  try {
    const { season, draftType, leagueSize, position, limit } = req.query;

    // Validate optional query parameters
    const limitNum = validateOptionalPositiveInteger(
      limit as string | undefined,
      "Limit"
    );
    const leagueSizeNum = validateOptionalPositiveInteger(
      leagueSize as string | undefined,
      "League size"
    );

    const rankings = await getTopPlayersByADP(
      (season as string) || new Date().getFullYear().toString(),
      limitNum || 200,
      (draftType as string) || "all",
      leagueSizeNum,
      position as string | undefined
    );

    return res.json({
      success: true,
      data: rankings,
    });
  } catch (error: any) {
    logger.error("Error fetching ADP rankings:", error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('Limit') || error.message.includes('size') || error.message.includes('must be'))) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function recalculateADPHandler(req: Request, res: Response) {
  try {
    const { season } = req.body;

    const result = await calculateADP(
      season || new Date().getFullYear().toString()
    );

    // Also sync Sleeper as fallback
    await syncSleeperADP(season || new Date().getFullYear().toString());

    return res.json({
      success: true,
      data: result,
      message: "ADP calculation complete",
    });
  } catch (error: any) {
    logger.error("Error recalculating ADP:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
