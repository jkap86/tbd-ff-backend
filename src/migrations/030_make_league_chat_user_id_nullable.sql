-- Make user_id nullable in league_chat_messages to support system messages
ALTER TABLE league_chat_messages
ALTER COLUMN user_id DROP NOT NULL;

-- Update the foreign key constraint to allow NULL
ALTER TABLE league_chat_messages
DROP CONSTRAINT IF EXISTS league_chat_messages_user_id_fkey;

ALTER TABLE league_chat_messages
ADD CONSTRAINT league_chat_messages_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;
