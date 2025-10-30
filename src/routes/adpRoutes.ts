import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getPlayerADPHandler,
  getADPRankingsHandler,
  recalculateADPHandler,
} from "../controllers/adpController";

const router = express.Router();

// Get ADP for specific player
router.get("/player/:playerId", getPlayerADPHandler);

// Get ADP rankings (top 200)
router.get("/rankings", getADPRankingsHandler);

// Recalculate ADP (admin/cron)
router.post("/recalculate", authenticate, recalculateADPHandler);

export default router;
