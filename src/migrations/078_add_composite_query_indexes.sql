-- Migration: Add composite indexes for common query patterns
-- Created: 2025-11-08
--
-- This migration adds composite indexes to optimize frequently executed queries
-- that filter by multiple columns. These indexes improve performance over using
-- multiple single-column indexes.

-- ============================================================================
-- WAIVER CLAIMS INDEXES
-- ============================================================================

-- Composite index for queries that get waiver claims by league and filter by status
-- Common query: "Get all pending waiver claims for a league"
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league_status
ON waiver_claims(league_id, status);

-- Partial index specifically for pending waiver claims (most frequently queried)
-- This is more efficient than the composite index for pending-only queries
CREATE INDEX IF NOT EXISTS idx_waiver_claims_pending
ON waiver_claims(league_id, created_at)
WHERE status = 'pending';

COMMENT ON INDEX idx_waiver_claims_league_status IS 'Optimizes queries filtering waiver claims by league and status';
COMMENT ON INDEX idx_waiver_claims_pending IS 'Partial index for pending waiver claims ordered by priority (created_at)';

-- ============================================================================
-- TRADES INDEXES
-- ============================================================================

-- Composite index for queries that get trades by league and filter by status
-- Common query: "Get all pending trades for a league"
CREATE INDEX IF NOT EXISTS idx_trades_league_status
ON trades(league_id, status);

-- Partial index specifically for pending trades (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_trades_pending
ON trades(league_id, proposed_at)
WHERE status = 'pending';

COMMENT ON INDEX idx_trades_league_status IS 'Optimizes queries filtering trades by league and status';
COMMENT ON INDEX idx_trades_pending IS 'Partial index for pending trades ordered by proposal time';

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_waiver_claims_league_status;
-- DROP INDEX IF EXISTS idx_waiver_claims_pending;
-- DROP INDEX IF EXISTS idx_trades_league_status;
-- DROP INDEX IF EXISTS idx_trades_pending;
