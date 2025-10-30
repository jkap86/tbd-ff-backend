-- Combined Heroku Migrations
-- Run this file on Heroku database to apply all pending migrations

BEGIN;

-- Migration 034: Rename max_simultaneous_nominations to nominations_per_manager
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'max_simultaneous_nominations'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'nominations_per_manager'
  ) THEN
    ALTER TABLE drafts
    RENAME COLUMN max_simultaneous_nominations TO nominations_per_manager;
  END IF;
END $$;

-- Update default value - only if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'nominations_per_manager'
  ) THEN
    UPDATE drafts
    SET nominations_per_manager = 3
    WHERE nominations_per_manager = 1 AND draft_type IN ('auction', 'slow_auction');
  END IF;
END $$;

-- Migration 035: Fix auction player_id type
DO $$
BEGIN
  -- Check if column exists and is the wrong type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auction_nominations'
    AND column_name = 'player_id'
    AND data_type = 'integer'
  ) THEN
    -- Drop and recreate with correct type
    ALTER TABLE auction_nominations DROP COLUMN player_id;
    ALTER TABLE auction_nominations ADD COLUMN player_id VARCHAR(50) NOT NULL;
  END IF;
END $$;

-- Migration 036: Fix draft_picks player_id type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'draft_picks'
    AND column_name = 'player_id'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE draft_picks DROP COLUMN player_id;
    ALTER TABLE draft_picks ADD COLUMN player_id VARCHAR(50);
  END IF;
END $$;

-- Migration 037: Fix all player_id types
DO $$
BEGIN
  -- Fix auction_bids.player_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auction_bids'
    AND column_name = 'player_id'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE auction_bids DROP COLUMN player_id;
    ALTER TABLE auction_bids ADD COLUMN player_id VARCHAR(50) NOT NULL;
  END IF;
END $$;

-- Migration 038: Add bid_increment to drafts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts'
    AND column_name = 'bid_increment'
  ) THEN
    ALTER TABLE drafts ADD COLUMN bid_increment INTEGER DEFAULT 1;
  END IF;
END $$;

-- Migration 027: Add Performance Indexes (73 indexes)
-- Users table indexes (for login, registration, password reset)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL;

-- Password Reset Tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used ON password_reset_tokens(used);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_token ON password_reset_tokens(user_id, token);

-- Leagues table indexes
CREATE INDEX IF NOT EXISTS idx_leagues_commissioner ON leagues(commissioner_id);
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);
CREATE INDEX IF NOT EXISTS idx_leagues_league_type ON leagues(league_type);

