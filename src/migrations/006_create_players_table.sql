-- Create players table
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    player_id VARCHAR(50) UNIQUE NOT NULL, -- Sleeper player_id
    full_name VARCHAR(255) NOT NULL,
    position VARCHAR(10) NOT NULL, -- QB, RB, WR, TE, K, DEF
    team VARCHAR(10), -- NFL team abbreviation (e.g., KC, SF, BUF)
    age INTEGER,
    years_exp INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_full_name ON players(full_name);
