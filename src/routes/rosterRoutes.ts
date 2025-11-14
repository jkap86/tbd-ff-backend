import { Router } from "express";
import { getRosterWithPlayersHandler, updateRosterLineupHandler, fixBenchSlotsHandler, debugRosterHandler, updateDuesStatusHandler } from "../controllers/rosterController";
import { authenticate } from "../middleware/authMiddleware";
import { handleValidationErrors } from "../middleware/validationMiddleware";
import {
  requireRosterOwnership,
} from "../middleware/authorization";
import { getRosterTradesController } from "../controllers/tradeController";
import { setLineupValidator, rosterIdValidator } from "../validators/roster.validator";

const router = Router();

// Fix missing BN slots for all rosters in a league (migration endpoint - no auth required)
router.post("/league/:leagueId/fix-bn-slots", fixBenchSlotsHandler);

// Debug roster data
router.get("/:rosterId/debug", authenticate, debugRosterHandler);

// Get roster with player details
router.get("/:rosterId/players", authenticate, rosterIdValidator, handleValidationErrors, getRosterWithPlayersHandler);

// Update roster lineup (must own roster)
router.put("/:rosterId/lineup", authenticate, requireRosterOwnership, setLineupValidator, handleValidationErrors, updateRosterLineupHandler);

// Update roster dues paid status (commissioner only - checked in controller)
router.put("/:rosterId/dues", authenticate, rosterIdValidator, handleValidationErrors, updateDuesStatusHandler);

// GET /api/rosters/:id/trades - Get all trades for a roster
router.get("/:id/trades", authenticate, rosterIdValidator, handleValidationErrors, getRosterTradesController);

export default router;
