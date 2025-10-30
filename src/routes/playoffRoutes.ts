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

const router = Router();

// GET playoff settings
router.get("/league/:leagueId/settings", authenticate, getPlayoffSettingsHandler);

// Update playoff settings (commissioner only)
router.post("/league/:leagueId/settings", authenticate, updatePlayoffSettingsHandler);

// Generate playoff bracket (commissioner only)
router.post("/league/:leagueId/generate", authenticate, generatePlayoffBracketHandler);

// Get playoff bracket
router.get("/league/:leagueId/bracket", authenticate, getPlayoffBracketHandler);

// Get playoff standings/seedings
router.get("/league/:leagueId/standings", authenticate, getPlayoffStandingsHandler);

// Advance playoff round (commissioner only)
router.post("/league/:leagueId/advance/:round", authenticate, advancePlayoffRoundHandler);

// Manually pick winner (commissioner only)
router.post("/matchups/:matchupId/pick-winner", authenticate, pickManualWinnerHandler);

export default router;
