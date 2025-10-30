import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

/**
 * Email service for sending password reset emails
 * Configure with your email provider credentials
 */

// Create reusable transporter
const createTransporter = () => {
  // For development, use ethereal email (fake SMTP)
  // For production, use your actual email service (Gmail, SendGrid, etc.)

  if (process.env.NODE_ENV === "production") {
    // Production email configuration
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development: Use ethereal email or console logging
    console.log("⚠️  Email service in development mode - emails will be logged to console");
    return null;
  }
};

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetToken: string
): Promise<void> {
  try {
    const transporter = createTransporter();

    // Build reset link
    // For mobile apps, use custom scheme (tbdff://)
    // For web/desktop, use the frontend URL
    const useMobileDeepLink = process.env.USE_MOBILE_DEEP_LINK === "true";

    const resetLink = useMobileDeepLink
      ? `tbdff://reset-password?token=${resetToken}`
      : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || '"TBD Fantasy Football" <noreply@tbdff.com>',
      to: email,
      subject: "Password Reset Request - TBD Fantasy Football",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin: 20px 0;
            }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .token {
              background-color: #e8e8e8;
              padding: 10px;
              border-radius: 4px;
              font-family: monospace;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello ${username},</p>
              <p>We received a request to reset your password for your TBD Fantasy Football account.</p>
              <p><strong>Your password reset token is:</strong></p>
              <div class="token" style="font-size: 18px; padding: 15px; background-color: #f0f0f0; border: 2px solid #333; margin: 20px 0; word-break: break-all; font-family: monospace; letter-spacing: 1px;">${resetToken}</div>
              <p><strong>To reset your password:</strong></p>
              <ol style="text-align: left; display: inline-block;">
                <li>Open the TBD Fantasy Football app on your phone</li>
                <li>Go to "Forgot Password?" from the login screen</li>
                <li>After submitting your email, you'll see a success screen</li>
                <li>Copy the token above and paste it when prompted</li>
              </ol>
              <p style="margin-top: 20px;"><strong>This token will expire in 1 hour.</strong></p>
              <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>

              ${useMobileDeepLink ? `
              <p style="margin-top: 30px; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196F3;">
                <strong>💡 Tip:</strong> If you're on your phone, you can tap this link to open the app directly:<br>
                <a href="${resetLink}" style="color: #1976D2; word-break: break-all;">${resetLink}</a><br>
                <small>(This may not work in all email clients)</small>
              </p>
              ` : `
              <p>Or copy and paste this link into your browser:</p>
              <div class="token">${resetLink}</div>
              `}
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} TBD Fantasy Football. All rights reserved.</p>
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${username},

We received a request to reset your password for your TBD Fantasy Football account.

Click this link to reset your password:
${resetLink}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} TBD Fantasy Football. All rights reserved.
      `.trim(),
    };

    if (transporter) {
      // Send actual email in production
      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Password reset email sent:", info.messageId);
    } else {
      // Development mode: Log to console (without sensitive token)
      logger.info("Password reset email sent (dev mode)", {
        to: email.substring(0, 3) + "***",
        subject: mailOptions.subject,
        // Do not log the actual reset token or link
      });
    }
  } catch (error) {
    console.error("❌ Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

/**
 * Send password changed confirmation email
 */
export async function sendPasswordChangedEmail(
  email: string,
  username: string
): Promise<void> {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || '"TBD Fantasy Football" <noreply@tbdff.com>',
      to: email,
      subject: "Password Changed Successfully - TBD Fantasy Football",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Changed</h1>
            </div>
            <div class="content">
              <p>Hello ${username},</p>
              <p>Your password has been successfully changed.</p>
              <p>If you did not make this change, please contact support immediately.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} TBD Fantasy Football. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${username},

Your password has been successfully changed.

If you did not make this change, please contact support immediately.

© ${new Date().getFullYear()} TBD Fantasy Football. All rights reserved.
      `.trim(),
    };

    if (transporter) {
      await transporter.sendMail(mailOptions);
      console.log("✅ Password changed confirmation email sent");
    } else {
      console.log("📧 Password Changed Email (Development Mode):", email);
    }
  } catch (error) {
    console.error("❌ Error sending password changed email:", error);
    // Don't throw - this is just a confirmation email
  }
}
