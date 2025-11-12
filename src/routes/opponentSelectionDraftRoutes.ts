import { Router } from "express";
import {
  createOpponentSelectionDraftHandler,
  getOpponentSelectionDraftByLeagueHandler,
  startOpponentSelectionDraftHandler,
  makeOpponentSelectionPickHandler,
  deleteOpponentSelectionDraftHandler,
} from "../controllers/opponentSelectionDraftController";
import { authenticate } from "../middleware/authMiddleware";
import {
  requireCommissioner,
  requireLeagueMember,
} from "../middleware/authorization";

const router = Router();

/**
 * Create opponent selection draft
 * POST /api/opponent-selection-drafts/league/:leagueId/create
 */
router.post(
  "/league/:leagueId/create",
  authenticate,
  requireCommissioner,
  createOpponentSelectionDraftHandler
);

/**
 * Get opponent selection draft by league
 * GET /api/opponent-selection-drafts/league/:leagueId
 */
router.get(
  "/league/:leagueId",
  authenticate,
  requireLeagueMember,
  getOpponentSelectionDraftByLeagueHandler
);

/**
 * Start opponent selection draft
 * POST /api/opponent-selection-drafts/:draftId/start
 */
router.post(
  "/:draftId/start",
  authenticate,
  requireCommissioner,
  startOpponentSelectionDraftHandler
);

/**
 * Make opponent selection pick
 * POST /api/opponent-selection-drafts/:draftId/pick
 */
router.post(
  "/:draftId/pick",
  authenticate,
  requireLeagueMember,
  makeOpponentSelectionPickHandler
);

/**
 * Delete opponent selection draft
 * DELETE /api/opponent-selection-drafts/:draftId
 */
router.delete(
  "/:draftId",
  authenticate,
  requireCommissioner,
  deleteOpponentSelectionDraftHandler
);

export default router;
