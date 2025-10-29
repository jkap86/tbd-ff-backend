import { Router } from "express";
import { getRosterWithPlayersHandler, updateRosterLineupHandler, fixBenchSlotsHandler, debugRosterHandler } from "../controllers/rosterController";
import { authenticate } from "../middleware/authMiddleware";
import { getRosterTradesController } from "../controllers/tradeController";

const router = Router();

// Fix missing BN slots for all rosters in a league (migration endpoint - no auth required)
router.post("/league/:leagueId/fix-bn-slots", fixBenchSlotsHandler);

// Debug roster data
router.get("/:rosterId/debug", authenticate, debugRosterHandler);

// Get roster with player details
router.get("/:rosterId/players", authenticate, getRosterWithPlayersHandler);

// Update roster lineup
router.put("/:rosterId/lineup", authenticate, updateRosterLineupHandler);


// GET /api/rosters/:id/trades - Get all trades for a roster
router.get("/:id/trades", getRosterTradesController);

export default router;
