import { Router } from "express";
import { getCurrentWeek } from "../controllers/nflController";

const router = Router();

// Get current NFL week
router.get("/current-week", getCurrentWeek);

export default router;
