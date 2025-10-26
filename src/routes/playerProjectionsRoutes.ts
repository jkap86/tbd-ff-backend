import { Router } from "express";
import {
  getPlayerProjections,
  getPlayerProjectionsById,
  getPlayerSeasonProjections,
} from "../controllers/playerStatsController";

const router = Router();

/**
 * Get full season projections for a specific player (no week)
 * GET /api/player-projections/:season/:playerId
 * Note: This must come before /:season/:week to match 2-param routes first
 */
router.get("/:season/:playerId", getPlayerSeasonProjections);

/**
 * Get all player projections for a specific week
 * GET /api/player-projections/:season/:week
 */
router.get("/:season/:week", getPlayerProjections);

/**
 * Get projections for a specific player for a specific week
 * GET /api/player-projections/:season/:week/:playerId
 */
router.get("/:season/:week/:playerId", getPlayerProjectionsById);

export default router;
