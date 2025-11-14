import { Router } from "express";
import {
  createLeagueHandler,
  getUserLeaguesHandler,
  getLeagueDetailsHandler,
  joinLeagueHandler,
  getPublicLeaguesHandler,
  updateLeagueSettingsHandler,
  getPublicLeagueInfoHandler,
} from "../controllers/leagueController";
import { authenticate } from "../middleware/authMiddleware";
import {
  requireCommissioner,
  requireLeagueMember,
} from "../middleware/authorization";
import { publicDataLimiter } from "../middleware/rateLimiter";
import { transferCommissionerHandler } from "../controllers/leagueController";
import { isCommissionerHandler } from "../controllers/leagueController";
import { removeLeagueMemberHandler } from "../controllers/leagueController";
import { getLeagueStatsHandler } from "../controllers/leagueController";
import { resetLeagueHandler } from "../controllers/leagueController";
import { deleteLeagueHandler } from "../controllers/leagueController";
import { generateInviteLinkHandler } from "../controllers/leagueController";
import { getOpponentSelectionOrderHandler } from "../controllers/leagueController";
import { randomizeOpponentSelectionOrderHandler } from "../controllers/leagueController";
import { getDraftByLeagueHandler } from "../controllers/draftController";
import {
  sendLeagueChatMessageHandler,
  getLeagueChatMessagesHandler,
  markLeagueChatAsReadHandler,
  getUnreadMessageCountHandler,
} from "../controllers/leagueChatController";
import { getLeagueTradesController } from "../controllers/tradeController";
import {
  createLeagueValidator,
  updateLeagueValidator,
  joinLeagueValidator,
  leagueIdValidator,
} from "../validators/league.validator";
import { handleValidationErrors } from "../middleware/validationMiddleware";

const router = Router();

// POST /api/leagues/create - Create a new league (protected)
router.post("/create", authenticate, createLeagueValidator, handleValidationErrors, createLeagueHandler);

// GET /api/leagues/public - Get public leagues
// Rate limit: 30 requests per minute (prevent scraping)
router.get("/public", publicDataLimiter, getPublicLeaguesHandler);

// GET /api/leagues/user/:userId - Get all leagues for a user
router.get("/user/:userId", getUserLeaguesHandler);

/**
 * Generate shareable league invitation link
 * POST /api/leagues/:leagueId/generate-invite-link
 * MUST be before /:leagueId route to avoid matching
 */
router.post("/:leagueId/generate-invite-link", authenticate, requireCommissioner, generateInviteLinkHandler);

/**
 * Get public league info for invite page
 * GET /api/leagues/:leagueId/public-info
 * No authentication required - returns only basic league info
 * MUST be before /:leagueId route to avoid matching
 */
router.get("/:leagueId/public-info", getPublicLeagueInfoHandler);

// GET /api/leagues/:leagueId - Get specific league details with rosters
router.get("/:leagueId", authenticate, requireLeagueMember, leagueIdValidator, handleValidationErrors, getLeagueDetailsHandler);

// PUT /api/leagues/:leagueId - Update league settings (protected, commissioner only)
router.put("/:leagueId", authenticate, requireCommissioner, updateLeagueValidator, handleValidationErrors, updateLeagueSettingsHandler);

// POST /api/leagues/:leagueId/join - Join a league (protected)
router.post("/:leagueId/join", authenticate, joinLeagueValidator, handleValidationErrors, joinLeagueHandler);

/**
 * Transfer commissioner role
 * POST /api/leagues/:leagueId/transfer-commissioner
 */
router.post(
  "/:leagueId/transfer-commissioner",
  authenticate,
  requireCommissioner,
  transferCommissionerHandler
);

/**
 * Check if user is commissioner of a league
 * GET /api/leagues/:leagueId/is-commissioner
 */
router.get("/:leagueId/is-commissioner", authenticate, requireLeagueMember, isCommissionerHandler);

/**
 * Remove a member from a league
 * POST /api/leagues/:leagueId/remove-member
 */
router.post(
  "/:leagueId/remove-member",
  authenticate,
  requireCommissioner,
  removeLeagueMemberHandler
);

/**
 * Get league statistics
 * GET /api/leagues/:leagueId/stats
 */
router.get("/:leagueId/stats", authenticate, requireLeagueMember, getLeagueStatsHandler);

/**
 * Get draft for a league
 * GET /api/leagues/:leagueId/draft
 */
router.get("/:leagueId/draft", authenticate, requireLeagueMember, getDraftByLeagueHandler);

/**
 * Send a league chat message
 * POST /api/leagues/:leagueId/chat
 */
router.post("/:leagueId/chat", authenticate, requireLeagueMember, sendLeagueChatMessageHandler);

/**
 * Get league chat messages
 * GET /api/leagues/:leagueId/chat
 */
router.get("/:leagueId/chat", authenticate, requireLeagueMember, getLeagueChatMessagesHandler);

/**
 * Mark league chat as read
 * POST /api/leagues/:leagueId/chat/mark-read
 */
router.post("/:leagueId/chat/mark-read", authenticate, requireLeagueMember, markLeagueChatAsReadHandler);

/**
 * Get unread message count
 * GET /api/leagues/:leagueId/chat/unread-count
 */
router.get("/:leagueId/chat/unread-count", authenticate, requireLeagueMember, getUnreadMessageCountHandler);

/**
 * Reset league to pre-draft status
 * POST /api/leagues/:leagueId/reset
 */
router.post("/:leagueId/reset", authenticate, requireCommissioner, resetLeagueHandler);

/**
 * Get opponent selection order
 * GET /api/leagues/:leagueId/opponent-selection-order
 */
router.get(
  "/:leagueId/opponent-selection-order",
  authenticate,
  requireLeagueMember,
  getOpponentSelectionOrderHandler
);

/**
 * Randomize opponent selection order
 * POST /api/leagues/:leagueId/randomize-opponent-selection-order
 */
router.post(
  "/:leagueId/randomize-opponent-selection-order",
  authenticate,
  requireCommissioner,
  randomizeOpponentSelectionOrderHandler
);

/**
 * Delete a league (commissioner only)
 * DELETE /api/leagues/:leagueId
 */
router.delete("/:leagueId", authenticate, requireCommissioner, deleteLeagueHandler);


// GET /api/leagues/:id/trades - Get all trades for a league
router.get("/:id/trades", authenticate, requireLeagueMember, getLeagueTradesController);

export default router;
