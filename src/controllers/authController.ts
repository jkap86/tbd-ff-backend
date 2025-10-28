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

/**
 * Register a new user
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password, phone_number } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      res.status(400).json({
        success: false,
        message: "Username, email, and password are required",
      });
      return;
    }

    // Validate password length
    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
      return;
    }

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
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone_number: user.phone_number,
          is_phone_verified: user.is_phone_verified,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error("Registration error:", error);

    if (
      error.message === "Username already exists" ||
      error.message === "Email already exists"
    ) {
      res.status(409).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error registering user",
    });
  }
}

/**
 * Login user
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
      return;
    }

    // Find user
    const user = await getUserByUsernameWithPassword(username);

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
      return;
    }

    // Compare passwords
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
      return;
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone_number: user.phone_number,
          is_phone_verified: user.is_phone_verified,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Error logging in",
    });
  }
}

/**
 * Request password reset
 * POST /api/auth/request-reset
 * Body: { email: string }
 */
export async function requestPasswordReset(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email is required",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    // Find user by email
    const user = await getUserByEmail(email);

    // Always return success to prevent email enumeration attacks
    // Don't reveal if email exists or not
    if (!user) {
      res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      });
      return;
    }

    // Create password reset token
    const resetToken = await createPasswordResetToken(user.id);

    // Send reset email
    await sendPasswordResetEmail(user.email, user.username, resetToken);

    res.status(200).json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error: any) {
    console.error("Request password reset error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing password reset request",
    });
  }
}

/**
 * Reset password with token
 * POST /api/auth/reset-password
 * Body: { token: string, newPassword: string }
 */
export async function resetPassword(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { token, newPassword } = req.body;

    // Validate inputs
    if (!token || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
      return;
    }

    // Verify token
    const userId = await verifyPasswordResetToken(token);

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
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
        console.error("Failed to send password changed confirmation email:", error);
      });
    } else {
      console.error("User not found after password reset, cannot send confirmation email");
    }

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
    });
  }
}
