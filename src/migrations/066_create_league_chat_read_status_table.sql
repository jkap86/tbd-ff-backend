-- Create league_chat_read_status table to track when users last read chat messages
CREATE TABLE IF NOT EXISTS league_chat_read_status (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, league_id)
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_league_chat_read_status_user_id ON league_chat_read_status(user_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_read_status_league_id ON league_chat_read_status(league_id);
CREATE INDEX IF NOT EXISTS idx_league_chat_read_status_user_league ON league_chat_read_status(user_id, league_id);
