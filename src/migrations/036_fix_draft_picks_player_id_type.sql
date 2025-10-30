-- Migration 036: Fix player_id type in draft_picks
-- Changes player_id from INTEGER to VARCHAR(50) to match players table
-- Also drops the incorrect foreign key constraint (it was referencing players(id) instead of players(player_id))

-- Drop the incorrect foreign key constraint
ALTER TABLE draft_picks
  DROP CONSTRAINT IF EXISTS draft_picks_player_id_fkey;

-- Change player_id type to VARCHAR(50)
ALTER TABLE draft_picks
  ALTER COLUMN player_id TYPE VARCHAR(50);
