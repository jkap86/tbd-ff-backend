import Redis from "ioredis";
import { logger } from "./logger";

/**
 * Redis client configuration for caching frequently accessed data
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Graceful degradation (app continues if Redis unavailable)
 * - Environment-based configuration
 * - Connection pooling via ioredis
 */

// Check if Redis is enabled via environment variable (defaults to true in production)
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || "0", 10);

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Create and configure Redis client with error handling
 */
function createRedisClient(): Redis | null {
  if (!REDIS_ENABLED) {
    logger.info("[Redis] Redis caching is disabled via REDIS_ENABLED=false");
    return null;
  }

  try {
    const client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      db: REDIS_DB,
      retryStrategy(times) {
        // Exponential backoff: 50ms, 100ms, 200ms, ..., max 3000ms
        const delay = Math.min(times * 50, 3000);
        logger.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false, // Connect immediately
    });

    // Connection events
    client.on("connect", () => {
      logger.info("[Redis] Connecting to Redis server...", {
        host: REDIS_HOST,
        port: REDIS_PORT,
        db: REDIS_DB,
      });
    });

    client.on("ready", () => {
      isConnected = true;
      logger.info("[Redis] Connected and ready");
    });

    client.on("error", (error: any) => {
      logger.error("[Redis] Connection error", {
        error: error.message,
        code: error.code || 'UNKNOWN',
      });
      // Don't crash the app - graceful degradation
    });

    client.on("close", () => {
      isConnected = false;
      logger.warn("[Redis] Connection closed");
    });

    client.on("reconnecting", () => {
      logger.info("[Redis] Attempting to reconnect...");
    });

    return client;
  } catch (error: any) {
    logger.error("[Redis] Failed to create Redis client", {
      error: error.message,
    });
    return null;
  }
}

// Initialize Redis client
redisClient = createRedisClient();

/**
 * Check if Redis is available and connected
 */
export function isRedisAvailable(): boolean {
  return redisClient !== null && isConnected;
}

/**
 * Get Redis client instance (may be null if disabled/unavailable)
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    logger.info("[Redis] Closing connection...");
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  if (!redisClient) {
    return { connected: false, error: "Redis client not initialized" };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;
    return { connected: true, latency };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}

export default redisClient;
