import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireLeagueMember } from "../middleware/authorization";
import {
  selectKeeperHandler,
  removeKeeperHandler,
  getLeagueKeepersHandler,
  getRosterKeepersHandler,
  finalizeKeepersHandler
} from "../controllers/keeperController";

const router = express.Router();

// Keeper selection routes
router.post("/leagues/:leagueId/keepers", authenticate, requireLeagueMember, selectKeeperHandler);
router.delete("/leagues/:leagueId/keepers/:playerId", authenticate, requireLeagueMember, removeKeeperHandler);
router.get("/leagues/:leagueId/keepers", authenticate, requireLeagueMember, getLeagueKeepersHandler);
router.get("/rosters/:rosterId/keepers", authenticate, getRosterKeepersHandler);
router.post("/leagues/:leagueId/keepers/finalize", authenticate, requireLeagueMember, finalizeKeepersHandler);

export default router;
