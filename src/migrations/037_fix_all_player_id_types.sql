-- Migration 037: Fix player_id type in all tables
-- Changes player_id from INTEGER to VARCHAR(50) to match players.player_id
-- Also drops incorrect foreign key constraints that reference players(id) instead of players(player_id)

-- Fix player_stats table
ALTER TABLE player_stats
  DROP CONSTRAINT IF EXISTS player_stats_player_id_fkey;

ALTER TABLE player_stats
  ALTER COLUMN player_id TYPE VARCHAR(50);

-- Fix waiver_claims table
ALTER TABLE waiver_claims
  ALTER COLUMN player_id TYPE VARCHAR(50);

ALTER TABLE waiver_claims
  ALTER COLUMN drop_player_id TYPE VARCHAR(50);

-- Fix trade_items table
ALTER TABLE trade_items
  DROP CONSTRAINT IF EXISTS trade_items_player_id_fkey;

ALTER TABLE trade_items
  ALTER COLUMN player_id TYPE VARCHAR(50);
