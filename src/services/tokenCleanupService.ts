import { deleteExpiredTokens } from "../models/PasswordReset";
import { withCronLogging } from "../utils/cronHelper";

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the password reset token cleanup scheduler
 * Runs every hour to delete expired tokens
 */
export function startTokenCleanupScheduler(): void {
  if (cleanupInterval) {
    console.log("Token cleanup scheduler already running");
    return;
  }

  console.log("Starting password reset token cleanup scheduler (runs every hour)");

  // Run immediately on startup with retry logic
  withCronLogging(
    async () => await deleteExpiredTokens(),
    'Token Cleanup (Startup)',
    { maxAttempts: 2, baseDelayMs: 1000 }
  ).catch((error) => {
    console.error("Error during initial token cleanup:", error);
  });

  // Run every hour (3600000 milliseconds) with retry logic
  cleanupInterval = setInterval(
    () => {
      withCronLogging(
        async () => await deleteExpiredTokens(),
        'Token Cleanup (Scheduled)',
        { maxAttempts: 2, baseDelayMs: 1000 }
      ).catch((error) => {
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
