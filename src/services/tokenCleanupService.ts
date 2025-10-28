import { deleteExpiredTokens } from "../models/PasswordReset";

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the password reset token cleanup scheduler
 * Runs every hour to delete expired tokens
 */
export function startTokenCleanupScheduler(): void {
  if (cleanupInterval) {
    console.log("⚠️  Token cleanup scheduler already running");
    return;
  }

  console.log("🧹 Starting password reset token cleanup scheduler (runs every hour)");

  // Run immediately on startup
  deleteExpiredTokens().catch((error) => {
    console.error("Error during initial token cleanup:", error);
  });

  // Run every hour (3600000 milliseconds)
  cleanupInterval = setInterval(
    () => {
      deleteExpiredTokens().catch((error) => {
        console.error("Error during scheduled token cleanup:", error);
      });
    },
    60 * 60 * 1000
  );
}

/**
 * Stop the token cleanup scheduler
 */
export function stopTokenCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("🧹 Token cleanup scheduler stopped");
  }
}
