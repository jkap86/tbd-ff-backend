-- Rollback migration: Remove composite query indexes
-- This reverts migration 078_add_composite_query_indexes.sql

-- Drop waiver claims indexes
DROP INDEX IF EXISTS idx_waiver_claims_league_status;
DROP INDEX IF EXISTS idx_waiver_claims_pending;

-- Drop trades indexes
DROP INDEX IF EXISTS idx_trades_league_status;
DROP INDEX IF EXISTS idx_trades_pending;
