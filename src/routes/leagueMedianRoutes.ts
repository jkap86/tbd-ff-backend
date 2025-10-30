import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getLeagueMedianSettingsHandler,
  updateLeagueMedianSettingsHandler,
  generateMedianMatchupsHandler,
  getWeekMedianHandler,
  updateMedianResultsHandler,
} from "../controllers/leagueMedianController";

const router = Router();

// GET league median settings
router.get("/league/:leagueId/settings", authenticate, getLeagueMedianSettingsHandler);

// Update league median settings (commissioner only)
router.post("/league/:leagueId/settings", authenticate, updateLeagueMedianSettingsHandler);

// Generate median matchups for week or season (commissioner only)
router.post("/league/:leagueId/generate", authenticate, generateMedianMatchupsHandler);

// Get median score for a specific week
router.get("/league/:leagueId/week/:week/median", authenticate, getWeekMedianHandler);

// Update median matchup results for a specific week (commissioner only)
router.post("/league/:leagueId/week/:week/update-results", authenticate, updateMedianResultsHandler);

export default router;
