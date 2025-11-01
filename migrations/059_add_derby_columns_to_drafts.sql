-- Add derby-related columns to drafts table
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS derby_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS derby_time_limit_seconds INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS derby_timeout_behavior VARCHAR(10) DEFAULT 'auto' CHECK (derby_timeout_behavior IN ('auto', 'skip'));

-- Add index for derby drafts
CREATE INDEX IF NOT EXISTS idx_drafts_derby ON drafts(derby_enabled) WHERE derby_enabled = true;