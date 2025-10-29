-- Create waiver_settings table
CREATE TABLE IF NOT EXISTS waiver_settings (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
    waiver_type VARCHAR(20) DEFAULT 'faab',
    faab_budget INTEGER DEFAULT 100,
    waiver_period_days INTEGER DEFAULT 2,
    process_schedule VARCHAR(20) DEFAULT 'daily',
    process_time TIME DEFAULT '03:00:00',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_waiver_settings_league ON waiver_settings(league_id);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_waiver_settings_updated_at ON waiver_settings;

CREATE TRIGGER update_waiver_settings_updated_at BEFORE
UPDATE
    ON waiver_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
