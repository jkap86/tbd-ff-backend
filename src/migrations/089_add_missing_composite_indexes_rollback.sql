-- Rollback Migration: Add Missing Composite Indexes
-- Created: 2025-01-13
-- Purpose: Remove composite indexes added in 089_add_missing_composite_indexes.sql

-- ============================================================================
-- REMOVE LEAGUE + USER COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_rosters_league_user;
DROP INDEX IF EXISTS idx_league_invites_user_status;

-- ============================================================================
-- REMOVE DRAFT + ROSTER COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_draft_picks_draft_roster;
DROP INDEX IF EXISTS idx_draft_order_draft_roster;
DROP INDEX IF EXISTS idx_auction_nominations_draft_roster;

-- ============================================================================
-- REMOVE TIME-BASED COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_matchups_league_week_year;
DROP INDEX IF EXISTS idx_player_stats_week_season_type;
DROP INDEX IF EXISTS idx_weekly_lineups_roster_week_season;
DROP INDEX IF EXISTS idx_transactions_league_created;

-- ============================================================================
-- REMOVE STATUS + ENTITY COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_trades_league_status_composite;
DROP INDEX IF EXISTS idx_waiver_claims_league_status_composite;
DROP INDEX IF EXISTS idx_draft_picks_roster_round;

-- ============================================================================
-- REMOVE PAYMENT + ROSTER COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_roster_payments_league_status;
DROP INDEX IF EXISTS idx_league_payouts_league_season_composite;

-- ============================================================================
-- REMOVE KEEPER + SEASON COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_keeper_selections_roster_season;
DROP INDEX IF EXISTS idx_keeper_selections_season_finalized_composite;
