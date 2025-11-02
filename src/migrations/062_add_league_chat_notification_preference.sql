-- Add league chat notification preference
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS league_chat_messages BOOLEAN DEFAULT TRUE;

-- Add comment
COMMENT ON COLUMN notification_preferences.league_chat_messages IS 'Notify when new messages are posted in league chat';
