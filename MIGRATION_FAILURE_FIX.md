# Migration 071 Failure - Fix Instructions

## What Happened

Migration 071 failed because your production database has **orphaned data** - records in `player_stats` (and possibly other tables) that reference `player_id` values that don't exist in the `players` table.

**Error:**
```
Key (player_id)=(1019) is not present in table "players"
```

This happens when:
- Players were deleted from Sleeper's database but stats remain
- Manual data operations removed players without cascading
- Data sync issues between your DB and Sleeper API

## The Fix

I've created migration `070b_cleanup_orphaned_player_references.sql` that:
1. **Runs BEFORE migration 071** (alphabetically: 070b comes before 071)
2. **Cleans up all orphaned player references** across all tables
3. **Verifies cleanup was successful** before completing

### What Gets Cleaned Up

| Table | Action | Reason |
|-------|--------|--------|
| `player_stats` | DELETE orphaned records | Stats for non-existent players are invalid |
| `draft_picks` | SET player_id = NULL | Preserve draft history even if player deleted |
| `auction_nominations` | DELETE orphaned records | Nominations for non-existent players are invalid |
| `waiver_claims` | DELETE orphaned records | Claims for non-existent players are invalid |
| `waiver_claims.drop_player_id` | SET to NULL | Preserve claim even if drop player deleted |
| `trade_items` | DELETE orphaned records | Trades involving non-existent players are invalid |
| `keeper_selections` | DELETE orphaned records | Can't keep non-existent players |
| `adp_tracking` | DELETE orphaned records | ADP for non-existent players is invalid |

**This is safe** because these records already represent invalid data.

---

## Deployment Steps

### Option 1: Automatic (Recommended)

Just deploy the new code. The migrations will run in order:

```bash
# 1. Commit the new cleanup migration
git add src/migrations/070b_cleanup_orphaned_player_references.sql
git commit -m "fix: cleanup orphaned player references before adding FKs"
git push origin main

# 2. Deploy to Heroku
git push heroku main
```

**What will happen:**
1. Migration 070b runs → Cleans up orphaned data
2. Migration 071 runs → Adds foreign key constraints (now succeeds!)
3. Migrations 072-075 run → Complete the schema fixes

### Option 2: Manual Verification First

If you want to see what will be cleaned up before deploying:

```bash
# 1. Check for orphaned data
heroku pg:psql -a tbd-ff < find_orphaned_data.sql

# Sample output:
#  table_name    | orphaned_count
# ---------------+----------------
#  player_stats  |            42
#  draft_picks   |             0
#  ...

# 2. If counts look reasonable, deploy
git push heroku main
```

---

## Expected Migration Output

```
Running migration: 070b_cleanup_orphaned_player_references.sql
NOTICE:  Deleted 42 orphaned player_stats records
NOTICE:  Set player_id to NULL for 0 orphaned draft_picks
NOTICE:  Deleted 0 orphaned auction_nominations
NOTICE:  Deleted 0 orphaned waiver_claims (player_id)
NOTICE:  Set drop_player_id to NULL for 0 orphaned waiver_claims
NOTICE:  Deleted 0 orphaned trade_items
NOTICE:  ✓ All orphaned player references cleaned up successfully
✓ Migration 070b_cleanup_orphaned_player_references.sql completed

Running migration: 071_fix_foreign_key_constraints.sql
✓ Migration 071_fix_foreign_key_constraints.sql completed

Running migration: 072_fix_draft_derby_selections_fk.sql
✓ Migration 072_fix_draft_derby_selections_fk.sql completed

Running migration: 073_add_missing_not_null_constraints.sql
✓ Migration 073_add_missing_not_null_constraints.sql completed

Running migration: 074_add_missing_performance_indexes.sql
✓ Migration 074_add_missing_performance_indexes.sql completed

Running migration: 075_document_migration_renumbering.sql
✓ Migration 075_document_migration_renumbering.sql completed

✓ All migrations completed successfully!
  - Total migrations: 76
  - Already applied: 70
  - Newly applied: 6
```

---

## Troubleshooting

### Still Getting Foreign Key Errors?

If migration 071 still fails after 070b runs, check which table:

```bash
heroku logs --tail

# Error will show: "table X violates foreign key constraint Y"
```

Then manually investigate:

```bash
heroku pg:psql -a tbd-ff

-- Find orphaned records in specific table
SELECT player_id, COUNT(*)
FROM player_stats  -- Replace with failing table
WHERE NOT EXISTS (SELECT 1 FROM players WHERE players.player_id = player_stats.player_id)
GROUP BY player_id;
```

### Migration 070b Shows 0 Deleted Records

This means either:
- The orphaned data was already cleaned up manually
- The orphans are in a different table not covered by 070b

Check the error message to see which table/constraint failed.

### Need to Rollback?

```bash
# Rollback to previous release
heroku rollback

# Remove the failed migration from tracking
heroku pg:psql -a tbd-ff
DELETE FROM schema_migrations WHERE version LIKE '07%';

# Fix the issue, then redeploy
git push heroku main
```

---

## Verification After Successful Deploy

```bash
# 1. Check all migrations applied
heroku pg:psql -a tbd-ff -c "SELECT COUNT(*) FROM schema_migrations"
# Should show: 76

# 2. Verify foreign keys exist
heroku pg:psql -a tbd-ff

SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'player_id'
ORDER BY tc.table_name;

# Should show FKs for: player_stats, draft_picks, waiver_claims, etc.

# 3. Verify no orphaned data remains
heroku pg:psql -a tbd-ff < find_orphaned_data.sql
# All counts should be 0
```

---

## Why This Happened

Your production database accumulated orphaned player references over time, likely from:

1. **Sleeper API changes**: Players removed from Sleeper but stats remained in your DB
2. **Manual operations**: Direct SQL operations that bypassed FK constraints
3. **Previous migrations 035-037**: Removed FK constraints to change player_id type, orphans created during that window

**Going forward:** With FK constraints in place (after migration 071), this can't happen again. The database will enforce referential integrity.

---

## Files Added

- ✅ `src/migrations/070b_cleanup_orphaned_player_references.sql` - Cleanup migration
- ✅ `find_orphaned_data.sql` - Diagnostic queries
- ✅ `MIGRATION_FAILURE_FIX.md` - This document

---

## Quick Commands

```bash
# Deploy the fix
git add src/migrations/070b_cleanup_orphaned_player_references.sql
git commit -m "fix: cleanup orphaned player references before adding FKs"
git push origin main
git push heroku main

# Monitor the deployment
heroku logs --tail

# Verify success
heroku pg:psql -a tbd-ff -c "SELECT COUNT(*) FROM schema_migrations"
```

---

**TL;DR:** Just redeploy. Migration 070b will clean up the orphaned data, then 071-075 will succeed.
