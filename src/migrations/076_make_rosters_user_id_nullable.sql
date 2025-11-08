-- Make user_id nullable in rosters table to support unmanaged teams
-- This allows leagues to have placeholder rosters that haven't been claimed by users yet

ALTER TABLE rosters
ALTER COLUMN user_id DROP NOT NULL;

-- Update the foreign key constraint to allow NULL
ALTER TABLE rosters
DROP CONSTRAINT IF EXISTS rosters_user_id_fkey;

ALTER TABLE rosters
ADD CONSTRAINT rosters_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;

-- Also need to drop the unique constraint on league_id + user_id since NULL values will exist
ALTER TABLE rosters
DROP CONSTRAINT IF EXISTS unique_league_user;

-- Re-add it as a partial unique index that excludes NULL user_ids
-- This ensures one user can only have one roster per league, but multiple rosters can have NULL user_id
CREATE UNIQUE INDEX IF NOT EXISTS unique_league_user_not_null
ON rosters(league_id, user_id)
WHERE user_id IS NOT NULL;

COMMENT ON COLUMN rosters.user_id IS 'User who owns this roster. NULL for unmanaged/unclaimed rosters';
