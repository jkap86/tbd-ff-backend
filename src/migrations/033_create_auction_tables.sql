-- Migration 033: Create auction tables
-- Creates tables for auction draft nominations and bids with proxy bidding support

CREATE TABLE IF NOT EXISTS auction_nominations (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  nominating_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  winning_roster_id INTEGER REFERENCES rosters(id) ON DELETE CASCADE,
  winning_bid INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'passed'
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(draft_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft_status ON auction_nominations(draft_id, status);
CREATE INDEX IF NOT EXISTS idx_auction_nominations_deadline ON auction_nominations(deadline);

CREATE TABLE IF NOT EXISTS auction_bids (
  id SERIAL PRIMARY KEY,
  nomination_id INTEGER NOT NULL REFERENCES auction_nominations(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  bid_amount INTEGER NOT NULL,
  max_bid INTEGER NOT NULL, -- Proxy bid: hidden maximum
  is_winning BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auction_bids_nomination ON auction_bids(nomination_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_roster ON auction_bids(roster_id);
