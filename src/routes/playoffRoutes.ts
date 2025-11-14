import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getPlayoffSettingsHandler,
  updatePlayoffSettingsHandler,
  generatePlayoffBracketHandler,
  getPlayoffBracketHandler,
  getPlayoffStandingsHandler,
  advancePlayoffRoundHandler,
  pickManualWinnerHandler,
} from "../controllers/playoffController";
import { cacheLeague } from "../middleware/cacheMiddleware";
import { CACHE_TTL } from "../utils/cache";

const router = Router();

// GET playoff settings
// Cache for 5 minutes - settings rarely change
router.get("/league/:leagueId/settings", authenticate, cacheLeague(CACHE_TTL.LEAGUE_SETTINGS), getPlayoffSettingsHandler);

// Update playoff settings (commissioner only)
router.post("/league/:leagueId/settings", authenticate, updatePlayoffSettingsHandler);

// Generate playoff bracket (commissioner only)
router.post("/league/:leagueId/generate", authenticate, generatePlayoffBracketHandler);

// Get playoff bracket
// Cache for 1 minute - updated when games complete
router.get("/league/:leagueId/bracket", authenticate, cacheLeague(CACHE_TTL.STANDINGS), getPlayoffBracketHandler);

// Get playoff standings/seedings
// Cache for 1 minute - expensive calculation, updated frequently
router.get("/league/:leagueId/standings", authenticate, cacheLeague(CACHE_TTL.STANDINGS), getPlayoffStandingsHandler);

// Advance playoff round (commissioner only)
router.post("/league/:leagueId/advance/:round", authenticate, advancePlayoffRoundHandler);

// Manually pick winner (commissioner only)
router.post("/matchups/:matchupId/pick-winner", authenticate, pickManualWinnerHandler);

export default router;
