-- Rollback Migration: Consolidate Redundant Indexes
-- Created: 2025-01-13
-- Purpose: Restore indexes that were removed in 088_consolidate_redundant_indexes.sql

-- ============================================================================
-- RESTORE DUPLICATE INDEXES
-- ============================================================================

-- Restore duplicate draft_derby_selections indexes
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_derby_id ON draft_derby_selections(derby_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_roster_id ON draft_derby_selections(roster_id);

-- Restore player index name variations
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_id ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_player ON trade_items(player_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_player_id ON trade_items(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player_id ON waiver_claims(player_id);

-- Restore auction bid index variations
CREATE INDEX IF NOT EXISTS idx_auction_bids_roster ON auction_bids(roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_roster_id ON auction_bids(roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_nomination ON auction_bids(nomination_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_nomination_id ON auction_bids(nomination_id);

-- Note: Incomplete indexes cannot be restored as they were malformed
-- They should be recreated with proper definitions if needed
