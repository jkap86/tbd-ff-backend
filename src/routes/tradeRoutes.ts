import { Router } from "express";
import {
  proposeTradeController,
  acceptTradeController,
  rejectTradeController,
  cancelTradeController,
  getTradeController,
} from "../controllers/tradeController";
import { authenticate } from "../middleware/authMiddleware";
import { handleValidationErrors } from "../middleware/validationMiddleware";
import {
  requireTradeParticipant,
} from "../middleware/authorization";
import {
  proposeTradeValidator,
  tradeIdValidator,
  respondToTradeValidator,
  cancelTradeValidator,
} from "../validators/trade.validator";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Propose a trade (any authenticated user with roster)
router.post("/propose", proposeTradeValidator, handleValidationErrors, proposeTradeController);

// Get a single trade (participants only)
router.get("/:id", tradeIdValidator, handleValidationErrors, requireTradeParticipant, getTradeController);

// Accept a trade (participants only)
router.post("/:id/accept", respondToTradeValidator, handleValidationErrors, requireTradeParticipant, acceptTradeController);

// Reject a trade (participants only)
router.post("/:id/reject", respondToTradeValidator, handleValidationErrors, requireTradeParticipant, rejectTradeController);

// Cancel a trade (participants only)
router.post("/:id/cancel", cancelTradeValidator, handleValidationErrors, requireTradeParticipant, cancelTradeController);

// Get all trades for a league (will be called from league routes)
// GET /api/leagues/:id/trades

// Get all trades for a roster (will be called from roster routes)
// GET /api/rosters/:id/trades

export default router;
