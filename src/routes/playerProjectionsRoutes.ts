import { Router } from "express";
import {
  getPlayerProjections,
  getPlayerProjectionsById,
  getPlayerSeasonProjections,
  getBulkPlayerSeasonProjections,
  getBulkPlayerWeekRangeProjections,
} from "../controllers/playerStatsController";
import { bulkOperationLimiter, smartBulkProjectionsLimiter } from "../middleware/rateLimiter";

const router = Router();

/**
 * Get bulk projections for multiple players across a week range
 * POST /api/player-projections/bulk/:season/weeks
 * Body: { player_ids: string[], start_week: number, end_week: number, season_type?: string }
 * Note: This must come first to match before other bulk routes
 * Rate limit: 5 requests per 5 minutes (resource-intensive)
 */
router.post("/bulk/:season/weeks", bulkOperationLimiter, getBulkPlayerWeekRangeProjections);

/**
 * Get bulk season projections for multiple players
 * POST /api/player-projections/bulk/:season
 * Body: { player_ids: string[] }
 * Note: This must come first to match before /:season/:playerId
 * Rate limit: Smart cache-aware - allows cached requests instantly, rate limits fresh queries
 * - Cached responses: No rate limit (instant, zero cost)
 * - Fresh queries: 5 requests per 5 minutes (resource-intensive Sleeper API calls)
 */
router.post("/bulk/:season", smartBulkProjectionsLimiter, getBulkPlayerSeasonProjections);

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
