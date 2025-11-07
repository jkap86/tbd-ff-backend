-- Migration 071: Re-add foreign key constraints lost in type changes
-- Fixes player_id references to use players.player_id with correct cascade behavior
--
-- CRITICAL FIX: Migrations 035-037 changed player_id columns from INTEGER to VARCHAR(50)
-- but dropped the foreign key constraints without re-adding them. This migration
-- restores referential integrity per TRUTHS.md requirements.

-- ============================================================================
-- PLAYER_STATS: CASCADE DELETE (player stats should be deleted with player)
-- ============================================================================

ALTER TABLE player_stats
  DROP CONSTRAINT IF EXISTS player_stats_player_id_fkey;

ALTER TABLE player_stats
  ADD CONSTRAINT player_stats_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES players(player_id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT player_stats_player_id_fkey ON player_stats
  IS 'CASCADE: Delete stats when player deleted (per TRUTHS.md Section 1)';

-- ============================================================================
-- DRAFT_PICKS: SET NULL (preserve draft history even if player deleted)
-- ============================================================================

ALTER TABLE draft_picks
  DROP CONSTRAINT IF EXISTS draft_picks_player_id_fkey;

ALTER TABLE draft_picks
  ADD CONSTRAINT draft_picks_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES players(player_id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT draft_picks_player_id_fkey ON draft_picks
  IS 'SET NULL: Preserve draft history even if player deleted (per TRUTHS.md Section 1)';

-- ============================================================================
-- AUCTION_NOMINATIONS: RESTRICT (cannot delete player with active nomination)
-- ============================================================================

ALTER TABLE auction_nominations
  DROP CONSTRAINT IF EXISTS auction_nominations_player_id_fkey;

ALTER TABLE auction_nominations
  ADD CONSTRAINT auction_nominations_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES players(player_id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT auction_nominations_player_id_fkey ON auction_nominations
  IS 'RESTRICT: Cannot delete player with active/completed nomination';

-- ============================================================================
-- WAIVER_CLAIMS: player_id (RESTRICT - cannot delete claimed player)
-- ============================================================================

ALTER TABLE waiver_claims
  DROP CONSTRAINT IF EXISTS waiver_claims_player_id_fkey;

ALTER TABLE waiver_claims
  ADD CONSTRAINT waiver_claims_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES players(player_id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT waiver_claims_player_id_fkey ON waiver_claims
  IS 'RESTRICT: Cannot delete player with waiver claims (preserve history)';

-- ============================================================================
-- WAIVER_CLAIMS: drop_player_id (SET NULL - preserve claim if drop player deleted)
-- ============================================================================

ALTER TABLE waiver_claims
  DROP CONSTRAINT IF EXISTS waiver_claims_drop_player_id_fkey;

ALTER TABLE waiver_claims
  ADD CONSTRAINT waiver_claims_drop_player_id_fkey
  FOREIGN KEY (drop_player_id)
  REFERENCES players(player_id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT waiver_claims_drop_player_id_fkey ON waiver_claims
  IS 'SET NULL: Preserve claim history even if dropped player deleted';

-- ============================================================================
-- TRADE_ITEMS: CASCADE (trade items deleted with player)
-- ============================================================================

ALTER TABLE trade_items
  DROP CONSTRAINT IF EXISTS trade_items_player_id_fkey;

ALTER TABLE trade_items
  ADD CONSTRAINT trade_items_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES players(player_id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT trade_items_player_id_fkey ON trade_items
  IS 'CASCADE: Delete trade items when player deleted (per TRUTHS.md Section 1)';

-- ============================================================================
-- VERIFICATION NOTE
-- ============================================================================
-- The following tables already have correct foreign keys (verified):
-- - keeper_selections.player_id → players(player_id) ON DELETE CASCADE (migration 051)
-- - player_adp.player_id → players(player_id) ON DELETE CASCADE (migration 044)
--
-- No changes needed for those tables.

-- ============================================================================
-- CREATE INDEXES FOR FOREIGN KEYS (if not already present)
-- ============================================================================

-- These indexes may have been dropped with the constraints, so re-create them
CREATE INDEX IF NOT EXISTS idx_player_stats_player_id ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player_id ON draft_picks(player_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_player_id ON auction_nominations(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player_id ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_drop_player_id ON waiver_claims(drop_player_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_player_id ON trade_items(player_id);

COMMENT ON TABLE player_stats IS 'Player statistics per week/season. FK to players.player_id cascades on delete.';
COMMENT ON TABLE draft_picks IS 'Draft picks with player selections. FK to players.player_id sets null on delete to preserve history.';
COMMENT ON TABLE auction_nominations IS 'Auction nominations. FK to players.player_id restricts delete during active auctions.';
COMMENT ON TABLE waiver_claims IS 'Waiver claims. FKs to players.player_id restrict/set null to preserve claim history.';
COMMENT ON TABLE trade_items IS 'Trade items. FK to players.player_id cascades on delete.';
