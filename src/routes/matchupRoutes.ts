import { Router } from "express";
import {
  getMatchupsForWeek,
  getAllMatchupsForLeague,
  generateMatchups,
  updateScoresForWeek,
  getMatchupDetailsHandler,
  getMatchupScoresHandler,
} from "../controllers/matchupController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// GET /api/matchups/league/:leagueId - Get all matchups for a league
router.get("/league/:leagueId", getAllMatchupsForLeague);

// GET /api/matchups/league/:leagueId/week/:week - Get matchups for specific week
router.get("/league/:leagueId/week/:week", getMatchupsForWeek);

// GET /api/matchups/:matchupId/details - Get detailed matchup with rosters and players
router.get("/:matchupId/details", getMatchupDetailsHandler);

// GET /api/matchups/:matchupId/scores - Get detailed matchup with player scores
router.get("/:matchupId/scores", getMatchupScoresHandler);

// POST /api/matchups/league/:leagueId/week/:week/generate - Generate matchups (commissioner only)
router.post("/league/:leagueId/week/:week/generate", authenticate, generateMatchups);

// POST /api/matchups/league/:leagueId/week/:week/update-scores - Sync stats and update scores
router.post("/league/:leagueId/week/:week/update-scores", authenticate, updateScoresForWeek);

export default router;
