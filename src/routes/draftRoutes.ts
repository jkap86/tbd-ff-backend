import { Router } from "express";
import {
  createDraftHandler,
  getDraftHandler,
  updateDraftSettingsHandler,
  startDraftHandler,
  pauseDraftHandler,
  resumeDraftHandler,
  resetDraftHandler,
  assignRostersHandler,
  getDraftHealthHandler,
} from "../controllers/draftController";
import {
  setDraftOrderHandler,
  getDraftOrderHandler,
} from "../controllers/draftOrderController";
import {
  makeDraftPickHandler,
  getDraftPicksHandler,
  getAvailablePlayersHandler,
} from "../controllers/draftPickController";
import {
  sendChatMessageHandler,
  getChatMessagesHandler,
} from "../controllers/chatController";
import {
  startDerby,
  getDerbyStatus,
  createDerby,
  selectDerbyPosition,
  skipDerbyTurn,
  randomizeDerby,
  pauseDerby,
  resumeDerby,
} from "../controllers/derbyController";
import { authenticate } from "../middleware/authMiddleware";
import { handleValidationErrors } from "../middleware/validationMiddleware";
import {
  createDraftValidator,
  draftIdValidator,
  updateDraftSettingsValidator,
  setDraftOrderValidator,
  makeDraftPickValidator,
  availablePlayersValidator,
} from "../validators/draft.validator";

const router = Router();

// POST /api/drafts/create - Create a new draft (protected)
router.post("/create", authenticate, createDraftValidator, handleValidationErrors, createDraftHandler);

// GET /api/drafts/:draftId - Get draft by ID (protected)
router.get("/:draftId", authenticate, draftIdValidator, handleValidationErrors, getDraftHandler);

// PUT /api/drafts/:draftId/settings - Update draft settings (protected)
router.put("/:draftId/settings", authenticate, updateDraftSettingsValidator, handleValidationErrors, updateDraftSettingsHandler);

// POST /api/drafts/:draftId/order - Set draft order (protected)
router.post("/:draftId/order", authenticate, setDraftOrderValidator, handleValidationErrors, setDraftOrderHandler);

// GET /api/drafts/:draftId/order - Get draft order (protected)
router.get("/:draftId/order", authenticate, draftIdValidator, handleValidationErrors, getDraftOrderHandler);

// POST /api/drafts/:draftId/start - Start draft (protected)
router.post("/:draftId/start", authenticate, draftIdValidator, handleValidationErrors, startDraftHandler);

// POST /api/drafts/:draftId/pause - Pause draft (protected)
router.post("/:draftId/pause", authenticate, draftIdValidator, handleValidationErrors, pauseDraftHandler);

// POST /api/drafts/:draftId/resume - Resume draft (protected)
router.post("/:draftId/resume", authenticate, draftIdValidator, handleValidationErrors, resumeDraftHandler);

// POST /api/drafts/:draftId/reset - Reset draft (protected)
router.post("/:draftId/reset", authenticate, draftIdValidator, handleValidationErrors, resetDraftHandler);

// POST /api/drafts/:draftId/assign-rosters - Manually assign drafted players to rosters (protected)
router.post("/:draftId/assign-rosters", authenticate, draftIdValidator, handleValidationErrors, assignRostersHandler);

// POST /api/drafts/:draftId/pick - Make a draft pick (protected)
router.post("/:draftId/pick", authenticate, makeDraftPickValidator, handleValidationErrors, makeDraftPickHandler);

// GET /api/drafts/:draftId/picks - Get all picks for a draft (protected)
router.get("/:draftId/picks", authenticate, draftIdValidator, handleValidationErrors, getDraftPicksHandler);

// GET /api/drafts/:draftId/players/available - Get available players (protected)
router.get("/:draftId/players/available", authenticate, availablePlayersValidator, handleValidationErrors, getAvailablePlayersHandler);

// POST /api/drafts/:draftId/chat - Send chat message (protected)
router.post("/:draftId/chat", authenticate, draftIdValidator, handleValidationErrors, sendChatMessageHandler);

// GET /api/drafts/:draftId/chat - Get chat messages (protected)
router.get("/:draftId/chat", authenticate, draftIdValidator, handleValidationErrors, getChatMessagesHandler);

// GET /api/drafts/:draftId/health - Get draft health status
router.get("/:draftId/health", getDraftHealthHandler);

// Derby routes
// IMPORTANT: Specific routes (create, start, select, skip, randomize) must come BEFORE generic GET
// Otherwise "/:draftId/derby/randomize" matches "/:draftId/derby" with randomize as a query param

// POST /api/drafts/:draftId/derby/create - Create derby for draft (protected)
router.post("/:draftId/derby/create", authenticate, draftIdValidator, handleValidationErrors, createDerby);

// POST /api/drafts/:draftId/derby/start - Start derby (protected)
router.post("/:draftId/derby/start", authenticate, draftIdValidator, handleValidationErrors, startDerby);

// POST /api/drafts/:draftId/derby/randomize - Randomize derby order (protected, commissioner only)
router.post("/:draftId/derby/randomize", authenticate, draftIdValidator, handleValidationErrors, randomizeDerby);

// POST /api/drafts/:draftId/derby/select - Select draft position (protected)
router.post("/:draftId/derby/select", authenticate, draftIdValidator, handleValidationErrors, selectDerbyPosition);

// POST /api/drafts/:draftId/derby/skip - Skip current turn (protected, commissioner only)
router.post("/:draftId/derby/skip", authenticate, draftIdValidator, handleValidationErrors, skipDerbyTurn);

// POST /api/drafts/:draftId/derby/pause - Pause derby timer (protected, commissioner only)
router.post("/:draftId/derby/pause", authenticate, draftIdValidator, handleValidationErrors, pauseDerby);

// POST /api/drafts/:draftId/derby/resume - Resume derby timer (protected, commissioner only)
router.post("/:draftId/derby/resume", authenticate, draftIdValidator, handleValidationErrors, resumeDerby);

// GET /api/drafts/:draftId/derby - Get derby status (protected)
// This MUST come after all specific /derby/* routes to avoid matching them
router.get("/:draftId/derby", authenticate, draftIdValidator, handleValidationErrors, getDerbyStatus);

export default router;
