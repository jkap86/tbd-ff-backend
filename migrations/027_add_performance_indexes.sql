-- Critical Performance Indexes
-- This migration adds indexes for frequently queried columns

BEGIN;

-- Users table indexes (for login, registration)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL;

-- Password reset tokens table indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- Leagues table indexes
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);
CREATE INDEX IF NOT EXISTS idx_leagues_league_type ON leagues(league_type);

-- Rosters table indexes (critical for league operations)
CREATE INDEX IF NOT EXISTS idx_rosters_league ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user ON rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_league_user ON rosters(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_waiver_priority ON rosters(league_id, waiver_priority);

-- Draft picks (for draft room performance)
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster ON draft_picks(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_pick_number ON draft_picks(draft_id, pick_number);

-- Drafts table indexes
CREATE INDEX IF NOT EXISTS idx_drafts_league ON drafts(league_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

-- Waiver claims (critical for waiver processing)
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league_status ON waiver_claims(league_id, status);

-- Waiver settings
CREATE INDEX IF NOT EXISTS idx_waiver_settings_league ON waiver_settings(league_id);

-- Trades
CREATE INDEX IF NOT EXISTS idx_trades_league ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_proposer ON trades(proposer_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_receiver ON trades(receiver_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);

-- Trade items
CREATE INDEX IF NOT EXISTS idx_trade_items_trade ON trade_items(trade_id);

-- Matchups
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1 ON matchups(roster1_id);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2 ON matchups(roster2_id);
CREATE INDEX IF NOT EXISTS idx_matchups_season ON matchups(season);
CREATE INDEX IF NOT EXISTS idx_matchups_status ON matchups(status);

-- Weekly lineups
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster ON weekly_lineups(roster_id);
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_week ON weekly_lineups(week);
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster_week ON weekly_lineups(roster_id, week);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roster ON transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- League invites
CREATE INDEX IF NOT EXISTS idx_league_invites_league ON league_invites(league_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_inviter ON league_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_invited ON league_invites(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_status ON league_invites(status);

-- League chat messages
CREATE INDEX IF NOT EXISTS idx_league_chat_league ON league_chat_messages(league_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_user ON league_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_created ON league_chat_messages(created_at);

-- Draft chat messages
CREATE INDEX IF NOT EXISTS idx_draft_chat_draft ON draft_chat_messages(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_chat_user ON draft_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_chat_created ON draft_chat_messages(created_at);

-- Draft order
CREATE INDEX IF NOT EXISTS idx_draft_order_draft ON draft_order(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_order_roster ON draft_order(roster_id);

-- Auction bids
CREATE INDEX IF NOT EXISTS idx_auction_bids_nomination ON auction_bids(nomination_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_roster ON auction_bids(roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_winning ON auction_bids(is_winning) WHERE is_winning = true;

-- Auction nominations
CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft ON auction_nominations(draft_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_nominating_roster ON auction_nominations(nominating_roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_winning_roster ON auction_nominations(winning_roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_status ON auction_nominations(status);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_player ON auction_nominations(player_id);

-- Players (for search and filtering)
CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_search_rank ON players(search_rank);

-- Full-text search index for player names
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(to_tsvector('english', full_name || ' ' || COALESCE(team, '')));

-- Player stats (critical for scoring calculations)
CREATE INDEX IF NOT EXISTS idx_player_stats_player_week ON player_stats(player_id, week, season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season_type ON player_stats(season_type);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_round_pick ON draft_picks(draft_id, round, pick_number);
CREATE INDEX IF NOT EXISTS idx_rosters_league_waiver ON rosters(league_id, waiver_priority) WHERE waiver_priority IS NOT NULL;

-- Add comments for documentation
COMMENT ON INDEX idx_users_email IS 'Used for login and unique constraint checks';
COMMENT ON INDEX idx_leagues_invite_code IS 'Used for joining leagues via invite code';
COMMENT ON INDEX idx_rosters_league_user IS 'Composite index for checking league membership';
COMMENT ON INDEX idx_waiver_claims_league_status IS 'Used for processing waivers by league and status';
COMMENT ON INDEX idx_player_stats_player_week IS 'Critical for scoring calculations';
COMMENT ON INDEX idx_matchups_league_week IS 'Used for fetching matchups by week';
COMMENT ON INDEX idx_players_search IS 'Full-text search index for player names';

COMMIT;
