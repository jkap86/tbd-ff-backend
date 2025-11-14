-- Migration: Add Missing Composite Indexes
-- Created: 2025-01-13
-- Purpose: Add composite indexes for common query patterns to improve performance

-- ============================================================================
-- LEAGUE + USER COMPOSITE INDEXES
-- ============================================================================

-- Rosters by league and user (for "my teams in this league" queries)
CREATE INDEX IF NOT EXISTS idx_rosters_league_user ON rosters(league_id, user_id);

-- League invites by user and status (for pending invites lookup)
CREATE INDEX IF NOT EXISTS idx_league_invites_user_status ON league_invites(invited_user_id, status);

-- ============================================================================
-- DRAFT + ROSTER COMPOSITE INDEXES
-- ============================================================================

-- Draft picks by draft and roster (for loading a team's picks in a draft)
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_roster ON draft_picks(draft_id, roster_id);

-- Draft order by draft and roster (for finding a team's draft position)
CREATE INDEX IF NOT EXISTS idx_draft_order_draft_roster ON draft_order(draft_id, roster_id);

-- Auction nominations by draft and nominating roster (for team's nominations)
CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft_roster ON auction_nominations(draft_id, nominating_roster_id);

-- ============================================================================
-- TIME-BASED COMPOSITE INDEXES
-- ============================================================================

-- Matchups by league, week, and year (for loading weekly matchups)
CREATE INDEX IF NOT EXISTS idx_matchups_league_week_year ON matchups(league_id, week, year);

-- Player stats by week, season, and season_type (for weekly stat lookups)
-- Note: This already exists as idx_player_stats_week_season, verifying it's complete
CREATE INDEX IF NOT EXISTS idx_player_stats_week_season_type ON player_stats(week, season, season_type);

-- Weekly lineups by roster, week, and season (for loading lineup history)
-- Note: This already exists, ensuring it's properly defined
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster_week_season ON weekly_lineups(roster_id, week, season);

-- Transactions by league and created date (for league transaction history)
CREATE INDEX IF NOT EXISTS idx_transactions_league_created ON transactions(league_id, created_at DESC);

-- ============================================================================
-- STATUS + ENTITY COMPOSITE INDEXES
-- ============================================================================

-- Trades by league and status (for pending trades in a league)
CREATE INDEX IF NOT EXISTS idx_trades_league_status_composite ON trades(league_id, status);

-- Waiver claims by league and status (for processing league waivers)
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league_status_composite ON waiver_claims(league_id, status);

-- Draft picks by roster and round (for finding picks by round per team)
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster_round ON draft_picks(roster_id, round);

-- ============================================================================
-- PAYMENT + ROSTER COMPOSITE INDEXES
-- ============================================================================

-- Roster payments by league and status (for unpaid dues lookup)
CREATE INDEX IF NOT EXISTS idx_roster_payments_league_status ON roster_payments(league_id, status);

-- League payouts by league and season (for season payout distribution)
-- Note: This already exists, verifying it's complete
CREATE INDEX IF NOT EXISTS idx_league_payouts_league_season_composite ON league_payouts(league_id, season);

-- ============================================================================
-- KEEPER + SEASON COMPOSITE INDEXES
-- ============================================================================

-- Keeper selections by roster and season (for loading keeper selections)
CREATE INDEX IF NOT EXISTS idx_keeper_selections_roster_season ON keeper_selections(roster_id, season);

-- Keeper selections by season and finalized status (for processing keepers)
CREATE INDEX IF NOT EXISTS idx_keeper_selections_season_finalized_composite ON keeper_selections(season, is_finalized);

COMMENT ON INDEX idx_rosters_league_user IS 'Optimizes queries for user rosters within a specific league';
COMMENT ON INDEX idx_matchups_league_week_year IS 'Optimizes weekly matchup queries with year filtering';
COMMENT ON INDEX idx_trades_league_status_composite IS 'Optimizes pending trade queries per league';
COMMENT ON INDEX idx_waiver_claims_league_status_composite IS 'Optimizes waiver processing queries per league';
