import { Router } from "express";
import {
  nominatePlayerHandler,
  placeBidHandler,
  getActiveNominationsHandler,
  getNominationBidsHandler,
  getRosterBudgetHandler,
  completeAuctionHandler,
  getAvailablePlayersHandler,
  getAuctionActivityHandler,
  getAuctionRostersHandler,
  clearNominationsHandler,
} from "../controllers/auctionController";
import { authenticate } from "../middleware/authMiddleware";
import { handleValidationErrors } from "../middleware/validationMiddleware";
import {
  nominatePlayerValidator,
  placeBidValidator,
  auctionIdValidator,
} from "../validators/auction.validator";

const router = Router();

// Nomination routes
router.post("/drafts/:id/nominate", authenticate, nominatePlayerValidator, handleValidationErrors, nominatePlayerHandler);
router.get("/drafts/:id/nominations", authenticate, auctionIdValidator, handleValidationErrors, getActiveNominationsHandler);
router.get("/drafts/:id/nominations/:nominationId/bids", authenticate, auctionIdValidator, handleValidationErrors, getNominationBidsHandler);

// Bidding routes
router.post("/drafts/:id/bid", authenticate, placeBidValidator, handleValidationErrors, placeBidHandler);

// Budget routes
router.get("/rosters/:id/budget", authenticate, auctionIdValidator, handleValidationErrors, getRosterBudgetHandler);

// Available players
router.get("/drafts/:id/auction/available-players", authenticate, auctionIdValidator, handleValidationErrors, getAvailablePlayersHandler);

// Activity/history
router.get("/drafts/:id/auction/activity", authenticate, auctionIdValidator, handleValidationErrors, getAuctionActivityHandler);

// Rosters
router.get("/drafts/:id/auction/rosters", authenticate, auctionIdValidator, handleValidationErrors, getAuctionRostersHandler);

// Complete auction
router.post("/drafts/:id/complete-auction", authenticate, auctionIdValidator, handleValidationErrors, completeAuctionHandler);

// Clear nominations (for testing)
router.delete("/drafts/:id/nominations", authenticate, auctionIdValidator, handleValidationErrors, clearNominationsHandler);

export default router;
