import { Router } from "express";
import { getRosterWithPlayersHandler } from "../controllers/rosterController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// Get roster with player details
router.get("/:rosterId/players", authenticate, getRosterWithPlayersHandler);

export default router;
