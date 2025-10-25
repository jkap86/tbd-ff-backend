-- Create draft_chat_messages table
CREATE TABLE IF NOT EXISTS draft_chat_messages (
    id SERIAL PRIMARY KEY,
    draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'chat', -- 'chat', 'system', 'pick_announcement'
    metadata JSONB DEFAULT '{}', -- Additional message data (e.g., player_id for pick announcements)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_draft_chat_draft_id ON draft_chat_messages(draft_id);
CREATE INDEX idx_draft_chat_created_at ON draft_chat_messages(draft_id, created_at);
CREATE INDEX idx_draft_chat_user_id ON draft_chat_messages(user_id);
