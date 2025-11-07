-- Migration 074: Add performance indexes for common queries
--
-- These indexes improve query performance for frequently accessed patterns
-- identified during schema review. All indexes use IF NOT EXISTS for safety.

-- ============================================================================
-- MATCHUPS: Manual winner selection (commissioner overrides)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_matchups_manual_winner
  ON matchups(manual_winner_selected_by)
  WHERE manual_winner_selected_by IS NOT NULL;

COMMENT ON INDEX idx_matchups_manual_winner
  IS 'Partial index for commissioner manual winner selections (rare, but critical queries)';

-- ============================================================================
-- DRAFT_PICKS: Sorting by round and pick order
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_draft_picks_round_order
  ON draft_picks(draft_id, round, pick_in_round);

COMMENT ON INDEX idx_draft_picks_round_order
  IS 'Composite index for sorting picks by round and position within round';

-- ============================================================================
-- MATCHUPS: Season-based queries (dynasty leagues)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_matchups_season
  ON matchups(league_id, season, week);

COMMENT ON INDEX idx_matchups_season
  IS 'Composite index for querying matchups by season (dynasty league historical data)';

-- ============================================================================
-- PLAYER_STATS: Season aggregates (without week filter)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_player_stats_season
  ON player_stats(player_id, season, season_type);

COMMENT ON INDEX idx_player_stats_season
  IS 'Composite index for season-level stat aggregations (total yards, TDs, etc.)';

-- ============================================================================
-- WAIVER_CLAIMS: Processing order (FAAB/priority)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_waiver_claims_processing
  ON waiver_claims(league_id, status, created_at)
  WHERE status = 'pending';

COMMENT ON INDEX idx_waiver_claims_processing
  IS 'Partial index optimizing pending waiver claims processing in chronological order';

-- ============================================================================
-- TRANSACTIONS: Transaction history by type
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_type_order
  ON transactions(league_id, transaction_type, created_at DESC);

COMMENT ON INDEX idx_transactions_type_order
  IS 'Composite index for filtering transaction history by type (trades, waivers, etc.)';

-- ============================================================================
-- LEAGUE_CHAT_MESSAGES: Message type filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_league_chat_type
  ON league_chat_messages(league_id, message_type, created_at DESC);

COMMENT ON INDEX idx_league_chat_type
  IS 'Composite index for filtering chat messages by type (chat, system, pick_announcement)';

-- ============================================================================
-- DRAFT_CHAT_MESSAGES: User message history
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_draft_chat_user_messages
  ON draft_chat_messages(user_id, created_at DESC);

COMMENT ON INDEX idx_draft_chat_user_messages
  IS 'Index for retrieving user chat history across all drafts';

-- ============================================================================
-- ROSTERS: Combined performance query
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rosters_league_wins
  ON rosters(league_id, wins DESC, points_for DESC);

COMMENT ON INDEX idx_rosters_league_wins
  IS 'Composite index for standings queries (sort by wins, then points_for)';

-- ============================================================================
-- PLAYER_STATS: Week range queries (for aggregations)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_player_stats_week_range
  ON player_stats(player_id, season, season_type, week);

COMMENT ON INDEX idx_player_stats_week_range
  IS 'Composite index for week-range stat aggregations (e.g., weeks 1-8)';

-- ============================================================================
-- TRADES: Active trades by roster
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_trades_pending
  ON trades(proposer_roster_id, receiver_roster_id, status)
  WHERE status = 'pending';

COMMENT ON INDEX idx_trades_pending
  IS 'Partial index for active trade proposal lookups';

-- ============================================================================
-- AUCTION_BIDS: Budget calculations
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_auction_bids_roster_winning
  ON auction_bids(roster_id, is_winning)
  WHERE is_winning = true;

COMMENT ON INDEX idx_auction_bids_roster_winning
  IS 'Partial index for calculating roster budget usage (sum of winning bids)';

-- ============================================================================
-- KEEPER_SELECTIONS: Finalized keepers by season
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_keeper_selections_season_finalized
  ON keeper_selections(roster_id, season, is_finalized);

COMMENT ON INDEX idx_keeper_selections_season_finalized
  IS 'Composite index for querying finalized keeper selections per season';

-- ============================================================================
-- SEASON_HISTORY: Historical performance lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_season_history_league_season
  ON season_history(league_id, season, final_rank);

COMMENT ON INDEX idx_season_history_league_season
  IS 'Composite index for league historical standings by season';

-- ============================================================================
-- NOTIFICATION_HISTORY: Delivery status tracking
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_history_delivery
  ON notification_history(delivery_status, sent_at DESC)
  WHERE delivery_status = 'failed';

COMMENT ON INDEX idx_notification_history_delivery
  IS 'Partial index for tracking failed notification deliveries';

-- ============================================================================
-- WEEKLY_LINEUPS: Current week lineup retrieval
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster_season
  ON weekly_lineups(roster_id, season, week DESC);

COMMENT ON INDEX idx_weekly_lineups_roster_season
  IS 'Composite index for retrieving roster lineups by season';

-- ============================================================================
-- MATCHUPS: Playoff bracket queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_matchups_playoff_bracket
  ON matchups(league_id, is_playoff, playoff_round)
  WHERE is_playoff = true;

COMMENT ON INDEX idx_matchups_playoff_bracket
  IS 'Partial index for playoff bracket generation and queries';

-- ============================================================================
-- END OF PERFORMANCE INDEX ADDITIONS
-- ============================================================================

-- Total indexes added: 18
-- All use IF NOT EXISTS for idempotency and safety
-- All have descriptive comments explaining their purpose
