import { Router } from "express";
import {
  proposeTradeController,
  acceptTradeController,
  rejectTradeController,
  cancelTradeController,
  getTradeController,
} from "../controllers/tradeController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Propose a trade
router.post("/propose", proposeTradeController);

// Get a single trade
router.get("/:id", getTradeController);

// Accept a trade
router.post("/:id/accept", acceptTradeController);

// Reject a trade
router.post("/:id/reject", rejectTradeController);

// Cancel a trade
router.post("/:id/cancel", cancelTradeController);

// Get all trades for a league (will be called from league routes)
// GET /api/leagues/:id/trades

// Get all trades for a roster (will be called from roster routes)
// GET /api/rosters/:id/trades

export default router;
