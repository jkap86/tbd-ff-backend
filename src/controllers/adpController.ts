// Original: 119 lines | Refactored: 76 lines | Saved: 43 lines
import { Request, Response } from "express";
import {
  getPlayerADP,
  getTopPlayersByADP,
  calculateADP,
  syncSleeperADP,
} from "../services/adpService";
import { validateOptionalPositiveInteger } from "../utils/validation";
import { BaseController } from "./BaseController";

class ADPController extends BaseController {
  getPlayerADP = this.asyncHandler(async (req: Request, res: Response) => {
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

    this.respondSuccess(res, adp);
  });

  getADPRankings = this.asyncHandler(async (req: Request, res: Response) => {
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

    this.respondSuccess(res, rankings);
  });

  recalculateADP = this.asyncHandler(async (req: Request, res: Response) => {
    const { season } = req.body;

    const result = await calculateADP(
      season || new Date().getFullYear().toString()
    );

    // Also sync Sleeper as fallback
    await syncSleeperADP(season || new Date().getFullYear().toString());

    this.respondSuccess(res, result, "ADP calculation complete");
  });
}

const adpController = new ADPController();

export const getPlayerADPHandler = adpController.getPlayerADP;
export const getADPRankingsHandler = adpController.getADPRankings;
export const recalculateADPHandler = adpController.recalculateADP;
