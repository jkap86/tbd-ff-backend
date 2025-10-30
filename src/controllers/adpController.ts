import { Request, Response } from "express";
import {
  getPlayerADP,
  getTopPlayersByADP,
  calculateADP,
  syncSleeperADP,
} from "../services/adpService";

export async function getPlayerADPHandler(req: Request, res: Response) {
  try {
    const { playerId } = req.params;
    const { season, draftType, leagueSize } = req.query;

    const adp = await getPlayerADP(
      playerId,
      (season as string) || new Date().getFullYear().toString(),
      (draftType as string) || "all",
      leagueSize ? parseInt(leagueSize as string) : null
    );

    return res.json({
      success: true,
      data: adp,
    });
  } catch (error: any) {
    console.error("Error fetching player ADP:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getADPRankingsHandler(req: Request, res: Response) {
  try {
    const { season, draftType, leagueSize, position, limit } = req.query;

    const rankings = await getTopPlayersByADP(
      (season as string) || new Date().getFullYear().toString(),
      limit ? parseInt(limit as string) : 200,
      (draftType as string) || "all",
      leagueSize ? parseInt(leagueSize as string) : null,
      position as string | undefined
    );

    return res.json({
      success: true,
      data: rankings,
    });
  } catch (error: any) {
    console.error("Error fetching ADP rankings:", error);
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
    console.error("Error recalculating ADP:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
