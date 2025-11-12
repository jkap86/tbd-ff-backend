-- Create league_payment_settings table (one-to-one with leagues)
CREATE TABLE IF NOT EXISTS league_payment_settings (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
    entry_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    payout_structure JSONB,
    payment_deadline_days INTEGER DEFAULT 7,
    reminder_days_before INTEGER DEFAULT 3,
    auto_charge_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_league_payment_settings_league ON league_payment_settings(league_id);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_league_payment_settings_updated_at ON league_payment_settings;

CREATE TRIGGER update_league_payment_settings_updated_at BEFORE
UPDATE
    ON league_payment_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create roster_payments table to track dues per roster per season
CREATE TABLE IF NOT EXISTS roster_payments (
    id SERIAL PRIMARY KEY,
    roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season VARCHAR(4) NOT NULL,
    amount_due DECIMAL(10, 2) NOT NULL,
    amount_paid DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'refunded')),
    due_date DATE,
    paid_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(roster_id, season)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_roster_payments_roster ON roster_payments(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_payments_league ON roster_payments(league_id);
CREATE INDEX IF NOT EXISTS idx_roster_payments_user ON roster_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_roster_payments_season ON roster_payments(season);
CREATE INDEX IF NOT EXISTS idx_roster_payments_status ON roster_payments(status);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_roster_payments_updated_at ON roster_payments;

CREATE TRIGGER update_roster_payments_updated_at BEFORE
UPDATE
    ON roster_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create payment_transactions table to record all payment events
CREATE TABLE IF NOT EXISTS payment_transactions (
    id SERIAL PRIMARY KEY,
    roster_payment_id INTEGER NOT NULL REFERENCES roster_payments(id) ON DELETE CASCADE,
    roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    external_transaction_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    notes TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_roster_payment ON payment_transactions(roster_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_roster ON payment_transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_league ON payment_transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_id ON payment_transactions(external_transaction_id);

-- Create league_payouts table to track winnings distribution
CREATE TABLE IF NOT EXISTS league_payouts (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season VARCHAR(4) NOT NULL,
    roster_id INTEGER REFERENCES rosters(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payout_rank INTEGER,
    payout_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    processed_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_league_payouts_league ON league_payouts(league_id);
CREATE INDEX IF NOT EXISTS idx_league_payouts_season ON league_payouts(season);
CREATE INDEX IF NOT EXISTS idx_league_payouts_roster ON league_payouts(roster_id);
CREATE INDEX IF NOT EXISTS idx_league_payouts_user ON league_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_league_payouts_status ON league_payouts(status);
CREATE INDEX IF NOT EXISTS idx_league_payouts_league_season ON league_payouts(league_id, season);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_league_payouts_updated_at ON league_payouts;

CREATE TRIGGER update_league_payouts_updated_at BEFORE
UPDATE
    ON league_payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
