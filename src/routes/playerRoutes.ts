import { Router } from "express";
import {
  syncPlayersHandler,
  getPlayersHandler,
} from "../controllers/playerController";

const router = Router();

// POST /api/players/sync - Sync players from Sleeper API (unprotected for initial setup)
router.post("/sync", syncPlayersHandler);

// GET /api/players - Get all players with optional filtering
router.get("/", getPlayersHandler);

export default router;
