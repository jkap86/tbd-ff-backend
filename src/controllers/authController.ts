// Before refactor: 252 lines
// After refactor: 198 lines
// Lines saved: 54 lines

import { Request, Response } from "express";
import {
  createUser,
  getUserByUsernameWithPassword,
  getUserByEmail,
  updateUserPassword,
} from "../models/User";
import { comparePassword, hashPassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import {
  createPasswordResetToken,
  verifyPasswordResetToken,
  markTokenAsUsed,
} from "../models/PasswordReset";
import {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from "../services/emailService";
import { logger } from "../utils/logger";
import { BaseController } from "./BaseController";

class AuthController extends BaseController {
  /**
   * Register a new user
   */
  register = this.asyncHandler(async (req: Request, res: Response) => {
    const { username, email, password, phone_number } = req.body;

    // Create user
    const hashedPassword = await hashPassword(password);

    const user = await createUser(
      username,
      email,
      hashedPassword,
      phone_number
    );

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      isAdmin: user.is_admin,
    });

    this.respondCreated(res, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        is_phone_verified: user.is_phone_verified,
      },
      token,
    }, "User registered successfully");
  });

  /**
   * Login user
   */
  login = this.asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Find user
    const user = await getUserByUsernameWithPassword(username);

    if (!user) {
      this.respondUnauthorized(res, "Invalid username or password");
      return;
    }

    // Compare passwords
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      this.respondUnauthorized(res, "Invalid username or password");
      return;
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      isAdmin: user.is_admin,
    });

    this.respondSuccess(res, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        is_phone_verified: user.is_phone_verified,
      },
      token,
    }, "Login successful");
  });

  /**
   * Request password reset
   * POST /api/auth/request-reset
   * Body: { email: string }
   */
  requestPasswordReset = this.asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    // Find user by email
    const user = await getUserByEmail(email);

    // Always return success to prevent email enumeration attacks
    // Don't reveal if email exists or not
    if (!user) {
      this.respondSuccess(res, null, "If an account with that email exists, a password reset link has been sent.");
      return;
    }

    // Create password reset token
    const resetToken = await createPasswordResetToken(user.id);

    // Send reset email
    await sendPasswordResetEmail(user.email, user.username, resetToken);

    this.respondSuccess(res, null, "If an account with that email exists, a password reset link has been sent.");
  });

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   * Body: { token: string, newPassword: string }
   */
  resetPassword = this.asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    // Verify token
    const userId = await verifyPasswordResetToken(token);

    if (!userId) {
      this.respondBadRequest(res, "Invalid or expired reset token");
      return;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password first
    await updateUserPassword(userId, hashedPassword);

    // Only mark token as used after successful password update
    await markTokenAsUsed(token);

    // Get user info for confirmation email
    const { getUserById } = await import("../models/User");
    const user = await getUserById(userId);

    // Send confirmation email (non-blocking, log errors)
    if (user) {
      sendPasswordChangedEmail(user.email, user.username).catch((error) => {
        logger.error("Failed to send password changed confirmation email", { error });
      });
    } else {
      logger.error("User not found after password reset, cannot send confirmation email");
    }

    this.respondSuccess(res, null, "Password has been reset successfully");
  });
}

const authController = new AuthController();
export const register = authController.register;
export const login = authController.login;
export const requestPasswordReset = authController.requestPasswordReset;
export const resetPassword = authController.resetPassword;