-- Rosters table indexes (critical for league operations)
CREATE INDEX IF NOT EXISTS idx_rosters_league ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user ON rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_league_user ON rosters(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_waiver_priority ON rosters(league_id, waiver_priority);
CREATE INDEX IF NOT EXISTS idx_rosters_league_rank ON rosters(league_id, rank);
CREATE INDEX IF NOT EXISTS idx_rosters_active_leagues ON rosters(league_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rosters_starters ON rosters USING gin(starters);
CREATE INDEX IF NOT EXISTS idx_rosters_bench ON rosters USING gin(bench);

-- Draft picks (for draft room performance)
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster ON draft_picks(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_pick_number ON draft_picks(draft_id, pick_number);
CREATE INDEX IF NOT EXISTS idx_draft_picks_round ON draft_picks(draft_id, round);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_round ON draft_picks(draft_id, round, pick_number);
CREATE INDEX IF NOT EXISTS idx_draft_picks_picked_at ON draft_picks(picked_at);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster_player ON draft_picks(roster_id, player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_player ON draft_picks(draft_id, player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_roster ON draft_picks(draft_id, roster_id);

-- Drafts
CREATE INDEX IF NOT EXISTS idx_drafts_league ON drafts(league_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_type ON drafts(draft_type);
CREATE INDEX IF NOT EXISTS idx_drafts_league_status ON drafts(league_id, status);

-- Waiver claims (critical for waiver processing)
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league_status ON waiver_claims(league_id, status, waiver_priority);

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
CREATE INDEX IF NOT EXISTS idx_trade_items_roster ON trade_items(roster_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_player ON trade_items(player_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_draft_pick ON trade_items(draft_pick_id);

-- Matchups
CREATE INDEX IF NOT EXISTS idx_matchups_league ON matchups(league_id);
CREATE INDEX IF NOT EXISTS idx_matchups_week ON matchups(week);
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1 ON matchups(roster1_id);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2 ON matchups(roster2_id);
CREATE INDEX IF NOT EXISTS idx_matchups_season ON matchups(season);

-- Weekly lineups
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_matchup ON weekly_lineups(matchup_id);
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster ON weekly_lineups(roster_id);
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_week ON weekly_lineups(week);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roster ON transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_player ON transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_league_created ON transactions(league_id, created_at);

-- League invites
CREATE INDEX IF NOT EXISTS idx_league_invites_league ON league_invites(league_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_inviter ON league_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_invited ON league_invites(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_status ON league_invites(status);
CREATE INDEX IF NOT EXISTS idx_league_invites_created ON league_invites(created_at);
CREATE INDEX IF NOT EXISTS idx_league_invites_league_status ON league_invites(league_id, status);

-- League chat
CREATE INDEX IF NOT EXISTS idx_league_chat_league ON league_chat(league_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_user ON league_chat(user_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_created ON league_chat(created_at);
CREATE INDEX IF NOT EXISTS idx_league_chat_league_created ON league_chat(league_id, created_at);
CREATE INDEX IF NOT EXISTS idx_league_chat_league_user ON league_chat(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_message_text ON league_chat USING gin(to_tsvector('english', message));

-- Draft chat
CREATE INDEX IF NOT EXISTS idx_draft_chat_draft ON draft_chat(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_chat_user ON draft_chat(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_chat_created ON draft_chat(created_at);
CREATE INDEX IF NOT EXISTS idx_draft_chat_draft_created ON draft_chat(draft_id, created_at);
CREATE INDEX IF NOT EXISTS idx_draft_chat_draft_user ON draft_chat(draft_id, user_id);
CREATE INDEX IF NOT EXISTS idx_draft_chat_message_text ON draft_chat USING gin(to_tsvector('english', message));

-- Draft order
CREATE INDEX IF NOT EXISTS idx_draft_order_draft ON draft_order(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_order_roster ON draft_order(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_order_round ON draft_order(draft_id, round);
CREATE INDEX IF NOT EXISTS idx_draft_order_pick ON draft_order(draft_id, pick_number);
CREATE INDEX IF NOT EXISTS idx_draft_order_draft_roster ON draft_order(draft_id, roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_order_draft_round_pick ON draft_order(draft_id, round, pick_number);
CREATE INDEX IF NOT EXISTS idx_draft_order_is_current ON draft_order(draft_id, is_current_pick) WHERE is_current_pick = true;

-- Auction bids
CREATE INDEX IF NOT EXISTS idx_auction_bids_draft ON auction_bids(draft_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_roster ON auction_bids(roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_player ON auction_bids(player_id);

-- Auction nominations
CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft ON auction_nominations(draft_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_roster ON auction_nominations(roster_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_player ON auction_nominations(player_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_status ON auction_nominations(status);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft_status ON auction_nominations(draft_id, status);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft_player ON auction_nominations(draft_id, player_id);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_created ON auction_nominations(created_at);

-- Players (for search and filtering)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(to_tsvector('english', name || ' ' || COALESCE(team, '')));
CREATE INDEX IF NOT EXISTS idx_players_position_team ON players(position, team);

-- Player stats (critical for scoring calculations)
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_week ON player_stats(week);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_week ON player_stats(player_id, week, season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season_week ON player_stats(season, week);

-- Add comments for documentation
COMMENT ON INDEX idx_users_email IS 'Used for login and password reset lookups';
COMMENT ON INDEX idx_leagues_invite_code IS 'Used for joining leagues via invite code';
COMMENT ON INDEX idx_rosters_league_user IS 'Composite index for checking league membership';
COMMENT ON INDEX idx_waiver_claims_league_status IS 'Used for processing waivers in priority order';
COMMENT ON INDEX idx_player_stats_player_week IS 'Critical for scoring calculations';

COMMIT;
