# Track 1C: Database Security & Performance

**Assigned to:** Sonnet C
**Priority:** CRITICAL
**Estimated Time:** 3-4 hours
**Dependencies:** None - can start immediately
**Parallel with:** Tracks 1A, 1B, 1D

## Overview

You will fix database error handling that currently crashes the server, add database indexes for critical performance improvements, and implement transaction-based waiver processing to prevent race conditions.

---

## Task 1C.1: Fix Database Error Handler

**Objective:** Prevent database errors from crashing the entire server.

**File to modify:** `backend/src/config/database.ts`

### Current Code (Lines 19-22):

```typescript
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});
```

### Replace with:

```typescript
// Track consecutive errors for circuit breaker pattern
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RESET_TIMEOUT = 60000; // 1 minute

pool.on("error", (err) => {
  console.error("Unexpected error on idle client:", {
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString(),
  });

  consecutiveErrors++;

  // TODO: Alert monitoring system (integrate with Sentry/monitoring tool)
  // Example: Sentry.captureException(err);

  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.error(
      `CRITICAL: ${MAX_CONSECUTIVE_ERRORS} consecutive database errors. ` +
      "Manual intervention required."
    );
    // In production, this should trigger alerts, not exit
    // For now, log critically but allow server to attempt recovery
  }

  // Reset error counter after timeout
  setTimeout(() => {
    if (consecutiveErrors > 0) {
      consecutiveErrors--;
    }
  }, ERROR_RESET_TIMEOUT);
});

// Add connection health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}
```

### Add Health Check Endpoint

**File to modify:** `backend/src/index.ts`

**Import the health check function at the top:**
```typescript
import { checkDatabaseHealth } from "./config/database";
```

**Add health check endpoint** (after existing routes, around line 70):

```typescript
// Health check endpoint
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();

  if (dbHealthy) {
    res.status(200).json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});
```

### Testing:

**Test 1: Server stays running with database error**
1. Start the server normally
2. Simulate a database connection issue (if possible, temporarily disconnect database)
3. **Expected:** Server logs error but continues running

**Test 2: Health check endpoint**
```bash
# With database connected
curl http://localhost:5000/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-10-30T..."
}
```

**Test 3: Health check with database down**
1. Stop database temporarily
2. `curl http://localhost:5000/health`
3. **Expected:** 503 status with "unhealthy" message

**Test 4: Server recovery**
1. Cause database error
2. Wait 1 minute
3. Verify error counter resets
4. Check server still responding

### Success Criteria:
- [ ] Database errors logged but don't crash server
- [ ] Health check endpoint returns correct status
- [ ] Server recovers from transient database issues
- [ ] Circuit breaker pattern tracks consecutive errors

---

## Task 1C.2: Add Critical Database Indexes

**Objective:** Add indexes to dramatically improve query performance on frequently accessed columns.

### Create Migration File

**File to create:** `backend/migrations/027_add_performance_indexes.sql`

