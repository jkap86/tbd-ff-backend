import { Router } from "express";
import {
  createLeagueHandler,
  getUserLeaguesHandler,
  getLeagueDetailsHandler,
  joinLeagueHandler,
  getPublicLeaguesHandler,
} from "../controllers/leagueController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// POST /api/leagues/create - Create a new league (protected)
router.post("/create", authenticate, createLeagueHandler);

// GET /api/leagues/public - Get public leagues
router.get("/public", getPublicLeaguesHandler);

// GET /api/leagues/user/:userId - Get all leagues for a user
router.get("/user/:userId", getUserLeaguesHandler);

// GET /api/leagues/:leagueId - Get specific league details with rosters
router.get("/:leagueId", getLeagueDetailsHandler);

// POST /api/leagues/:leagueId/join - Join a league (protected)
router.post("/:leagueId/join", authenticate, joinLeagueHandler);

export default router;
