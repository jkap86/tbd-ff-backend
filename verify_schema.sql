-- Database Schema Verification Script
-- Run this script AFTER applying fix migrations 071-075
-- This will verify all critical constraints and indexes are in place

\echo '========================================='
\echo 'DATABASE SCHEMA VERIFICATION'
\echo 'Checking all constraints from TRUTHS.md'
\echo '========================================='
\echo ''

-- ============================================================================
-- 1. VERIFY FOREIGN KEY CONSTRAINTS ON PLAYER_ID
-- ============================================================================

\echo '1. Checking player_id foreign key constraints...'
\echo '   Expected: 8 foreign keys to players.player_id'
\echo ''

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name IN ('player_id', 'drop_player_id')
  AND ccu.table_name = 'players'
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo 'Expected results:'
\echo '  - auction_nominations.player_id → players.player_id (RESTRICT)'
\echo '  - draft_picks.player_id → players.player_id (SET NULL)'
\echo '  - keeper_selections.player_id → players.player_id (CASCADE)'
\echo '  - player_adp.player_id → players.player_id (CASCADE)'
\echo '  - player_stats.player_id → players.player_id (CASCADE)'
\echo '  - trade_items.player_id → players.player_id (CASCADE)'
\echo '  - waiver_claims.drop_player_id → players.player_id (SET NULL)'
\echo '  - waiver_claims.player_id → players.player_id (RESTRICT)'
\echo ''

-- ============================================================================
-- 2. VERIFY CASCADE DELETE RELATIONSHIPS
-- ============================================================================

\echo '2. Checking CASCADE DELETE relationships...'
\echo ''

SELECT
  ccu.table_name AS parent_table,
  tc.table_name AS child_table,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND rc.delete_rule = 'CASCADE'
ORDER BY ccu.table_name, tc.table_name;

\echo ''
\echo 'Verify against TRUTHS.md Section 1 (Database Rules & Schema Constraints)'
\echo ''

-- ============================================================================
-- 3. VERIFY SET NULL RELATIONSHIPS (Preserve History)
-- ============================================================================

\echo '3. Checking SET NULL relationships (preserve history)...'
\echo ''

SELECT
  ccu.table_name AS parent_table,
  tc.table_name AS child_table,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND rc.delete_rule = 'SET NULL'
ORDER BY ccu.table_name, tc.table_name;

\echo ''
\echo 'Expected SET NULL relationships:'
\echo '  - draft_picks.player_id (preserve draft history)'
\echo '  - matchups.roster2_id (bye weeks)'
\echo '  - draft_audit_log.roster_id, user_id (audit trail)'
\echo '  - draft_pick_trades.original_roster_id (trade history)'
\echo '  - waiver_claims.drop_player_id (preserve claims)'
\echo ''

-- ============================================================================
-- 4. VERIFY UNIQUE CONSTRAINTS
-- ============================================================================

\echo '4. Checking UNIQUE constraints...'
\echo ''

SELECT
  tc.table_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

\echo ''
\echo 'Verify against TRUTHS.md Section 1 (Unique Constraints table)'
\echo ''

-- ============================================================================
-- 5. VERIFY CHECK CONSTRAINTS
-- ============================================================================

\echo '5. Checking CHECK constraints...'
\echo ''

SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints AS tc
JOIN information_schema.check_constraints AS cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
  AND tc.constraint_name NOT LIKE '%_not_null' -- Exclude auto-generated NOT NULL checks
ORDER BY tc.table_name, tc.constraint_name;

\echo ''
\echo 'Verify against TRUTHS.md Section 1 (Check Constraints table)'
\echo ''

-- ============================================================================
-- 6. VERIFY NOT NULL CONSTRAINTS ON CRITICAL COLUMNS
-- ============================================================================

\echo '6. Checking NOT NULL constraints on critical columns...'
\echo ''

SELECT
  table_name,
  column_name,
  data_type,
  CASE WHEN is_nullable = 'NO' THEN '✓ NOT NULL' ELSE '✗ NULLABLE' END AS constraint_status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'leagues' AND column_name = 'invite_code')
    OR (table_name = 'rosters' AND column_name IN ('league_id', 'user_id', 'roster_id'))
    OR (table_name = 'draft_order' AND column_name IN ('draft_id', 'roster_id', 'draft_position'))
    OR (table_name = 'draft_derby' AND column_name = 'selection_order')
  )
ORDER BY table_name, column_name;

\echo ''
\echo 'All critical columns should be NOT NULL'
\echo ''

