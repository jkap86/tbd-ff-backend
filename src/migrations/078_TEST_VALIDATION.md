# Migration 078 - Test Validation Guide

## Quick Validation Steps

### 1. Pre-Migration Check
Before running the migration, verify the current state:

```sql
-- Check existing indexes on waiver_claims
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'waiver_claims'
ORDER BY indexname;

-- Check existing indexes on trades
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'trades'
ORDER BY indexname;
```

**Expected Result**: Should NOT see `idx_waiver_claims_league_status`, `idx_waiver_claims_pending`, `idx_trades_league_status`, or `idx_trades_pending`

### 2. Run Migration

```bash
# From backend directory
npm run migrate:dev
```

**Expected Output**:
```
Running migration: 078_add_composite_query_indexes.sql
✓ Migration 078_add_composite_query_indexes.sql completed successfully
```

### 3. Post-Migration Verification

```sql
-- Verify waiver claims indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'waiver_claims'
AND indexname IN ('idx_waiver_claims_league_status', 'idx_waiver_claims_pending')
ORDER BY indexname;

-- Verify trades indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'trades'
AND indexname IN ('idx_trades_league_status', 'idx_trades_pending')
ORDER BY indexname;
```

**Expected Result**: Should see all 4 new indexes with their definitions

### 4. Query Performance Test

#### Test Waiver Claims Query
```sql
-- Add EXPLAIN ANALYZE to see query plan
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM waiver_claims
WHERE league_id = 1 AND status = 'pending'
ORDER BY created_at;
```

**Expected Plan**: Should use `idx_waiver_claims_pending` index
```
Index Scan using idx_waiver_claims_pending on waiver_claims
  Index Cond: ((league_id = 1))
  Filter: (status = 'pending'::text)
```

#### Test Trades Query
```sql
-- Add EXPLAIN ANALYZE to see query plan
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM trades
WHERE league_id = 1 AND status = 'pending'
ORDER BY proposed_at DESC;
```

**Expected Plan**: Should use `idx_trades_pending` index
```
Index Scan using idx_trades_pending on trades
  Index Cond: ((league_id = 1))
  Filter: (status = 'pending'::text)
```

### 5. Index Size Verification

```sql
-- Check size of new indexes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_indexes
WHERE tablename IN ('waiver_claims', 'trades')
AND indexname LIKE 'idx_%_league_status' OR indexname LIKE 'idx_%_pending'
ORDER BY tablename, indexname;
```

**Expected Result**: Each index should be relatively small (< 500KB for development databases)

### 6. Test Rollback (Optional)

```bash
# Run rollback script
psql $DATABASE_URL -f src/migrations/078_add_composite_query_indexes.rollback.sql
```

Then verify indexes are removed:
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('waiver_claims', 'trades')
AND (indexname LIKE 'idx_%_league_status' OR indexname LIKE 'idx_%_pending');
```

**Expected Result**: Empty result (no rows)

Then re-run migration:
```bash
npm run migrate:dev
```

## Performance Benchmarks

### With Sample Data

If you have a test database with sample data, run these benchmarks:

```sql
-- Benchmark 1: Waiver claims query (run 3 times, average the results)
EXPLAIN (ANALYZE, TIMING)
SELECT * FROM waiver_claims
WHERE league_id = 1 AND status = 'pending'
ORDER BY created_at
LIMIT 20;

-- Benchmark 2: Trades query (run 3 times, average the results)
EXPLAIN (ANALYZE, TIMING)
SELECT * FROM trades
WHERE league_id = 1 AND status = 'pending'
ORDER BY proposed_at DESC
LIMIT 20;
```

**Expected Improvement**:
- Small datasets (< 1000 rows): Minimal improvement (already fast)
- Medium datasets (1000-10000 rows): 2-5x faster
- Large datasets (> 10000 rows): 5-10x faster

## Common Issues

### Issue: Migration fails with "relation does not exist"
**Cause**: Tables haven't been created yet
**Solution**: Ensure migrations 020 and 028 have been run first

### Issue: Index already exists error
**Cause**: Migration was partially applied before
**Solution**: Check which indexes exist and manually drop/recreate as needed

### Issue: Query still not using new index
**Cause**: PostgreSQL query planner choosing different plan
**Solution**:
1. Run `ANALYZE waiver_claims;` and `ANALYZE trades;`
2. Check if the partial index condition matches your query exactly
3. Verify you have enough data for the optimizer to prefer the index

## Validation Checklist

- [ ] Pre-migration: Verified indexes don't exist
- [ ] Migration ran successfully without errors
- [ ] Post-migration: All 4 indexes exist
- [ ] Waiver claims query uses `idx_waiver_claims_pending`
- [ ] Trades query uses `idx_trades_pending`
- [ ] Index sizes are reasonable (< 1MB for dev databases)
- [ ] (Optional) Rollback tested and works correctly
- [ ] (Optional) Performance benchmarks show improvement

## Next Steps

After successful validation:
1. Test in staging environment with production-like data volume
2. Monitor query performance before and after
3. Consider adding similar composite indexes for other frequently queried tables
4. Update application monitoring to track query performance metrics
