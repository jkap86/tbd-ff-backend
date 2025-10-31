import { Request, Response, NextFunction } from "express";
import { getLeagueById } from "../models/League";

/**
 * Middleware to require league is dynasty type
 */
export async function requireDynasty(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID"
      });
      return;
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found"
      });
      return;
    }

    if (league.league_type !== 'dynasty') {
      res.status(400).json({
        success: false,
        message: "This operation is only available for dynasty leagues"
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error("Dynasty guard error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify league type"
    });
  }
}

/**
 * Middleware to require league is NOT dynasty type
 */
export async function requireNotDynasty(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID"
      });
      return;
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found"
      });
      return;
    }

    if (league.league_type === 'dynasty') {
      res.status(400).json({
        success: false,
        message: "This operation is not available for dynasty leagues. Use season rollover instead."
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error("Dynasty guard error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify league type"
    });
  }
}

/**
 * Middleware to require keeper selection period is open
 * (Between season end and draft start)
 */
export async function requireKeeperPeriod(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID"
      });
      return;
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found"
      });
      return;
    }

    // Allow keeper selections during pre_draft status
    // In production, you might add date-based checks here
    if (league.status !== 'pre_draft') {
      res.status(400).json({
        success: false,
        message: "Keeper selections only allowed during pre-draft period"
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error("Keeper period guard error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify keeper period"
    });
  }
}

/**
 * Middleware to require user is league commissioner
 * Note: This duplicates some functionality from authorization.ts requireCommissioner
 * but is included here for completeness of the dynastyGuards module
 */
export async function requireCommissioner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
      return;
    }

    if (isNaN(leagueId)) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID"
      });
      return;
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found"
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;

    if (commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can perform this action"
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error("Commissioner guard error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify commissioner status"
    });
  }
}
