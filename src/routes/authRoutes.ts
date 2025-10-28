import { Router } from "express";
import {
  register,
  login,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authController";
import { authLimiter, passwordResetLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/auth/register - Register a new user
// Rate limit: 5 attempts per 15 minutes
router.post("/register", authLimiter, register);

// POST /api/auth/login - Login user
// Rate limit: 5 attempts per 15 minutes
router.post("/login", authLimiter, login);

// POST /api/auth/request-reset - Request password reset
// Rate limit: 3 attempts per hour (stricter to prevent email spam)
router.post("/request-reset", passwordResetLimiter, requestPasswordReset);

// POST /api/auth/reset-password - Reset password with token
// Rate limit: 3 attempts per hour
router.post("/reset-password", passwordResetLimiter, resetPassword);

export default router;
