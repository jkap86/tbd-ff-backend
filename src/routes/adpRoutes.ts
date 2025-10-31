import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireAdmin } from "../middleware/authorization";
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

// Recalculate ADP (admin only - triggers expensive database operations)
router.post("/recalculate", authenticate, requireAdmin, recalculateADPHandler);

export default router;
