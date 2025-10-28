import { Router } from "express";
import {
  createLeagueHandler,
  getUserLeaguesHandler,
  getLeagueDetailsHandler,
  joinLeagueHandler,
  getPublicLeaguesHandler,
  updateLeagueSettingsHandler,
} from "../controllers/leagueController";
import { authenticate } from "../middleware/authMiddleware";
import { publicDataLimiter } from "../middleware/rateLimiter";
import { transferCommissionerHandler } from "../controllers/leagueController";
import { isCommissionerHandler } from "../controllers/leagueController";
import { removeLeagueMemberHandler } from "../controllers/leagueController";
import { getLeagueStatsHandler } from "../controllers/leagueController";
import { resetLeagueHandler } from "../controllers/leagueController";
import { deleteLeagueHandler } from "../controllers/leagueController";
import { getDraftByLeagueHandler } from "../controllers/draftController";
import {
  sendLeagueChatMessageHandler,
  getLeagueChatMessagesHandler,
} from "../controllers/leagueChatController";

const router = Router();

// POST /api/leagues/create - Create a new league (protected)
router.post("/create", authenticate, createLeagueHandler);

// GET /api/leagues/public - Get public leagues
// Rate limit: 30 requests per minute (prevent scraping)
router.get("/public", publicDataLimiter, getPublicLeaguesHandler);

// GET /api/leagues/user/:userId - Get all leagues for a user
router.get("/user/:userId", getUserLeaguesHandler);

// GET /api/leagues/:leagueId - Get specific league details with rosters
router.get("/:leagueId", getLeagueDetailsHandler);

// PUT /api/leagues/:leagueId - Update league settings (protected, commissioner only)
router.put("/:leagueId", authenticate, updateLeagueSettingsHandler);

// POST /api/leagues/:leagueId/join - Join a league (protected)
router.post("/:leagueId/join", authenticate, joinLeagueHandler);

/**
 * Transfer commissioner role
 * POST /api/leagues/:leagueId/transfer-commissioner
 */
router.post(
  "/:leagueId/transfer-commissioner",
  authenticate,
  transferCommissionerHandler
);

/**
 * Check if user is commissioner of a league
 * GET /api/leagues/:leagueId/is-commissioner
 */
router.get("/:leagueId/is-commissioner", authenticate, isCommissionerHandler);

/**
 * Remove a member from a league
 * POST /api/leagues/:leagueId/remove-member
 */
router.post(
  "/:leagueId/remove-member",
  authenticate,
  removeLeagueMemberHandler
);

/**
 * Get league statistics
 * GET /api/leagues/:leagueId/stats
 */
router.get("/:leagueId/stats", authenticate, getLeagueStatsHandler);

/**
 * Get draft for a league
 * GET /api/leagues/:leagueId/draft
 */
router.get("/:leagueId/draft", getDraftByLeagueHandler);

/**
 * Send a league chat message
 * POST /api/leagues/:leagueId/chat
 */
router.post("/:leagueId/chat", authenticate, sendLeagueChatMessageHandler);

/**
 * Get league chat messages
 * GET /api/leagues/:leagueId/chat
 */
router.get("/:leagueId/chat", getLeagueChatMessagesHandler);

/**
 * Reset league to pre-draft status
 * POST /api/leagues/:leagueId/reset
 */
router.post("/:leagueId/reset", authenticate, resetLeagueHandler);

/**
 * Delete a league (commissioner only)
 * DELETE /api/leagues/:leagueId
 */
router.delete("/:leagueId", authenticate, deleteLeagueHandler);

export default router;
