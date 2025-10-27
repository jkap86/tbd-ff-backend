import { Router } from "express";
import {
  register,
  login,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authController";

const router = Router();

// POST /api/auth/register - Register a new user
router.post("/register", register);

// POST /api/auth/login - Login user
router.post("/login", login);

// POST /api/auth/request-reset - Request password reset
router.post("/request-reset", requestPasswordReset);

// POST /api/auth/reset-password - Reset password with token
router.post("/reset-password", resetPassword);

export default router;
