import { getRedisClient, isRedisAvailable } from "../config/redis";
import { logger } from "../config/logger";

/**
 * Cache utility functions for Redis-based caching
 *
 * Features:
 * - Graceful degradation (returns null if Redis unavailable)
 * - Automatic JSON serialization/deserialization
 * - TTL support
 * - Pattern-based invalidation
 * - Cache key namespacing
 */

/**
 * Cache key prefixes for organized namespacing
 */
export const CACHE_KEYS = {
  LEAGUE: "league",
  LEAGUE_DETAILS: "league:details",
  STANDINGS: "standings",
  PLAYOFF_STANDINGS: "playoff:standings",
  ROSTER: "roster",
  ROSTER_PLAYERS: "roster:players",
  MATCHUP: "matchup",
  MATCHUP_WEEK: "matchup:week",
  PLAYER_STATS: "player:stats",
  PLAYER_PROJECTIONS: "player:projections",
} as const;

/**
 * Default TTL values (in seconds)
 */
export const CACHE_TTL = {
  LEAGUE_SETTINGS: 300, // 5 minutes - rarely changes
  STANDINGS: 60, // 1 minute - computed frequently
  ROSTER: 180, // 3 minutes - changes with transactions
  MATCHUP: 30, // 30 seconds - updated frequently during game days
  PLAYER_DATA: 600, // 10 minutes - updated periodically
} as const;

/**
 * Check if Redis is available and connected (re-exported from config)
 */
export { isRedisAvailable } from "../config/redis";

/**
 * Get value from cache
 * @param key - Cache key
 * @returns Parsed value or null if not found/Redis unavailable
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error: any) {
    logger.error("[Cache] Error getting cache", {
      key,
      error: error.message,
    });
    return null;
  }
}

/**
 * Set value in cache with optional TTL
 * @param key - Cache key
 * @param value - Value to cache (will be JSON stringified)
 * @param ttl - Time to live in seconds (optional)
 * @returns true if successful, false otherwise
 */
export async function setCache(
  key: string,
  value: any,
  ttl?: number
): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);

    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }

    logger.debug("[Cache] Set cache", { key, ttl });
    return true;
  } catch (error: any) {
    logger.error("[Cache] Error setting cache", {
      key,
      ttl,
      error: error.message,
    });
    return false;
  }
}

/**
 * Delete specific cache key
 * @param key - Cache key to delete
 * @returns true if deleted, false otherwise
 */
export async function deleteCache(key: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    await redis.del(key);
    logger.debug("[Cache] Deleted cache", { key });
    return true;
  } catch (error: any) {
    logger.error("[Cache] Error deleting cache", {
      key,
      error: error.message,
    });
    return false;
  }
}

/**
 * Delete all cache keys matching a pattern
 * @param pattern - Redis pattern (e.g., "league:123:*")
 * @returns Number of keys deleted
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  if (!isRedisAvailable()) {
    return 0;
  }

  const redis = getRedisClient();
  if (!redis) {
    return 0;
  }

  try {
    // Use SCAN for safe iteration (doesn't block Redis)
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = newCursor;

      if (keys.length > 0) {
        const deleted = await redis.del(...keys);
        deletedCount += deleted;
      }
    } while (cursor !== "0");

    logger.info("[Cache] Deleted cache pattern", { pattern, count: deletedCount });
    return deletedCount;
  } catch (error: any) {
    logger.error("[Cache] Error deleting cache pattern", {
      pattern,
      error: error.message,
    });
    return 0;
  }
}

/**
 * Check if cache key exists
 * @param key - Cache key
 * @returns true if exists, false otherwise
 */
