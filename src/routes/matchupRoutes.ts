import { Router } from "express";
import {
  getMatchupsForWeek,
  getAllMatchupsForLeague,
  generateMatchups,
  updateScoresForWeek,
  getMatchupDetailsHandler,
  getMatchupScoresHandler,
  recalculateRecordsHandler,
  generateFullSeasonMatchups,
  deleteAllMatchupsForLeague,
} from "../controllers/matchupController";
import { authenticate } from "../middleware/authMiddleware";
import { cacheMatchup, cacheLeague } from "../middleware/cacheMiddleware";
import { CACHE_TTL } from "../utils/cache";

const router = Router();

// GET /api/matchups/league/:leagueId - Get all matchups for a league
// Cache for 1 minute - updated when games complete
router.get("/league/:leagueId", cacheLeague(CACHE_TTL.STANDINGS), getAllMatchupsForLeague);

// GET /api/matchups/league/:leagueId/week/:week - Get matchups for specific week
// Cache for 30 seconds - frequently accessed during game days
router.get("/league/:leagueId/week/:week", cacheMatchup(CACHE_TTL.MATCHUP), getMatchupsForWeek);

// GET /api/matchups/:matchupId/details - Get detailed matchup with rosters and players
// Cache for 30 seconds - includes live scores
router.get("/:matchupId/details", getMatchupDetailsHandler);

// GET /api/matchups/:matchupId/scores - Get detailed matchup with player scores
// Cache for 30 seconds - includes live scores
router.get("/:matchupId/scores", getMatchupScoresHandler);

// POST /api/matchups/league/:leagueId/week/:week/generate - Generate matchups (commissioner only)
router.post("/league/:leagueId/week/:week/generate", authenticate, generateMatchups);

// POST /api/matchups/league/:leagueId/generate-season - Generate full season matchups (commissioner only)
router.post("/league/:leagueId/generate-season", authenticate, generateFullSeasonMatchups);

// POST /api/matchups/league/:leagueId/week/:week/update-scores - Sync stats and update scores
router.post("/league/:leagueId/week/:week/update-scores", authenticate, updateScoresForWeek);

// POST /api/matchups/league/:leagueId/recalculate-records - Recalculate all records from scratch
router.post("/league/:leagueId/recalculate-records", authenticate, recalculateRecordsHandler);

// DELETE /api/matchups/league/:leagueId - Delete all matchups for a league (commissioner only)
router.delete("/league/:leagueId", authenticate, deleteAllMatchupsForLeague);

export default router;
