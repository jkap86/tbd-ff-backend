-- Migration: Consolidate Redundant Indexes
-- Created: 2025-01-13
-- Purpose: Remove duplicate and overlapping indexes to improve database performance and reduce storage

-- ============================================================================
-- DUPLICATE INDEX REMOVAL
-- ============================================================================

-- Remove duplicate draft_derby_selections indexes (keeping the first one)
DROP INDEX IF EXISTS idx_draft_derby_selections_derby_id; -- Duplicate from recreation
DROP INDEX IF EXISTS idx_draft_derby_selections_roster_id; -- Multiple duplicates

-- Recreate the correct versions
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_derby_id ON draft_derby_selections(derby_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_roster_id ON draft_derby_selections(roster_id);

-- Remove player_id index name inconsistencies (keeping the _id suffix version for consistency)
DROP INDEX IF EXISTS idx_player_stats_player; -- Duplicate of idx_player_stats_player_id
DROP INDEX IF EXISTS idx_trade_items_player; -- Duplicate of idx_trade_items_player_id
DROP INDEX IF EXISTS idx_waiver_claims_player; -- Duplicate of idx_waiver_claims_player_id

-- Ensure the consistent versions exist
CREATE INDEX IF NOT EXISTS idx_player_stats_player_id ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_player_id ON trade_items(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player_id ON waiver_claims(player_id);

-- Remove duplicate roster_id indexes
DROP INDEX IF EXISTS idx_auction_bids_roster; -- Duplicate of idx_auction_bids_roster_id

-- Remove duplicate nomination_id indexes
DROP INDEX IF EXISTS idx_auction_bids_nomination; -- Duplicate of idx_auction_bids_nomination_id

-- ============================================================================
-- OVERLAPPING INDEX REMOVAL
-- ============================================================================
-- Note: Single-column indexes can be removed when a composite index starts with that column

-- Draft-related overlaps
-- idx_draft_picks_draft_id is redundant due to idx_draft_picks_pick_number(draft_id, pick_number)
-- KEEPING: Single column index is still useful for some queries
-- idx_draft_order_draft_id is redundant due to idx_draft_order_position(draft_id, draft_position)
-- KEEPING: Single column index is still useful for some queries

-- League chat overlaps
-- idx_league_chat_league_id is redundant due to idx_league_chat_created_at(league_id, created_at)
-- KEEPING: Single column index is useful for simple league lookups without time filtering

-- ============================================================================
-- INCOMPLETE/MALFORMED INDEX CLEANUP
-- ============================================================================

-- Remove any incomplete index definitions (these should not exist but checking)
DROP INDEX IF EXISTS idx_draft_order_pick_expiration; -- Incomplete definition found
DROP INDEX IF EXISTS idx_auction_bids_roster_winning; -- Incomplete/duplicate
DROP INDEX IF EXISTS idx_draft_chat_user_messages; -- Incomplete definition
DROP INDEX IF EXISTS idx_draft_derby_selections_position; -- May be duplicate
DROP INDEX IF EXISTS idx_draft_picks_round_order; -- Incomplete definition
DROP INDEX IF EXISTS idx_drafts_scheduled_start; -- May be incomplete
DROP INDEX IF EXISTS idx_keeper_selections_season_finalized; -- Incomplete definition
DROP INDEX IF EXISTS idx_league_chat_type; -- Incomplete definition
DROP INDEX IF EXISTS idx_matchups_manual_winner; -- Incomplete definition
DROP INDEX IF EXISTS idx_matchups_playoff_bracket; -- Incomplete definition
DROP INDEX IF EXISTS idx_matchups_season; -- Incomplete definition
DROP INDEX IF EXISTS idx_notification_history_delivery; -- Incomplete definition
DROP INDEX IF EXISTS idx_player_stats_season; -- Incomplete definition
DROP INDEX IF EXISTS idx_player_stats_week_range; -- Incomplete definition
DROP INDEX IF EXISTS idx_rosters_league_wins; -- Incomplete definition
DROP INDEX IF EXISTS idx_season_history_league_season; -- Incomplete definition
DROP INDEX IF EXISTS idx_trades_league_status; -- Incomplete definition
DROP INDEX IF EXISTS idx_trades_pending; -- Incomplete/duplicate definition
DROP INDEX IF EXISTS idx_transactions_type_order; -- Incomplete definition
DROP INDEX IF EXISTS idx_waiver_claims_league_status; -- Incomplete definition
DROP INDEX IF EXISTS idx_waiver_claims_pending; -- Incomplete definition
DROP INDEX IF EXISTS idx_waiver_claims_processing; -- Incomplete definition
DROP INDEX IF EXISTS idx_weekly_lineups_roster_season; -- Incomplete definition

COMMENT ON SCHEMA public IS 'Redundant indexes removed to improve database performance and reduce storage overhead';
