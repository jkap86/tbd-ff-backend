/**
 * Cron Helper Utility
 * Provides retry logic and error recovery for cron jobs
 */
import { logger } from "./logger";

/**
 * Sleep utility for delays between retry attempts
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  exponentialBackoff?: boolean;
  jobName?: string;
}

/**
 * Retry async function with exponential backoff
 *
 * @param fn - Async function to execute with retry logic
 * @param options - Retry configuration options
 * @returns Promise that resolves when function succeeds or rejects after max attempts
 *
 * @example
 * await retryAsync(
 *   async () => await syncInjuriesFromSleeper(),
 *   { jobName: 'Injury Sync', maxAttempts: 3 }
 * );
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    exponentialBackoff = true,
    jobName = 'Cron Job'
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`[Cron] ${jobName} - Starting attempt`, { attempt, maxAttempts });
      const result = await fn();
      logger.info(`[Cron] ${jobName} - Completed successfully`, { attempt, maxAttempts });
      return result;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`[Cron] ${jobName} - Failed on attempt`, { attempt, maxAttempts, errorMessage });

      if (isLastAttempt) {
        logger.error(`[Cron] ${jobName} - All retry attempts exhausted. Job failed permanently.`);
        // TODO: Send alert to monitoring system (e.g., Sentry, PagerDuty, CloudWatch)
        // TODO: Example: await sendAlert({ jobName, error, attempts: maxAttempts });
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = exponentialBackoff
        ? Math.pow(2, attempt - 1) * baseDelayMs // 1s, 2s, 4s, 8s...
        : baseDelayMs;

      logger.info(`[Cron] ${jobName} - Retrying`, { delay, nextAttempt: attempt + 1, maxAttempts });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrapper for cron jobs that adds structured logging
 *
 * @param fn - Async function to execute
 * @param jobName - Name of the cron job for logging
 * @param retryOptions - Optional retry configuration
 *
 * @example
 * cron.schedule('0 12 * * *', async () => {
 *   await withCronLogging(
 *     async () => await syncInjuriesFromSleeper(),
 *     'Daily Injury Sync',
 *     { maxAttempts: 3 }
 *   );
 * });
 */
export async function withCronLogging<T>(
  fn: () => Promise<T>,
  jobName: string,
  retryOptions?: RetryOptions
): Promise<T> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  logger.info(`[Cron] ======================================`);
  logger.info(`[Cron] ${jobName} - Started`, { timestamp });
  logger.info(`[Cron] ======================================`);

  try {
    const result = retryOptions
      ? await retryAsync(fn, { ...retryOptions, jobName })
      : await fn();

    const duration = Date.now() - startTime;
    logger.info(`[Cron] ======================================`);
    logger.info(`[Cron] ${jobName} - Completed successfully`, { duration });
    logger.info(`[Cron] ======================================`);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`[Cron] ======================================`);
    logger.error(`[Cron] ${jobName} - FAILED`, { duration });
    logger.error(`[Cron] ${jobName} - Error`, { errorMessage });
    logger.error(`[Cron] ======================================`);

    // TODO: Send critical alert to monitoring system
    // TODO: Example: await sendCriticalAlert({ jobName, error, duration });

    throw error;
  }
}
