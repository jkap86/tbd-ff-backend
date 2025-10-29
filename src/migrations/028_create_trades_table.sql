-- Create trades table for trade proposals
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  -- Participants
  proposer_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  receiver_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending': Awaiting receiver response
  -- 'accepted': Receiver accepted and processed
  -- 'rejected': Receiver declined
  -- 'cancelled': Proposer cancelled

  -- Optional message
  proposer_message TEXT,
  rejection_reason TEXT,

  -- Timestamps
  proposed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  processed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CHECK (proposer_roster_id != receiver_roster_id),
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'))
);

CREATE INDEX idx_trades_league ON trades(league_id);
CREATE INDEX idx_trades_proposer ON trades(proposer_roster_id);
CREATE INDEX idx_trades_receiver ON trades(receiver_roster_id);
CREATE INDEX idx_trades_status ON trades(status);

COMMENT ON TABLE trades IS 'Trade proposals between rosters';
