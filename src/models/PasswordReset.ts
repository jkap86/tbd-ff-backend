import pool from "../config/database";
import crypto from "crypto";

export interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

/**
 * Generate a secure random token
 */
function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a password reset token for a user
 * Token expires in 1 hour
 */
export async function createPasswordResetToken(
  userId: number
): Promise<string> {
  try {
    // Invalidate any existing unused tokens for this user
    await pool.query(
      `UPDATE password_reset_tokens
       SET used = TRUE
       WHERE user_id = $1 AND used = FALSE`,
      [userId]
    );

    // Generate new token
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    const query = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING token
    `;

    const result = await pool.query(query, [userId, token, expiresAt]);
    return result.rows[0].token;
  } catch (error) {
    console.error("Error creating password reset token:", error);
    throw new Error("Error creating password reset token");
  }
}

/**
 * Verify a password reset token
 * Returns user_id if token is valid, null otherwise
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<number | null> {
  try {
    const query = `
      SELECT user_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = $1
    `;

    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      return null; // Token not found
    }

    const tokenData = result.rows[0];

    // Check if token has been used
    if (tokenData.used) {
      return null;
    }

    // Check if token has expired
    if (new Date() > new Date(tokenData.expires_at)) {
      return null;
    }

    return tokenData.user_id;
  } catch (error) {
    console.error("Error verifying password reset token:", error);
    throw new Error("Error verifying password reset token");
  }
}

/**
 * Mark a password reset token as used
 */
export async function markTokenAsUsed(token: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE token = $1`,
      [token]
    );
  } catch (error) {
    console.error("Error marking token as used:", error);
    throw new Error("Error marking token as used");
  }
}

/**
 * Delete expired tokens (cleanup function)
 * Should be run periodically
 */
export async function deleteExpiredTokens(): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`
    );
    console.log("✅ Expired password reset tokens deleted");
  } catch (error) {
    console.error("Error deleting expired tokens:", error);
    throw new Error("Error deleting expired tokens");
  }
}
