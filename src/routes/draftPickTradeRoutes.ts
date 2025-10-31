import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireLeagueMember } from "../middleware/authorization";
import {
  proposeDraftPickTradeHandler,
  acceptDraftPickTradeHandler,
  declineDraftPickTradeHandler,
  getLeagueDraftPickTradesHandler,
  getTradeablePicksHandler
} from "../controllers/draftPickTradeController";

const router = express.Router();

// Draft pick trade routes
router.post("/leagues/:leagueId/draft-picks/trade", authenticate, requireLeagueMember, proposeDraftPickTradeHandler);
router.post("/draft-picks/trade/:tradeId/accept", authenticate, acceptDraftPickTradeHandler);
router.post("/draft-picks/trade/:tradeId/decline", authenticate, declineDraftPickTradeHandler);
router.get("/leagues/:leagueId/draft-picks/trades", authenticate, requireLeagueMember, getLeagueDraftPickTradesHandler);
router.get("/rosters/:rosterId/draft-picks/tradeable", authenticate, getTradeablePicksHandler);

export default router;
