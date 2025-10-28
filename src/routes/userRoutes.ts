import { Router } from "express";
import { search } from "../controllers/userController";
import { searchLimiter } from "../middleware/rateLimiter";

const router = Router();

// GET /api/users/search?query=username - Search users
// Rate limit: 20 searches per minute (prevent abuse)
router.get("/search", searchLimiter, search);

export default router;
