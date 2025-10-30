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

const router = Router();

// Nomination routes
router.post("/drafts/:id/nominate", nominatePlayerHandler);
router.get("/drafts/:id/nominations", getActiveNominationsHandler);
router.get("/drafts/:id/nominations/:nominationId/bids", getNominationBidsHandler);

// Bidding routes
router.post("/drafts/:id/bid", placeBidHandler);

// Budget routes
router.get("/rosters/:id/budget", getRosterBudgetHandler);

// Available players
router.get("/drafts/:id/auction/available-players", getAvailablePlayersHandler);

// Activity/history
router.get("/drafts/:id/auction/activity", getAuctionActivityHandler);

// Rosters
router.get("/drafts/:id/auction/rosters", getAuctionRostersHandler);

// Complete auction
router.post("/drafts/:id/complete-auction", completeAuctionHandler);

// Clear nominations (for testing)
router.delete("/drafts/:id/nominations", clearNominationsHandler);

export default router;
