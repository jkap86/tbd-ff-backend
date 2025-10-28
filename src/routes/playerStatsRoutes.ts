import { Router } from "express";
import {
  getPlayerStats,
  getPlayerStatsById,
  getPlayerSeasonStats,
  getBulkPlayerSeasonStats,
} from "../controllers/playerStatsController";
import { bulkOperationLimiter } from "../middleware/rateLimiter";

const router = Router();

/**
 * Get bulk season stats for multiple players
 * POST /api/player-stats/bulk/:season
 * Body: { player_ids: string[] }
 * Note: This must come first to match before /:season/:playerId
 * Rate limit: 5 requests per 5 minutes (resource-intensive)
 */
router.post("/bulk/:season", bulkOperationLimiter, getBulkPlayerSeasonStats);

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
