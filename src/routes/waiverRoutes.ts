import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  submitClaimHandler,
  getLeagueClaimsHandler,
  getRosterClaimsHandler,
  cancelClaimHandler,
  processWaiversHandler,
  pickupFreeAgentHandler,
  getLeagueTransactionsHandler,
  getAvailablePlayersHandler,
  getWaiverSettingsHandler,
  updateWaiverSettingsHandler,
} from "../controllers/waiverController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Waiver claim routes
router.post("/leagues/:leagueId/waivers/claim", submitClaimHandler);
router.get("/leagues/:leagueId/waivers/claims", getLeagueClaimsHandler);
router.get("/rosters/:rosterId/waivers/claims", getRosterClaimsHandler);
router.delete("/waivers/claims/:claimId", cancelClaimHandler);

// Process waivers (commissioner only)
router.post("/leagues/:leagueId/waivers/process", processWaiversHandler);

// Free agent pickup
router.post("/leagues/:leagueId/transactions/free-agent", pickupFreeAgentHandler);

// Transaction history
router.get("/leagues/:leagueId/transactions", getLeagueTransactionsHandler);

// Available players
router.get("/leagues/:leagueId/players/available", getAvailablePlayersHandler);

// Waiver settings (commissioner only for PUT)
router.get("/leagues/:leagueId/waivers/settings", getWaiverSettingsHandler);
router.put("/leagues/:leagueId/waivers/settings", updateWaiverSettingsHandler);

export default router;
