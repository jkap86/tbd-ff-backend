import { Router } from "express";
import {
  syncPlayersHandler,
  getPlayersHandler,
  getPlayersBulkHandler,
} from "../controllers/playerController";
import { bulkOperationLimiter, searchLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/players/sync - Sync players from Sleeper API (unprotected for initial setup)
// Rate limit: 5 requests per 5 minutes (resource-intensive operation)
router.post("/sync", bulkOperationLimiter, syncPlayersHandler);

// POST /api/players/bulk - Get multiple players by IDs
// Rate limit: 20 requests per minute
router.post("/bulk", searchLimiter, getPlayersBulkHandler);

// GET /api/players - Get all players with optional filtering
// Rate limit: 20 searches per minute
router.get("/", searchLimiter, getPlayersHandler);

export default router;
