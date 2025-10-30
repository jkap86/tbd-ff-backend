-- Migration 035: Fix player_id type in auction_nominations
-- Changes player_id from INTEGER to VARCHAR(50) to match players table

ALTER TABLE auction_nominations
  ALTER COLUMN player_id TYPE VARCHAR(50);
