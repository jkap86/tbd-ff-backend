import { Router } from "express";
import {
  createDraftHandler,
  getDraftHandler,
  updateDraftSettingsHandler,
  setDraftOrderHandler,
  getDraftOrderHandler,
  startDraftHandler,
  makeDraftPickHandler,
  getDraftPicksHandler,
  getAvailablePlayersHandler,
  pauseDraftHandler,
  resumeDraftHandler,
  resetDraftHandler,
  assignRostersHandler,
  getDraftHealthHandler,
} from "../controllers/draftController";
import {
  sendChatMessageHandler,
  getChatMessagesHandler,
} from "../controllers/chatController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// POST /api/drafts/create - Create a new draft (protected)
router.post("/create", authenticate, createDraftHandler);

// GET /api/drafts/:draftId - Get draft by ID (protected)
router.get("/:draftId", authenticate, getDraftHandler);

// PUT /api/drafts/:draftId/settings - Update draft settings (protected)
router.put("/:draftId/settings", authenticate, updateDraftSettingsHandler);

// POST /api/drafts/:draftId/order - Set draft order (protected)
router.post("/:draftId/order", authenticate, setDraftOrderHandler);

// GET /api/drafts/:draftId/order - Get draft order (protected)
router.get("/:draftId/order", authenticate, getDraftOrderHandler);

// POST /api/drafts/:draftId/start - Start draft (protected)
router.post("/:draftId/start", authenticate, startDraftHandler);

// POST /api/drafts/:draftId/pause - Pause draft (protected)
router.post("/:draftId/pause", authenticate, pauseDraftHandler);

// POST /api/drafts/:draftId/resume - Resume draft (protected)
router.post("/:draftId/resume", authenticate, resumeDraftHandler);

// POST /api/drafts/:draftId/reset - Reset draft (protected)
router.post("/:draftId/reset", authenticate, resetDraftHandler);

// POST /api/drafts/:draftId/assign-rosters - Manually assign drafted players to rosters (protected)
router.post("/:draftId/assign-rosters", authenticate, assignRostersHandler);

// POST /api/drafts/:draftId/pick - Make a draft pick (protected)
router.post("/:draftId/pick", authenticate, makeDraftPickHandler);

// GET /api/drafts/:draftId/picks - Get all picks for a draft (protected)
router.get("/:draftId/picks", authenticate, getDraftPicksHandler);

// GET /api/drafts/:draftId/players/available - Get available players (protected)
router.get("/:draftId/players/available", authenticate, getAvailablePlayersHandler);

// POST /api/drafts/:draftId/chat - Send chat message (protected)
router.post("/:draftId/chat", authenticate, sendChatMessageHandler);

// GET /api/drafts/:draftId/chat - Get chat messages (protected)
router.get("/:draftId/chat", authenticate, getChatMessagesHandler);

// GET /api/drafts/:draftId/health - Get draft health status
router.get("/:draftId/health", getDraftHealthHandler);

export default router;
