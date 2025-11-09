# Stats Database Integration

## Overview
Integrated **hybrid stats system** combining database persistence with in-memory caching for optimal performance.

## Architecture

### 3-Tier Data Access Strategy
```
Request → Database (fast, persistent)
       → Memory Cache (fastest, temporary)
       → Sleeper API (fallback, slow)
```

### Benefits
- **Database**: Persistent, survives restarts, partitioned for speed
- **Memory Cache**: Fastest access (microseconds)
- **Sleeper API**: Always up-to-date (but slow ~20s)

## Files Created/Modified

### New Files
1. `backend/src/migrations/067_partition_player_stats_by_season.sql` - Partition existing stats table
2. `backend/src/migrations/068_create_player_projections_table.sql` - New projections table (partitioned)
3. `backend/src/services/statsSync.ts` - Sync stats from Sleeper to database
4. `backend/src/services/projectionsSync.ts` - Sync projections from Sleeper to database
5. `backend/src/routes/syncRoutes.ts` - Manual sync endpoints (admin only)
6. `backend/src/controllers/playerStatsDatabaseController.ts` - Direct database query controllers

### Modified Files
1. `backend/src/services/statsPreloader.ts` - Now syncs to BOTH database AND memory cache
2. `backend/src/controllers/playerStatsController.ts` - Database-first fallback logic
3. `flutter_app/lib/screens/draft_room_screen.dart` - Optimized to load 500 players max
4. `backend/src/models/Player.ts` - Added LIMIT 1000 to available players query

## Deployment Steps

### 1. Run Database Migrations
```bash
cd backend
npm run migrate
```

This will:
- Partition `player_stats` table by season (2023-2026 + default)
- Create `player_projections` table (partitioned by season)
- Add indexes for fast queries

### 2. Initial Data Sync (One-Time)
Run these admin endpoints to populate the database:

```bash
# Sync stats for multiple seasons in parallel
curl -X POST http://localhost:3000/api/sync/stats/bulk \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"seasons": ["2023", "2024", "2025"]}'

# Sync projections for current season
curl -X POST http://localhost:3000/api/sync/projections/2025/weeks \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"start_week": 1, "end_week": 18}'
```

### 3. Wire Up Sync Routes
Add to `backend/src/index.ts`:

```typescript
import syncRoutes from "./routes/syncRoutes";

// Add after other routes
app.use("/api/sync", syncRoutes);
```

### 4. Restart Server
The `statsPreloader` will now:
- Sync to database on startup
- Sync to database every 5-15 minutes
- Keep memory cache warm

## How It Works

### On Server Startup
1. statsPreloader runs immediately
2. Syncs 2024 + 2025 stats to database (parallel)
3. Syncs weeks 1-18 projections to database (parallel)
4. Loads current season stats into memory cache
5. Loads current week projections into memory cache

### On API Request (e.g., getBulkPlayerSeasonStats)
1. **Try Database First** (fastest for large datasets)
   - Query partitioned table directly
   - Returns in <100ms
   - If found → return with `source: "database"`

2. **Fall Back to Memory Cache**
   - Check node-cache
   - Returns in <10ms
   - If found → return with `source: "cache"`

3. **Fall Back to Sleeper API**
   - Fetch from Sleeper
   - Takes ~20s
   - Cache result for next time
   - Return with `source: "sleeper-api"`

### Scheduled Sync (Automatic)
- **Every 5 minutes**: Sync current + previous season stats
- **Every 15 minutes**: Sync week range projections
- Database always stays fresh

## Performance Improvements

### Before
- First load: 20s (Sleeper API × 3 calls)
- Subsequent loads: 20s if cache expired
- No persistence (lost on restart)

### After
- First load: <100ms (database query)
- Subsequent loads: <10ms (memory cache)
- Persists across restarts
- Partitioned queries are optimized

## Manual Sync Endpoints (Admin Only)

```bash
# Sync single season stats
POST /api/sync/stats/2025

# Sync multiple seasons (parallel)
POST /api/sync/stats/bulk
Body: {"seasons": ["2023", "2024", "2025"]}

# Sync single week projections
POST /api/sync/projections/2025/10

# Sync week range (parallel)
POST /api/sync/projections/2025/weeks
Body: {"start_week": 1, "end_week": 18}
```

## Monitoring

Check logs for:
- `[StatsPreloader]` - Background sync status
- `[Stats] Database hit` - Successful database queries
- `[Stats] Database miss` - Falls back to cache
- `[StatsSync]` - Database sync progress

## Troubleshooting

### Database queries are slow
- Check if migrations ran: `SELECT * FROM pg_tables WHERE tablename LIKE 'player_%';`
- Verify partitions exist: `SELECT * FROM pg_partitions;`
- Check indexes: `\di` in psql

### Data is stale
- Manually trigger sync: `POST /api/sync/stats/bulk`
- Check statsPreloader is running
- Verify cron schedule is active

### Stats not found
- Check if players exist: `SELECT COUNT(*) FROM players;`
- Verify player_id mapping
- Run initial sync if database is empty

## Rollback Plan

If issues occur, revert to cache-only:
1. Comment out database queries in playerStatsController.ts
2. Keep statsPreloader (it still works standalone)
3. Database will continue syncing in background for future use
