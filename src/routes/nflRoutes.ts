import { Router } from "express";
import { getCurrentWeek, getSchedule, getByeWeeks } from "../controllers/nflController";

const router = Router();

// Get current NFL week
router.get("/current-week", getCurrentWeek);

// Get NFL schedule for a specific week
router.get("/schedule", getSchedule);

// Get bye weeks for all teams
router.get("/bye-weeks", getByeWeeks);

export default router;
