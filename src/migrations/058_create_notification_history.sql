-- Create notification history table (for debugging and analytics)
CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'draft_turn', 'trade_proposed', etc.
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB, -- Additional data payload
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP DEFAULT NULL,
  clicked_at TIMESTAMP DEFAULT NULL,
  delivery_status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
  error_message TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notification_history_user ON notification_history(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_status ON notification_history(delivery_status);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at DESC);

-- Comments
COMMENT ON TABLE notification_history IS 'Log of all push notifications sent to users';
COMMENT ON COLUMN notification_history.data IS 'JSON payload with navigation data and context';
COMMENT ON COLUMN notification_history.delivery_status IS 'Status: sent, delivered, failed';
