import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getWeeklyLineupHandler,
  updateWeeklyLineupHandler,
} from "../controllers/weeklyLineupController";

const router = Router();

// Get weekly lineup for a roster and week
router.get(
  "/roster/:rosterId/week/:week/season/:season",
  authenticate,
  getWeeklyLineupHandler
);

// Update weekly lineup
router.put(
  "/roster/:rosterId/week/:week/season/:season",
  authenticate,
  updateWeeklyLineupHandler
);

export default router;
