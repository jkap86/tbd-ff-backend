-- Minimal Critical Indexes for Heroku
-- Only the most essential indexes for confirmed tables

BEGIN;

-- Users (confirmed to exist)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Leagues (confirmed to exist)
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

-- Rosters (should exist)
CREATE INDEX IF NOT EXISTS idx_rosters_league ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user ON rosters(user_id);

-- Drafts (confirmed to exist)
CREATE INDEX IF NOT EXISTS idx_drafts_league ON drafts(league_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

-- Players (should exist)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);

-- Player stats (should exist)
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_week ON player_stats(week);

COMMIT;

SELECT 'Minimal indexes created successfully!' as result;
