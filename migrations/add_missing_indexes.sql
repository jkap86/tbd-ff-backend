-- Add indexes for foreign keys and common queries
-- These indexes improve query performance for joins and WHERE clauses

-- Rosters table
CREATE INDEX IF NOT EXISTS idx_rosters_league_id ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user_id ON rosters(user_id);

-- Matchups table
CREATE INDEX IF NOT EXISTS idx_matchups_league_id_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1_id ON matchups(roster1_id);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2_id ON matchups(roster2_id);

-- Draft picks table
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_id ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster_id ON draft_picks(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player_id ON draft_picks(player_id);

-- Weekly lineups table
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster_id_week ON weekly_lineups(roster_id, week);
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_player_id ON weekly_lineups(player_id);

-- Players table (composite index for common queries)
CREATE INDEX IF NOT EXISTS idx_players_position_team ON players(position, team);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);

-- League invites table
CREATE INDEX IF NOT EXISTS idx_league_invites_league_id ON league_invites(league_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_email ON league_invites(email);
CREATE INDEX IF NOT EXISTS idx_league_invites_token ON league_invites(token);

-- Waiver claims table
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league_id ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster_id ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);

-- Trade proposals table
CREATE INDEX IF NOT EXISTS idx_trade_proposals_league_id ON trade_proposals(league_id);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_proposer_roster_id ON trade_proposals(proposer_roster_id);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_receiver_roster_id ON trade_proposals(receiver_roster_id);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_status ON trade_proposals(status);

-- Chat messages table
CREATE INDEX IF NOT EXISTS idx_league_chat_messages_league_id ON league_chat_messages(league_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_messages_created_at ON league_chat_messages(created_at DESC);

-- Drafts table
CREATE INDEX IF NOT EXISTS idx_drafts_league_id ON drafts(league_id);
