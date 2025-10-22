import { Router } from "express";
import { register, login } from "../controllers/authController";

const router = Router();

// POST /api/auth/register - Register a new user
router.post("/register", register);

// POST /api/auth/login - Login user
router.post("/login", login);

export default router;
