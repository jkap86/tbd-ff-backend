-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Draft notifications
  draft_your_turn BOOLEAN DEFAULT TRUE,
  draft_other_picks BOOLEAN DEFAULT TRUE,
  draft_completed BOOLEAN DEFAULT TRUE,

  -- Trade notifications
  trade_proposed BOOLEAN DEFAULT TRUE,
  trade_accepted BOOLEAN DEFAULT TRUE,
  trade_declined BOOLEAN DEFAULT TRUE,
  trade_league_announcements BOOLEAN DEFAULT FALSE, -- Other people's trades

  -- Waiver notifications
  waiver_processed BOOLEAN DEFAULT TRUE,
  waiver_outbid BOOLEAN DEFAULT TRUE,

  -- Matchup notifications
  matchup_started BOOLEAN DEFAULT TRUE,
  matchup_ended BOOLEAN DEFAULT TRUE,
  matchup_close_game BOOLEAN DEFAULT TRUE, -- Within 10 points on Monday night

  -- Player notifications
  player_injury BOOLEAN DEFAULT TRUE,
  player_status_change BOOLEAN DEFAULT TRUE,

  -- League notifications
  league_announcements BOOLEAN DEFAULT TRUE,
  league_invites BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

-- Comments
COMMENT ON TABLE notification_preferences IS 'User preferences for which push notifications to receive';
COMMENT ON COLUMN notification_preferences.draft_your_turn IS 'Notify when it''s your turn to draft';
COMMENT ON COLUMN notification_preferences.matchup_close_game IS 'Notify on Monday night if matchup is within 10 points';
