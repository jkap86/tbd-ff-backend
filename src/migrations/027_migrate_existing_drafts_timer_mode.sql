-- Migrate existing drafts to explicitly set timer_mode to 'traditional'
-- This ensures backward compatibility with drafts created before chess timer feature

-- Update all existing drafts to use traditional timer mode
-- (New drafts will default to 'traditional' via column default, but this ensures consistency)
UPDATE drafts
SET timer_mode = 'traditional'
WHERE timer_mode IS NULL OR timer_mode = '';

-- Initialize time tracking fields for existing draft_order records
-- Set to NULL for traditional mode (not used), or 0 for time_used
UPDATE draft_order
SET time_used_seconds = 0
WHERE time_used_seconds IS NULL;

-- Note: time_remaining_seconds stays NULL for traditional mode drafts
-- It will only be set when a draft is created with chess mode
