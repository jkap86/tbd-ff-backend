import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { handleValidationErrors } from "../middleware/validationMiddleware";
import {
  requireCommissioner,
  requireLeagueMember,
  requireRosterOwnership,
} from "../middleware/authorization";
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
import {
  submitWaiverClaimValidator,
  cancelWaiverClaimValidator,
  processWaiversValidator,
  updateWaiverSettingsValidator,
} from "../validators/waiver.validator";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Waiver claim routes
router.post("/leagues/:leagueId/waivers/claim", requireLeagueMember, submitWaiverClaimValidator, handleValidationErrors, submitClaimHandler);
router.get("/leagues/:leagueId/waivers/claims", requireLeagueMember, getLeagueClaimsHandler);
router.get("/rosters/:rosterId/waivers/claims", requireRosterOwnership, getRosterClaimsHandler);
router.delete("/waivers/claims/:claimId", cancelWaiverClaimValidator, handleValidationErrors, cancelClaimHandler); // Note: ownership check in controller

// Process waivers (commissioner only)
router.post("/leagues/:leagueId/waivers/process", requireCommissioner, processWaiversValidator, handleValidationErrors, processWaiversHandler);

// Free agent pickup
router.post("/leagues/:leagueId/transactions/free-agent", requireLeagueMember, submitWaiverClaimValidator, handleValidationErrors, pickupFreeAgentHandler);

// Transaction history
router.get("/leagues/:leagueId/transactions", requireLeagueMember, getLeagueTransactionsHandler);

// Available players
router.get("/leagues/:leagueId/players/available", requireLeagueMember, getAvailablePlayersHandler);

// Waiver settings (commissioner only for PUT)
router.get("/leagues/:leagueId/waivers/settings", requireLeagueMember, getWaiverSettingsHandler);
router.put("/leagues/:leagueId/waivers/settings", requireCommissioner, updateWaiverSettingsValidator, handleValidationErrors, updateWaiverSettingsHandler);

export default router;
