-- Create push notification tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL, -- FCM device token
  device_type VARCHAR(20) NOT NULL, -- 'ios', 'android', 'web'
  device_id VARCHAR(255), -- Unique device identifier
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, device_id) -- One token per device per user
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_push_tokens_device ON push_tokens(device_id);

-- Comments
COMMENT ON TABLE push_tokens IS 'Stores FCM push notification tokens for each user device';
COMMENT ON COLUMN push_tokens.token IS 'Firebase Cloud Messaging device token';
COMMENT ON COLUMN push_tokens.is_active IS 'False if token is invalid or user logged out';