-- ============================================================================
-- 7. VERIFY PERFORMANCE INDEXES
-- ============================================================================

\echo '7. Checking performance indexes added in migration 074...'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_matchups_manual_winner',
    'idx_draft_picks_round_order',
    'idx_matchups_season',
    'idx_player_stats_season',
    'idx_waiver_claims_processing',
    'idx_transactions_type_order',
    'idx_league_chat_type',
    'idx_draft_chat_user_messages',
    'idx_rosters_league_wins',
    'idx_player_stats_week_range',
    'idx_trades_pending',
    'idx_auction_bids_roster_winning',
    'idx_keeper_selections_season_finalized',
    'idx_season_history_league_season',
    'idx_notification_history_delivery',
    'idx_weekly_lineups_roster_season',
    'idx_matchups_playoff_bracket'
  )
ORDER BY tablename, indexname;

\echo ''
\echo 'Expected: 17 performance indexes'
\echo ''

-- ============================================================================
-- 8. VERIFY DRAFT_DERBY_SELECTIONS FOREIGN KEY
-- ============================================================================

\echo '8. Checking draft_derby_selections.roster_id foreign key...'
\echo '   (Fixed in migration 072)'
\echo ''

SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'draft_derby_selections'
  AND kcu.column_name = 'roster_id';

\echo ''
\echo 'Expected: CASCADE DELETE to rosters(id)'
\echo ''

-- ============================================================================
-- 9. CHECK FOR ORPHANED RECORDS (Data Integrity Test)
-- ============================================================================

\echo '9. Checking for orphaned records (should be 0 for all)...'
\echo ''

-- Orphaned player_stats (player_id doesn't exist in players)
SELECT 'player_stats' AS table_name, COUNT(*) AS orphaned_records
FROM player_stats ps
LEFT JOIN players p ON ps.player_id = p.player_id
WHERE p.player_id IS NULL

UNION ALL

-- Orphaned draft_picks
SELECT 'draft_picks', COUNT(*)
FROM draft_picks dp
LEFT JOIN players p ON dp.player_id = p.player_id
WHERE dp.player_id IS NOT NULL AND p.player_id IS NULL

UNION ALL

-- Orphaned waiver_claims
SELECT 'waiver_claims', COUNT(*)
FROM waiver_claims wc
LEFT JOIN players p ON wc.player_id = p.player_id
WHERE p.player_id IS NULL

UNION ALL

-- Orphaned draft_derby_selections
SELECT 'draft_derby_selections', COUNT(*)
FROM draft_derby_selections dds
LEFT JOIN rosters r ON dds.roster_id = r.id
WHERE r.id IS NULL;

\echo ''
\echo 'All counts should be 0 (no orphaned records)'
\echo ''

-- ============================================================================
-- 10. SUMMARY
-- ============================================================================

\echo '========================================='
\echo 'VERIFICATION COMPLETE'
\echo '========================================='
\echo ''
\echo 'Review the output above and compare to expected values.'
\echo ''
\echo 'If all checks pass:'
\echo '  ✓ Foreign key constraints restored'
\echo '  ✓ CASCADE/SET NULL behaviors correct'
\echo '  ✓ UNIQUE constraints present'
\echo '  ✓ CHECK constraints enforced'
\echo '  ✓ NOT NULL constraints added'
\echo '  ✓ Performance indexes created'
\echo '  ✓ No orphaned records'
\echo ''
\echo 'Schema is compliant with TRUTHS.md'
\echo ''

-- ============================================================================
-- BONUS: Generate statistics
-- ============================================================================

\echo 'Database Statistics:'
\echo ''

SELECT
  'Total Tables' AS metric,
  COUNT(DISTINCT table_name)::text AS value
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'

UNION ALL

SELECT
  'Total Foreign Keys',
  COUNT(*)::text
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'

UNION ALL

SELECT
  'Total UNIQUE Constraints',
  COUNT(*)::text
FROM information_schema.table_constraints
WHERE constraint_type = 'UNIQUE' AND table_schema = 'public'

UNION ALL

SELECT
  'Total CHECK Constraints',
  COUNT(*)::text
FROM information_schema.table_constraints
WHERE constraint_type = 'CHECK' AND table_schema = 'public'

UNION ALL

SELECT
  'Total Indexes',
  COUNT(*)::text
FROM pg_indexes
WHERE schemaname = 'public';

\echo ''
\echo 'For detailed analysis, see:'
\echo '  - COMPREHENSIVE_DB_SCHEMA_REVIEW.md'
\echo '  - EXECUTIVE_SUMMARY.md'
\echo ''
