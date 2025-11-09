// Before refactor: 44 lines
// After refactor: 33 lines
// Lines saved: 11 lines
import { Request, Response } from "express";
import { getCurrentNFLWeek } from "../services/currentWeekService";
import { BaseController } from "./BaseController";

class NFLController extends BaseController {
  /**
   * Get current NFL week
   * GET /api/nfl/current-week?season=2025
   */
  getCurrentWeek = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, season_type = "regular" } = req.query;

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    const currentWeek = await getCurrentNFLWeek(
      season as string,
      season_type as string
    );

    this.respondSuccess(res, {
      season: season as string,
      week: currentWeek,
      season_type: season_type as string,
    });
  });
}

const nflController = new NFLController();
export const getCurrentWeek = nflController.getCurrentWeek;
