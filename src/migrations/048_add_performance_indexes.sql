-- Migration: Add performance indexes for auction and draft queries
-- Created: 2025-10-31

-- Index for auction nominations by player (frequently queried)
CREATE INDEX IF NOT EXISTS idx_auction_nominations_player_id
ON auction_nominations(player_id);

-- Index for auction nominations by status (for filtering active/completed)
CREATE INDEX IF NOT EXISTS idx_auction_nominations_status
ON auction_nominations(status);

-- Composite index for common auction queries
CREATE INDEX IF NOT EXISTS idx_auction_nominations_draft_status
ON auction_nominations(draft_id, status);

-- Index for auction bids by roster (for budget calculations)
CREATE INDEX IF NOT EXISTS idx_auction_bids_roster_id
ON auction_bids(roster_id);

-- Index for auction bids by nomination
CREATE INDEX IF NOT EXISTS idx_auction_bids_nomination_id
ON auction_bids(nomination_id);

-- Composite index for winning bid queries
CREATE INDEX IF NOT EXISTS idx_auction_bids_nomination_winning
ON auction_bids(nomination_id, is_winning);

-- Index for draft picks by draft (for loading draft board)
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_id
ON draft_picks(draft_id);

-- Index for draft picks by roster (for loading team picks)
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster_id
ON draft_picks(roster_id);

-- Composite index for pick order queries
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_pick_number
ON draft_picks(draft_id, pick_number);

-- Index for draft order by draft
CREATE INDEX IF NOT EXISTS idx_draft_order_draft_id
ON draft_order(draft_id);

-- Index for rosters by league (frequently joined)
CREATE INDEX IF NOT EXISTS idx_rosters_league_id
ON rosters(league_id);

-- Index for rosters by user (for user's teams)
CREATE INDEX IF NOT EXISTS idx_rosters_user_id
ON rosters(user_id);

-- Index for drafts by league
CREATE INDEX IF NOT EXISTS idx_drafts_league_id
ON drafts(league_id);

-- Index for drafts by status
CREATE INDEX IF NOT EXISTS idx_drafts_status
ON drafts(status);

-- Partial index for active drafts (most queried)
CREATE INDEX IF NOT EXISTS idx_drafts_active
ON drafts(id) WHERE status = 'in_progress';

COMMENT ON INDEX idx_auction_nominations_player_id IS 'Performance index for player nomination lookups';
COMMENT ON INDEX idx_auction_bids_nomination_winning IS 'Optimizes winning bid queries in budget calculations';
COMMENT ON INDEX idx_drafts_active IS 'Partial index for active draft queries';
