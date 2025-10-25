import { Router } from "express";
import {
  createDraftHandler,
  getDraftHandler,
  setDraftOrderHandler,
  getDraftOrderHandler,
  startDraftHandler,
  makeDraftPickHandler,
  getDraftPicksHandler,
  getAvailablePlayersHandler,
  pauseDraftHandler,
  resumeDraftHandler,
} from "../controllers/draftController";
import {
  sendChatMessageHandler,
  getChatMessagesHandler,
} from "../controllers/chatController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// POST /api/drafts/create - Create a new draft (protected)
router.post("/create", authenticate, createDraftHandler);

// GET /api/drafts/:draftId - Get draft by ID
router.get("/:draftId", getDraftHandler);

// POST /api/drafts/:draftId/order - Set draft order (protected)
router.post("/:draftId/order", authenticate, setDraftOrderHandler);

// GET /api/drafts/:draftId/order - Get draft order
router.get("/:draftId/order", getDraftOrderHandler);

// POST /api/drafts/:draftId/start - Start draft (protected)
router.post("/:draftId/start", authenticate, startDraftHandler);

// POST /api/drafts/:draftId/pause - Pause draft (protected)
router.post("/:draftId/pause", authenticate, pauseDraftHandler);

// POST /api/drafts/:draftId/resume - Resume draft (protected)
router.post("/:draftId/resume", authenticate, resumeDraftHandler);

// POST /api/drafts/:draftId/pick - Make a draft pick (protected)
router.post("/:draftId/pick", authenticate, makeDraftPickHandler);

// GET /api/drafts/:draftId/picks - Get all picks for a draft
router.get("/:draftId/picks", getDraftPicksHandler);

// GET /api/drafts/:draftId/players/available - Get available players
router.get("/:draftId/players/available", getAvailablePlayersHandler);

// POST /api/drafts/:draftId/chat - Send chat message (protected)
router.post("/:draftId/chat", authenticate, sendChatMessageHandler);

// GET /api/drafts/:draftId/chat - Get chat messages
router.get("/:draftId/chat", getChatMessagesHandler);

export default router;
