import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireLeagueMember } from "../middleware/authorization";
import {
  rolloverSeasonHandler,
  getSeasonHistoryHandler,
  getDynastyStatusHandler
} from "../controllers/dynastyController";

const router = express.Router();

// Dynasty season management routes
router.post("/leagues/:leagueId/season/rollover", authenticate, requireLeagueMember, rolloverSeasonHandler);
router.get("/leagues/:leagueId/season/history", authenticate, requireLeagueMember, getSeasonHistoryHandler);
router.get("/leagues/:leagueId/dynasty/status", authenticate, requireLeagueMember, getDynastyStatusHandler);

export default router;
