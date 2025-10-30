import { Request, Response } from 'express';
import { getInjuredPlayers } from '../models/Player';
import { getLeagueInjuryReport, syncInjuriesFromSleeper } from '../services/injuryService';

export async function getAllInjuriesHandler(_req: Request, res: Response) {
  try {
    const injuries = await getInjuredPlayers();

    return res.json({
      success: true,
      data: injuries,
    });
  } catch (error: any) {
    console.error('Error fetching injuries:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getLeagueInjuryReportHandler(req: Request, res: Response) {
  try {
    const { leagueId } = req.params;

    const report = await getLeagueInjuryReport(parseInt(leagueId));

    return res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    console.error('Error fetching league injury report:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function syncInjuriesHandler(_req: Request, res: Response) {
  try {
    // Manual sync trigger (commissioner only)
    const result = await syncInjuriesFromSleeper();

    return res.json({
      success: true,
      data: result,
      message: `Injury sync complete: ${result.updated} players updated`,
    });
  } catch (error: any) {
    console.error('Error syncing injuries:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
