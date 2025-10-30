import { Router } from "express";
import {
  proposeTradeController,
  acceptTradeController,
  rejectTradeController,
  cancelTradeController,
  getTradeController,
} from "../controllers/tradeController";
import { authenticate } from "../middleware/authMiddleware";
import {
  requireTradeParticipant,
} from "../middleware/authorization";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Propose a trade (any authenticated user with roster)
router.post("/propose", proposeTradeController);

// Get a single trade (participants only)
router.get("/:id", requireTradeParticipant, getTradeController);

// Accept a trade (participants only)
router.post("/:id/accept", requireTradeParticipant, acceptTradeController);

// Reject a trade (participants only)
router.post("/:id/reject", requireTradeParticipant, rejectTradeController);

// Cancel a trade (participants only)
router.post("/:id/cancel", requireTradeParticipant, cancelTradeController);

// Get all trades for a league (will be called from league routes)
// GET /api/leagues/:id/trades

// Get all trades for a roster (will be called from roster routes)
// GET /api/rosters/:id/trades

export default router;
