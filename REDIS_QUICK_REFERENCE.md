# Redis Caching - Quick Reference Card

## Quick Start

### Installation (Development)
```bash
# Docker (Recommended)
docker run -d -p 6379:6379 --name tbd-redis redis:alpine

# Verify
redis-cli ping  # Should return "PONG"

# Start app
npm run dev
```

### Configuration (.env)
```bash
REDIS_ENABLED=true          # Set to false to disable caching
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
```

## Adding Caching to a New Endpoint

### 1. Simple Route-Level Caching
```typescript
// In routes file
import { cache, CACHE_TTL } from "../middleware/cacheMiddleware";

// Add cache middleware
router.get("/endpoint",
  authenticate,
  cache(CACHE_TTL.LEAGUE_SETTINGS),  // 5 minutes
  handler
);
```

### 2. Custom Cache Key
```typescript
import { cacheMiddleware } from "../middleware/cacheMiddleware";

router.get("/endpoint/:id",
  cacheMiddleware({
    ttl: 60,
    prefix: "custom",
    keyBuilder: (req) => `custom:${req.params.id}:${req.user.userId}`
  }),
  handler
);
```

### 3. Specialized Middleware
```typescript
import { cacheLeague, cacheRoster, cacheMatchup } from "../middleware/cacheMiddleware";

// League endpoints (auto-extracts leagueId)
router.get("/leagues/:leagueId", cacheLeague(300), handler);

// Roster endpoints (auto-extracts rosterId)
router.get("/rosters/:rosterId", cacheRoster(180), handler);

// Matchup endpoints (auto-extracts leagueId and week)
router.get("/matchups/:leagueId/week/:week", cacheMatchup(30), handler);
```

## Cache Invalidation

### After Data Updates
```typescript
// In controller
import { invalidateLeagueCache, invalidateRosterCache, invalidateMatchupCache } from "../utils/cache";

// Invalidate league caches
await invalidateLeagueCache(leagueId);

// Invalidate roster caches
await invalidateRosterCache(rosterId, leagueId);

// Invalidate matchup caches
await invalidateMatchupCache(leagueId, week);  // Specific week
await invalidateMatchupCache(leagueId);        // All weeks
```

### Manual Cache Operations
```typescript
import { getCache, setCache, deleteCache, deleteCachePattern } from "../utils/cache";

// Get from cache
const data = await getCache<MyType>("cache:key");

// Set with TTL
await setCache("cache:key", data, 300);  // 5 minutes

// Delete specific key
await deleteCache("cache:key");

// Delete by pattern
await deleteCachePattern("league:123:*");
```

## TTL Reference

```typescript
import { CACHE_TTL } from "../utils/cache";

CACHE_TTL.LEAGUE_SETTINGS  // 300s (5 min)  - League configs
CACHE_TTL.STANDINGS        // 60s  (1 min)  - Leaderboards
CACHE_TTL.ROSTER           // 180s (3 min)  - Roster data
CACHE_TTL.MATCHUP          // 30s           - Live scores
CACHE_TTL.PLAYER_DATA      // 600s (10 min) - Player info
```

## Redis CLI Commands

```bash
# Connect to Redis
redis-cli

# View all cache keys
KEYS *

# View specific pattern
KEYS "league:*"

# Get cached value
GET "league:123:GET:/api/leagues/123"

# Check TTL (seconds remaining)
TTL "league:123:GET:/api/leagues/123"

# Delete specific key
DEL "league:123:GET:/api/leagues/123"

# Flush all (CAUTION: Development only!)
FLUSHDB

# Monitor real-time commands
MONITOR
```

## Troubleshooting

### Redis Not Connected
```bash
# Check Redis is running
redis-cli ping

# If using Docker
docker ps | grep redis
docker start tbd-redis

# Check logs
docker logs tbd-redis
```

### Disable Caching Temporarily
```bash
# In .env
REDIS_ENABLED=false

# Restart app
npm run dev
```

### Clear All Caches
```bash
redis-cli FLUSHDB
```

### View Cache Hit/Miss Logs
Look for these in application logs:
```
[Cache] Cache hit { key: '...' }
[Cache] Cache miss { key: '...' }
[Cache] Invalidating league cache { leagueId: 123 }
```

## Common Patterns

### Cache-Aside Pattern
```typescript
import { getCacheOrFetch, CACHE_TTL } from "../utils/cache";

const data = await getCacheOrFetch(
  "cache:key",
  CACHE_TTL.LEAGUE_SETTINGS,
  async () => {
    // This only runs on cache miss
    return await expensiveDatabaseQuery();
  }
);
```

### Conditional Caching
```typescript
router.get("/endpoint",
  (req, res, next) => {
    // Only cache for regular users, not admins
    if (req.user.isAdmin) {
      return next();
    }
    return cache(300)(req, res, next);
  },
  handler
);
```

### Multi-Level Invalidation
```typescript
// When league settings change, invalidate everything
await invalidateLeagueCache(leagueId);  // Invalidates:
// - League details
// - League stats
// - Standings
// - Playoff standings
// - All matchups
// - All rosters in league
```

## Performance Tips

1. **Choose appropriate TTLs:**
   - Static data: 10+ minutes
   - Semi-static (settings): 3-5 minutes
   - Computed (standings): 1 minute
   - Live data (scores): 30 seconds

2. **Invalidate aggressively:**
   - Better to invalidate too much than serve stale data
   - Invalidate related caches when data changes

3. **Monitor cache hit rates:**
   - Good: 60-80% hit rate
   - Investigate low hit rates (<40%)

4. **Pattern-based deletion is expensive:**
   - Use sparingly (only on updates, not reads)
   - Consider specific key deletion when possible

## Environment-Specific Config

### Development
```bash
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Production
```bash
REDIS_ENABLED=true
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_password
REDIS_DB=0
```

### Testing (Disable Cache)
```bash
REDIS_ENABLED=false
```

## Health Check

```typescript
import { checkRedisHealth } from "../config/redis";

const health = await checkRedisHealth();
console.log(health);
// { connected: true, latency: 2 }
// or
// { connected: false, error: "Connection refused" }
```

## File Locations

- **Config:** `src/config/redis.ts`
- **Utilities:** `src/utils/cache.ts`
- **Middleware:** `src/middleware/cacheMiddleware.ts`
- **Full Docs:** `REDIS_CACHING_IMPLEMENTATION.md`
- **Summary:** `REDIS_IMPLEMENTATION_SUMMARY.md`

## Remember

✅ Cache is **optional** - app works without it
✅ Always invalidate on data changes
✅ Use appropriate TTLs for data freshness
✅ Monitor logs for cache effectiveness
✅ Test with caching disabled to isolate issues
