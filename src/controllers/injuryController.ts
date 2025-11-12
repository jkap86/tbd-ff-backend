// Original: 73 lines | Refactored: 47 lines | Saved: 26 lines
import { Request, Response } from 'express';
import { getInjuredPlayers } from '../models/Player';
import { getLeagueInjuryReport, syncInjuriesFromSleeper } from '../services/injuryService';
import { BaseController } from './BaseController';

class InjuryController extends BaseController {
  getAllInjuries = this.asyncHandler(async (_req: Request, res: Response) => {
    const injuries = await getInjuredPlayers();
    this.respondSuccess(res, injuries);
  });

  getLeagueInjuryReport = this.asyncHandler(async (req: Request, res: Response) => {
    const { leagueId } = req.params;

    // Validate leagueId
    const leagueIdNum = this.validateId(leagueId, 'League ID');

    const report = await getLeagueInjuryReport(leagueIdNum);

    this.respondSuccess(res, report);
  });

  syncInjuries = this.asyncHandler(async (_req: Request, res: Response) => {
    // Manual sync trigger (commissioner only)
    const result = await syncInjuriesFromSleeper();

    this.respondSuccess(
      res,
      result,
      `Injury sync complete: ${result.updated} players updated`
    );
  });
}

const injuryController = new InjuryController();

export const getAllInjuriesHandler = injuryController.getAllInjuries;
export const getLeagueInjuryReportHandler = injuryController.getLeagueInjuryReport;
export const syncInjuriesHandler = injuryController.syncInjuries;
