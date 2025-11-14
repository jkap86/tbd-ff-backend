import { Request, Response, NextFunction } from "express";
import { getCache, setCache, isRedisAvailable } from "../utils/cache";
import { logger } from "../config/logger";

/**
 * Middleware for HTTP response caching
 *
 * Usage:
 *   router.get('/endpoint', cacheMiddleware(60), handler);
 *
 * Features:
 * - Automatic cache key generation from URL and query params
 * - Graceful degradation if Redis unavailable
 * - Supports custom key builders
 * - Respects HTTP headers
 */

export interface CacheMiddlewareOptions {
  /**
   * Time to live in seconds
   */
  ttl: number;

  /**
   * Custom cache key builder
   * Default: Uses method + URL + query params
   */
  keyBuilder?: (req: Request) => string;

  /**
   * Whether to cache only for authenticated users
   * Default: false
   */
  requireAuth?: boolean;

  /**
   * Additional prefix for cache key
   */
  prefix?: string;
}

/**
 * Build default cache key from request
 */
function buildCacheKey(req: Request, prefix?: string): string {
  const { method, path, query } = req;

  // Include user ID if authenticated (for user-specific caching)
  const userId = req.user?.userId;

  // Sort query params for consistent keys
  const sortedQuery = Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join("&");

  const parts = [prefix, method, path];

  if (userId) {
    parts.push(`user:${userId}`);
  }

  if (sortedQuery) {
    parts.push(sortedQuery);
  }

  return parts.filter(Boolean).join(":");
}

/**
 * Cache middleware factory
 * @param options - Cache configuration
 * @returns Express middleware
 */
export function cacheMiddleware(
  options: number | CacheMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => void {
  // Normalize options
  const config: CacheMiddlewareOptions =
    typeof options === "number" ? { ttl: options } : options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip if Redis unavailable (graceful degradation)
    if (!isRedisAvailable()) {
      next();
      return;
    }

    // Skip for non-GET requests
    if (req.method !== "GET") {
      next();
      return;
    }

    // Check auth requirement
    if (config.requireAuth && !req.user) {
      next();
      return;
    }

    // Build cache key
    const cacheKey = config.keyBuilder
      ? config.keyBuilder(req)
      : buildCacheKey(req, config.prefix);

    // Handle caching asynchronously
    (async () => {
      try {
        // Try to get from cache
        const cached = await getCache(cacheKey);

        if (cached !== null) {
          logger.debug("[CacheMiddleware] Cache hit", { key: cacheKey });

          // Send cached response
          res.status(200).json(cached);
          return;
        }

        // Cache miss - continue to handler
        logger.debug("[CacheMiddleware] Cache miss", { key: cacheKey });

        // Intercept res.json to cache the response
        const originalJson = res.json.bind(res);

        res.json = function (body: any): Response {
          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Store in cache (fire and forget)
            setCache(cacheKey, body, config.ttl).catch((error) => {
              logger.error("[CacheMiddleware] Error caching response", {
                key: cacheKey,
                error: error.message,
              });
            });
          }

          // Call original json method
          return originalJson(body);
        };

        next();
      } catch (error: any) {
        logger.error("[CacheMiddleware] Error in cache middleware", {
          key: cacheKey,
          error: error.message,
        });

        // Continue without caching on error
        next();
      }
    })();
  };
}

/**
 * Convenience function for simple TTL-based caching
 * @param ttl - Time to live in seconds
 */
export function cache(ttl: number) {
  return cacheMiddleware({ ttl });
}

/**
 * Convenience function for caching with custom prefix
 */
export function cacheWithPrefix(ttl: number, prefix: string) {
  return cacheMiddleware({ ttl, prefix });
}

/**
 * Cache middleware for league-specific endpoints
 * Automatically extracts leagueId from params
 */
export function cacheLeague(ttl: number) {
  return cacheMiddleware({
    ttl,
    prefix: "league",
    keyBuilder: (req) => {
      const leagueId = req.params.leagueId;
      const { method, path } = req;
      return `league:${leagueId}:${method}:${path}`;
    },
  });
}

/**
 * Cache middleware for roster-specific endpoints
 * Automatically extracts rosterId from params
 */
export function cacheRoster(ttl: number) {
  return cacheMiddleware({
    ttl,
    prefix: "roster",
    keyBuilder: (req) => {
      const rosterId = req.params.rosterId;
      const { method, path } = req;
      return `roster:${rosterId}:${method}:${path}`;
    },
  });
}

/**
 * Cache middleware for matchup endpoints
 * Automatically extracts leagueId and week from params
 */
export function cacheMatchup(ttl: number) {
  return cacheMiddleware({
    ttl,
    prefix: "matchup",
    keyBuilder: (req) => {
      const { leagueId, week } = req.params;
      const { method, path } = req;
      return `matchup:${leagueId}:${week}:${method}:${path}`;
    },
  });
}
