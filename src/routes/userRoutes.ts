import { Router } from "express";
import { search } from "../controllers/userController";

const router = Router();

// GET /api/users/search?query=username - Search users
router.get("/search", search);

export default router;
