-- Create trade_items table for players in trades
CREATE TABLE trade_items (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,

  -- Direction
  from_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  to_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,

  -- Player being traded
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Snapshot for history
  player_name VARCHAR(100),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trade_items_trade ON trade_items(trade_id);
CREATE INDEX idx_trade_items_player ON trade_items(player_id);
CREATE INDEX idx_trade_items_from_roster ON trade_items(from_roster_id);
CREATE INDEX idx_trade_items_to_roster ON trade_items(to_roster_id);

COMMENT ON TABLE trade_items IS 'Players included in trades';
