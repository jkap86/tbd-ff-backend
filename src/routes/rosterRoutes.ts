import { Router } from "express";
import { getRosterWithPlayersHandler, updateRosterLineupHandler } from "../controllers/rosterController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();


// Get roster with player details
router.get("/:rosterId/players", authenticate, getRosterWithPlayersHandler);

// Update roster lineup
router.put("/:rosterId/lineup", authenticate, updateRosterLineupHandler);

export default router;
