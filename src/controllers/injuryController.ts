import { Request, Response } from 'express';
import { getInjuredPlayers } from '../models/Player';
import { getLeagueInjuryReport, syncInjuriesFromSleeper } from '../services/injuryService';
import { validateId } from '../utils/validation';
import { logger } from '../utils/logger';

export async function getAllInjuriesHandler(_req: Request, res: Response) {
  try {
    const injuries = await getInjuredPlayers();

    return res.json({
      success: true,
      data: injuries,
    });
  } catch (error: any) {
    logger.error('Error fetching injuries:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getLeagueInjuryReportHandler(req: Request, res: Response) {
  try {
    const { leagueId } = req.params;

    // Validate leagueId
    const leagueIdNum = validateId(leagueId, 'League ID');

    const report = await getLeagueInjuryReport(leagueIdNum);

    return res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    logger.error('Error fetching league injury report:', error);

    // Return 400 for validation errors
    if (error.message && (error.message.includes('League ID') || error.message.includes('must be'))) {
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
    logger.error('Error syncing injuries:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