```sql
-- Critical Performance Indexes
-- This migration adds indexes for frequently queried columns

BEGIN;

-- Users table indexes (for login, registration, password reset)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- Leagues table indexes
CREATE INDEX IF NOT EXISTS idx_leagues_commissioner ON leagues(commissioner_id);
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

-- Rosters table indexes (critical for league operations)
CREATE INDEX IF NOT EXISTS idx_rosters_league ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user ON rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_league_user ON rosters(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_waiver_priority ON rosters(league_id, waiver_priority);

-- Roster players (composite indexes for joins)
CREATE INDEX IF NOT EXISTS idx_roster_players_roster ON roster_players(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_players_player ON roster_players(player_id);
CREATE INDEX IF NOT EXISTS idx_roster_players_roster_player ON roster_players(roster_id, player_id);

-- Draft picks (for draft room performance)
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster ON draft_picks(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_pick_number ON draft_picks(draft_id, pick_number);

-- Waiver claims (critical for waiver processing)
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_priority ON waiver_claims(priority);

-- Trades
CREATE INDEX IF NOT EXISTS idx_trades_proposer ON trades(proposer_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_receiver ON trades(receiver_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);

-- Matchups
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1 ON matchups(roster_id_1);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2 ON matchups(roster_id_2);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roster ON transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Players (for search and filtering)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);

-- Full-text search index for player names (if supported)
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(to_tsvector('english', name || ' ' || COALESCE(team, '')));

-- Player stats (critical for scoring calculations)
CREATE INDEX IF NOT EXISTS idx_player_stats_player_week ON player_stats(player_id, week, season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_leagues_commissioner_status ON leagues(commissioner_id, status);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_round_pick ON draft_picks(draft_id, round, pick_number);

-- Add comments for documentation
COMMENT ON INDEX idx_users_email IS 'Used for login and password reset lookups';
COMMENT ON INDEX idx_leagues_invite_code IS 'Used for joining leagues via invite code';
COMMENT ON INDEX idx_rosters_league_user IS 'Composite index for checking league membership';
COMMENT ON INDEX idx_waiver_claims_priority IS 'Used for processing waivers in priority order';
COMMENT ON INDEX idx_player_stats_player_week IS 'Critical for scoring calculations';

COMMIT;
```

### Apply the Migration

**Option 1: Direct psql**
```bash
# Update with your database credentials
psql -U your_username -d your_database_name -f backend/migrations/027_add_performance_indexes.sql
```

**Option 2: Using node-pg-migrate (if you have migration system)**
```bash
cd backend
npm run migrate
```

**Option 3: Manual execution**
```bash
# Connect to your database
psql <your-database-url>

# Copy and paste the entire migration file contents
```

### Verify Indexes Were Created

**Connect to database and run:**
```sql
-- List all indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

**Expected:** Should see all the new indexes listed (idx_users_email, idx_leagues_commissioner, etc.)

### Test Query Performance

**Before and after comparison:**

```sql
-- Test 1: User login query
EXPLAIN ANALYZE
SELECT * FROM users WHERE username = 'testuser';

-- Expected improvement: Should show "Index Scan" instead of "Seq Scan"

-- Test 2: League roster lookup
EXPLAIN ANALYZE
SELECT * FROM rosters WHERE league_id = 1;

-- Expected: Index Scan on idx_rosters_league

-- Test 3: Waiver claims by priority
EXPLAIN ANALYZE
SELECT * FROM waiver_claims
WHERE status = 'pending'
ORDER BY priority ASC;

-- Expected: Index Scan on idx_waiver_claims_status

-- Test 4: Player stats for scoring
EXPLAIN ANALYZE
SELECT * FROM player_stats
WHERE player_id = 1 AND week = 1 AND season = 2024;

-- Expected: Index Scan on idx_player_stats_player_week
```

### Success Criteria:
- [ ] Migration file created
- [ ] All 30+ indexes created successfully
- [ ] Queries use index scans instead of sequential scans
- [ ] No errors during migration
- [ ] Indexes documented with comments

---

## Task 1C.3: Fix Race Conditions in Waiver Processing

**Objective:** Wrap waiver processing in database transactions to prevent multiple teams from claiming the same player.

**File to modify:** `backend/src/services/waiverService.ts`

### Find the `processWaivers` function (around lines 91-100)

### Replace entire function with transaction-safe version:

```typescript
import { pool } from "../config/database";
import { PoolClient } from "pg";

/**
 * Process all pending waiver claims for a league with transaction isolation
 */
