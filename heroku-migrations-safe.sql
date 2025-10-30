-- Safe Heroku Migrations
-- Only creates indexes for columns that exist in the Heroku schema

BEGIN;

-- Users table indexes (these should exist)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Leagues table indexes (based on actual Heroku schema)
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);
CREATE INDEX IF NOT EXISTS idx_leagues_league_type ON leagues(league_type);
CREATE INDEX IF NOT EXISTS idx_leagues_season ON leagues(season);

-- Rosters table indexes
CREATE INDEX IF NOT EXISTS idx_rosters_league ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user ON rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_league_user ON rosters(league_id, user_id);

-- Draft picks (for draft room performance)
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster ON draft_picks(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_pick_number ON draft_picks(draft_id, pick_number);

-- Drafts (based on actual Heroku schema)
CREATE INDEX IF NOT EXISTS idx_drafts_league ON drafts(league_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_draft_type ON drafts(draft_type);
CREATE INDEX IF NOT EXISTS idx_drafts_league_status ON drafts(league_id, status);

-- Waiver claims
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);

-- Trades
CREATE INDEX IF NOT EXISTS idx_trades_league ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_proposer ON trades(proposer_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_receiver ON trades(receiver_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);

-- Matchups
CREATE INDEX IF NOT EXISTS idx_matchups_league ON matchups(league_id);
CREATE INDEX IF NOT EXISTS idx_matchups_week ON matchups(week);
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1 ON matchups(roster1_id);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2 ON matchups(roster2_id);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roster ON transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_player ON transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Players (for search and filtering)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);

-- Player stats (critical for scoring calculations)
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_week ON player_stats(week);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_week ON player_stats(player_id, week, season);

COMMIT;

SELECT 'All safe indexes created successfully!' as result;
