-- Migration 070b: Clean up orphaned player_id references
-- This must run BEFORE 071_fix_foreign_key_constraints.sql
--
-- Problem: Some records reference player_id values that don't exist in players table.
-- This prevents adding foreign key constraints.
--
-- Solution: Delete orphaned records (safe because these are already invalid data)

-- ============================================================================
-- CLEANUP ORPHANED PLAYER_STATS
-- ============================================================================

-- Delete player_stats for players that don't exist
-- These are likely from deleted/deprecated Sleeper players
DELETE FROM player_stats
WHERE NOT EXISTS (
  SELECT 1 FROM players WHERE players.player_id = player_stats.player_id
);

-- Log the cleanup
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned player_stats records', deleted_count;
END $$;

-- ============================================================================
-- CLEANUP ORPHANED DRAFT_PICKS
-- ============================================================================

-- Set player_id to NULL for draft picks of non-existent players
-- We preserve the draft pick record but remove the invalid player reference
UPDATE draft_picks
SET player_id = NULL
WHERE player_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM players WHERE players.player_id = draft_picks.player_id
  );

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Set player_id to NULL for % orphaned draft_picks', updated_count;
END $$;

-- ============================================================================
-- CLEANUP ORPHANED AUCTION_NOMINATIONS
-- ============================================================================

-- Delete auction nominations for non-existent players
DELETE FROM auction_nominations
WHERE NOT EXISTS (
  SELECT 1 FROM players WHERE players.player_id = auction_nominations.player_id
);

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned auction_nominations', deleted_count;
END $$;

-- ============================================================================
-- CLEANUP ORPHANED WAIVER_CLAIMS
-- ============================================================================

-- Delete waiver claims for non-existent players
DELETE FROM waiver_claims
WHERE NOT EXISTS (
  SELECT 1 FROM players WHERE players.player_id = waiver_claims.player_id
);

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned waiver_claims (player_id)', deleted_count;
END $$;

-- Set drop_player_id to NULL for non-existent drop players
UPDATE waiver_claims
SET drop_player_id = NULL
WHERE drop_player_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM players WHERE players.player_id = waiver_claims.drop_player_id
  );

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Set drop_player_id to NULL for % orphaned waiver_claims', updated_count;
END $$;

-- ============================================================================
-- CLEANUP ORPHANED TRADE_ITEMS
-- ============================================================================

-- Delete trade items for non-existent players
DELETE FROM trade_items
WHERE player_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM players WHERE players.player_id = trade_items.player_id
  );

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned trade_items', deleted_count;
END $$;

-- ============================================================================
-- CLEANUP ORPHANED KEEPER_SELECTIONS (if table exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'keeper_selections') THEN
    DELETE FROM keeper_selections
    WHERE NOT EXISTS (
      SELECT 1 FROM players WHERE players.player_id = keeper_selections.player_id
    );

    RAISE NOTICE 'Deleted % orphaned keeper_selections', (SELECT COUNT(*) FROM keeper_selections WHERE FALSE);
  END IF;
END $$;

-- ============================================================================
-- CLEANUP ORPHANED ADP_TRACKING (if table exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'adp_tracking') THEN
    DELETE FROM adp_tracking
    WHERE NOT EXISTS (
      SELECT 1 FROM players WHERE players.player_id = adp_tracking.player_id
    );

    RAISE NOTICE 'Deleted % orphaned adp_tracking records', (SELECT COUNT(*) FROM adp_tracking WHERE FALSE);
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify no orphans remain
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  -- Check player_stats
  SELECT COUNT(*) INTO orphan_count
  FROM player_stats ps
  WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = ps.player_id);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Still have % orphaned player_stats records', orphan_count;
  END IF;

  -- Check draft_picks (should all be NULL now if orphaned)
  SELECT COUNT(*) INTO orphan_count
  FROM draft_picks dp
  WHERE dp.player_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM players p WHERE p.player_id = dp.player_id);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Still have % orphaned draft_picks records', orphan_count;
  END IF;

  RAISE NOTICE '✓ All orphaned player references cleaned up successfully';
END $$;

-- Log completion
COMMENT ON TABLE player_stats IS 'Player statistics per week/season. Orphaned records cleaned in migration 070b.';
