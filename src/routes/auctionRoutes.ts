import { Router } from "express";
import {
  nominatePlayerHandler,
  placeBidHandler,
  getActiveNominationsHandler,
  getNominationBidsHandler,
  getRosterBudgetHandler,
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

export default router;
