import { Router } from "express";
import {
  getPlayerStats,
  getPlayerStatsById,
  getPlayerSeasonStats,
} from "../controllers/playerStatsController";

const router = Router();

/**
 * Get full season stats for a specific player (no week)
 * GET /api/player-stats/:season/:playerId
 * Note: This must come before /:season/:week to match 2-param routes first
 */
router.get("/:season/:playerId", getPlayerSeasonStats);

/**
 * Get all player stats for a specific week
 * GET /api/player-stats/:season/:week
 */
router.get("/:season/:week", getPlayerStats);

/**
 * Get stats for a specific player for a specific week
 * GET /api/player-stats/:season/:week/:playerId
 */
router.get("/:season/:week/:playerId", getPlayerStatsById);

export default router;