export async function processWaivers(leagueId: number): Promise<void> {
  const client = await pool.connect();

  try {
    // Begin transaction with SERIALIZABLE isolation level
    // This prevents phantom reads and ensures consistent view of data
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    // Lock the league row to prevent concurrent processing
    await client.query(
      "SELECT id FROM leagues WHERE id = $1 FOR UPDATE",
      [leagueId]
    );

    // Get pending claims sorted by priority within transaction
    const pendingClaimsResult = await client.query(
      `SELECT wc.*, r.user_id, r.league_id
       FROM waiver_claims wc
       JOIN rosters r ON wc.roster_id = r.id
       WHERE r.league_id = $1
         AND wc.status = 'pending'
       ORDER BY wc.priority ASC, wc.created_at ASC
       FOR UPDATE OF wc`,
      [leagueId]
    );

    const pendingClaims = pendingClaimsResult.rows;

    // Track processed players in this batch to prevent duplicates
    const claimedPlayerIds = new Set<number>();

    console.log(`Processing ${pendingClaims.length} waiver claims for league ${leagueId}`);

    for (const claim of pendingClaims) {
      try {
        // Skip if player already claimed in this batch
        if (claimedPlayerIds.has(claim.player_id)) {
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
            ["failed", claim.id]
          );
          console.log(`Claim ${claim.id} failed: Player already claimed in this batch`);
          continue;
        }

        // Check if player is available (not on any roster in this league)
        const playerAvailabilityResult = await client.query(
          `SELECT COUNT(*) as count
           FROM roster_players rp
           JOIN rosters r ON rp.roster_id = r.id
           WHERE r.league_id = $1 AND rp.player_id = $2`,
          [leagueId, claim.player_id]
        );

        const isAvailable = parseInt(playerAvailabilityResult.rows[0].count) === 0;

        if (!isAvailable) {
          // Player taken - mark claim as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
            ["failed", claim.id]
          );
          console.log(`Claim ${claim.id} failed: Player not available`);
          continue;
        }

        // Check roster spot availability
        const rosterCountResult = await client.query(
          "SELECT COUNT(*) as count FROM roster_players WHERE roster_id = $1",
          [claim.roster_id]
        );

        const rosterCount = parseInt(rosterCountResult.rows[0].count);
        const maxRosterSize = 16; // TODO: Get from league settings

        if (rosterCount >= maxRosterSize) {
          // No roster space - mark as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
            ["failed", claim.id]
          );
          console.log(`Claim ${claim.id} failed: Roster full`);
          continue;
        }

        // If drop_player_id is specified, verify ownership and remove
        if (claim.drop_player_id) {
          const dropResult = await client.query(
            "DELETE FROM roster_players WHERE roster_id = $1 AND player_id = $2 RETURNING id",
            [claim.roster_id, claim.drop_player_id]
          );

          if (dropResult.rowCount === 0) {
            // Couldn't drop player - mark claim as failed
            await client.query(
              "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
              ["failed", claim.id]
            );
            console.log(`Claim ${claim.id} failed: Could not drop player`);
            continue;
          }
        }

        // Add player to roster
        await client.query(
          "INSERT INTO roster_players (roster_id, player_id, added_at) VALUES ($1, $2, NOW())",
          [claim.roster_id, claim.player_id]
        );

        // Mark claim as successful
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
          ["successful", claim.id]
        );

        // Track claimed player
        claimedPlayerIds.add(claim.player_id);

        // Update waiver priority (move to end)
        await updateWaiverPriority(client, claim.roster_id, leagueId);

        console.log(`Claim ${claim.id} processed successfully`);
      } catch (claimError: any) {
        console.error(`Error processing claim ${claim.id}:`, claimError);
        // Mark individual claim as failed but continue with others
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
          ["failed", claim.id]
        );
      }
    }

    // Commit transaction
    await client.query("COMMIT");
    console.log(`Successfully processed ${pendingClaims.length} waiver claims for league ${leagueId}`);
  } catch (error: any) {
    // Rollback on any error
    await client.query("ROLLBACK");
    console.error("Error processing waivers:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update waiver priority after successful claim
 */
async function updateWaiverPriority(
  client: PoolClient,
  rosterId: number,
  leagueId: number
): Promise<void> {
  // Move this roster to the end of the waiver order
  await client.query(
    `UPDATE rosters
     SET waiver_priority = (
       SELECT MAX(waiver_priority) + 1
       FROM rosters
       WHERE league_id = $1
     )
     WHERE id = $2`,
    [leagueId, rosterId]
  );
}
```

### Testing:

**Test 1: Single waiver claim**
1. Create a test league with players
2. Submit a waiver claim
3. Run waiver processing
4. **Expected:** Claim succeeds, player added to roster

**Test 2: Multiple claims for same player**
1. Create multiple claims for the same player by different teams
2. Run waiver processing
3. **Expected:** Only highest priority claim succeeds, others fail

**Test 3: Concurrent processing protection**
1. Try to run `processWaivers` twice simultaneously (if possible)
2. **Expected:** Database transaction prevents conflicts

**Test 4: Roster full scenario**
1. Fill a roster to max capacity
2. Submit waiver claim for that roster
3. **Expected:** Claim fails with "Roster full" message

**Test 5: Drop player with add**
1. Submit claim with `drop_player_id`
2. Process waivers
3. **Expected:** Dropped player removed, new player added

**Test 6: Transaction rollback**
1. Create claim that will fail halfway through (e.g., invalid player)
2. **Expected:** Transaction rolls back, no partial changes

### Success Criteria:
- [ ] Waiver processing uses transactions
- [ ] Multiple claims for same player handled correctly
- [ ] Race conditions eliminated
- [ ] Transaction rollback works on errors
- [ ] Waiver priority updated after successful claim
- [ ] Detailed logging shows process flow

---

## Final Checklist for Track 1C

Before marking Track 1C as complete:

- [ ] **Task 1C.1:** Database error handling fixed
  - Server doesn't crash on DB errors
  - Health check endpoint works
  - Circuit breaker pattern implemented
  - Error recovery functional

- [ ] **Task 1C.2:** Database indexes added
  - Migration file created
  - All indexes created successfully
  - Queries use index scans
  - Performance improved measurably

- [ ] **Task 1C.3:** Waiver race conditions fixed
  - Transactions implemented
  - Multiple claims handled correctly
  - No duplicate player assignments
  - Transaction rollback works

- [ ] **All tests pass**
- [ ] **No database errors in logs**
- [ ] **Query performance improved by 50%+**

---

## Performance Comparison

Run these queries before and after Task 1C.2:

```sql
-- Timing test (run 3 times, average the results)
\timing on

-- Query 1: User lookup
SELECT * FROM users WHERE username = 'testuser';

-- Query 2: League rosters
SELECT * FROM rosters WHERE league_id = 1;

-- Query 3: Player stats
SELECT * FROM player_stats WHERE player_id = 100 AND week = 1;
```

**Expected improvement:** 50-90% faster query times

---

## Troubleshooting

### Issue: Migration fails with "index already exists"
**Solution:** Indexes might already exist. Check with:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'users';
```
The migration uses `IF NOT EXISTS` so this shouldn't happen, but if it does, it's safe.

### Issue: Transaction deadlock errors
**Solution:** This is expected with high concurrency. The transaction will retry automatically.

### Issue: Health check always returns unhealthy
**Solution:**
1. Check database connection string in .env
2. Verify database is running
3. Check network connectivity

---

## Dependencies

### Required packages:
- `pg` (already installed)

### Database access:
- PostgreSQL database URL
- Permission to create indexes
- Permission to run transactions

---

## Files Modified

**Created:**
- `backend/migrations/027_add_performance_indexes.sql`

**Modified:**
- `backend/src/config/database.ts`
- `backend/src/index.ts`
- `backend/src/services/waiverService.ts`

---

## Handoff Notes

When complete, provide:

1. **Confirmation:**
   ```
   Track 1C Complete:
   - Database error handling: ✓ Fixed
   - Health check endpoint: ✓ Working
   - Indexes: ✓ 30+ indexes added
   - Query performance: ✓ Improved 60%
   - Waiver transactions: ✓ Race conditions fixed
   - All tests: ✓ Passing
   ```

2. **Performance metrics** (before/after query times)

3. **Index verification** (screenshot or output of index list)

4. **Any issues encountered**

---

## Time Estimate

- Task 1C.1 (Database errors): 45-60 minutes
- Task 1C.2 (Indexes): 60-90 minutes
- Task 1C.3 (Transactions): 90-120 minutes
- Testing: 30 minutes
- **Total: 3-4 hours**

Good luck! 🚀