export async function cacheExists(key: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }

  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error: any) {
    logger.error("[Cache] Error checking cache existence", {
      key,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get remaining TTL for a key
 * @param key - Cache key
 * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
 */
export async function getCacheTTL(key: string): Promise<number> {
  if (!isRedisAvailable()) {
    return -2;
  }

  const redis = getRedisClient();
  if (!redis) {
    return -2;
  }

  try {
    return await redis.ttl(key);
  } catch (error: any) {
    logger.error("[Cache] Error getting cache TTL", {
      key,
      error: error.message,
    });
    return -2;
  }
}

/**
 * Helper: Build cache key for league details
 */
export function buildLeagueDetailsKey(leagueId: number): string {
  return `${CACHE_KEYS.LEAGUE_DETAILS}:${leagueId}`;
}

/**
 * Helper: Build cache key for standings
 */
export function buildStandingsKey(leagueId: number): string {
  return `${CACHE_KEYS.STANDINGS}:${leagueId}`;
}

/**
 * Helper: Build cache key for playoff standings
 */
export function buildPlayoffStandingsKey(leagueId: number): string {
  return `${CACHE_KEYS.PLAYOFF_STANDINGS}:${leagueId}`;
}

/**
 * Helper: Build cache key for roster with players
 */
export function buildRosterPlayersKey(rosterId: number): string {
  return `${CACHE_KEYS.ROSTER_PLAYERS}:${rosterId}`;
}

/**
 * Helper: Build cache key for matchup week
 */
export function buildMatchupWeekKey(leagueId: number, week: number): string {
  return `${CACHE_KEYS.MATCHUP_WEEK}:${leagueId}:${week}`;
}

/**
 * Helper: Invalidate all cache for a specific league
 */
export async function invalidateLeagueCache(leagueId: number): Promise<void> {
  logger.info("[Cache] Invalidating league cache", { leagueId });

  // Delete league details
  await deleteCache(buildLeagueDetailsKey(leagueId));

  // Delete standings
  await deleteCache(buildStandingsKey(leagueId));
  await deleteCache(buildPlayoffStandingsKey(leagueId));

  // Delete all matchups for league
  await deleteCachePattern(`${CACHE_KEYS.MATCHUP_WEEK}:${leagueId}:*`);

  // Delete all rosters for league (if we cache by league)
  await deleteCachePattern(`${CACHE_KEYS.ROSTER}:${leagueId}:*`);
}

/**
 * Helper: Invalidate cache for a specific roster
 */
export async function invalidateRosterCache(
  rosterId: number,
  leagueId?: number
): Promise<void> {
  logger.info("[Cache] Invalidating roster cache", { rosterId, leagueId });

  // Delete roster players cache
  await deleteCache(buildRosterPlayersKey(rosterId));

  // If leagueId provided, invalidate standings (roster changes affect standings)
  if (leagueId) {
    await deleteCache(buildStandingsKey(leagueId));
    await deleteCache(buildPlayoffStandingsKey(leagueId));
  }
}

/**
 * Helper: Invalidate cache for matchup updates
 */
export async function invalidateMatchupCache(
  leagueId: number,
  week?: number
): Promise<void> {
  logger.info("[Cache] Invalidating matchup cache", { leagueId, week });

  if (week) {
    // Delete specific week
    await deleteCache(buildMatchupWeekKey(leagueId, week));
  } else {
    // Delete all weeks for league
    await deleteCachePattern(`${CACHE_KEYS.MATCHUP_WEEK}:${leagueId}:*`);
  }

  // Matchup updates affect standings
  await deleteCache(buildStandingsKey(leagueId));
  await deleteCache(buildPlayoffStandingsKey(leagueId));
}

/**
 * Wrapper function for cache-aside pattern
 * @param key - Cache key
 * @param ttl - Time to live in seconds
 * @param fetchFn - Function to fetch data if not in cache
 * @returns Cached or fresh data
 */
export async function getCacheOrFetch<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = await getCache<T>(key);
  if (cached !== null) {
    logger.debug("[Cache] Cache hit", { key });
    return cached;
  }

  // Cache miss - fetch from source
  logger.debug("[Cache] Cache miss", { key });
  const data = await fetchFn();

  // Store in cache for next time (fire and forget)
  setCache(key, data, ttl).catch((error) => {
    logger.error("[Cache] Error storing in cache after fetch", {
      key,
      error,
    });
  });

  return data;
}
