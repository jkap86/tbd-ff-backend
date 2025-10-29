# Task 1: Database & Backend Core for Auction Drafts

## Objective
Create database tables, models, and core business logic for auction draft functionality with proxy bidding.

## Dependencies
- Already completed: Draft model updated with auction types
- Migration 032 already added auction fields to drafts table

## Sub-tasks

### 1.1 Create Database Migration (033_create_auction_tables.sql)

Create two new tables:

#### auction_nominations table:
```sql
CREATE TABLE auction_nominations (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  nominating_roster_id INTEGER NOT NULL REFERENCES rosters(roster_id) ON DELETE CASCADE,
  winning_roster_id INTEGER REFERENCES rosters(roster_id) ON DELETE CASCADE,
  winning_bid INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'passed'
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(draft_id, player_id)
);

CREATE INDEX idx_auction_nominations_draft_status ON auction_nominations(draft_id, status);
CREATE INDEX idx_auction_nominations_deadline ON auction_nominations(deadline);
```

#### auction_bids table:
```sql
CREATE TABLE auction_bids (
  id SERIAL PRIMARY KEY,
  nomination_id INTEGER NOT NULL REFERENCES auction_nominations(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(roster_id) ON DELETE CASCADE,
  bid_amount INTEGER NOT NULL,
  max_bid INTEGER NOT NULL, -- Proxy bid: hidden maximum
  is_winning BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auction_bids_nomination ON auction_bids(nomination_id);
CREATE INDEX idx_auction_bids_roster ON auction_bids(roster_id);
```

### 1.2 Create TypeScript Interfaces (src/models/Auction.ts)

```typescript
export interface AuctionNomination {
  id: number;
  draft_id: number;
  player_id: number;
  nominating_roster_id: number;
  winning_roster_id: number | null;
  winning_bid: number | null;
  status: 'active' | 'completed' | 'passed';
  deadline: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuctionBid {
  id: number;
  nomination_id: number;
  roster_id: number;
  bid_amount: number; // Current visible bid
  max_bid: number; // Hidden proxy maximum
  is_winning: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RosterBudget {
  roster_id: number;
  starting_budget: number;
  spent: number;
  active_bids: number; // Sum of winning bids for active nominations
  reserved: number; // $1 per remaining slot if reserve_budget_per_slot enabled
  available: number; // starting_budget - spent - active_bids - reserved
}
```

### 1.3 Implement Proxy Bidding Logic

Create function `processProxyBid()`:

**Rules:**
1. When new bid comes in, check if there's a higher max_bid from another roster
2. If yes, auto-increment that roster's bid_amount to (new_bid + min_bid_increment)
3. If no, new bidder becomes winning bidder at their bid_amount
4. Continue until no one has a higher max_bid
5. Never reveal max_bid to other users

**Example:**
- Player starts at $1 (min_bid)
- User A bids max $50 → shows $1, User A winning
- User B bids max $30 → shows $31, User A still winning (auto-bid)
- User C bids max $75 → shows $51, User C now winning (beat User A's max)

### 1.4 Create Model Functions (src/models/Auction.ts)

```typescript
// Nomination functions
export async function createNomination(data: {
  draft_id: number;
  player_id: number;
  nominating_roster_id: number;
  deadline?: Date;
}): Promise<AuctionNomination>;

export async function getActiveNominations(draft_id: number): Promise<AuctionNomination[]>;

export async function completeNomination(
  nomination_id: number,
  winning_roster_id: number,
  winning_bid: number
): Promise<AuctionNomination>;

// Bidding functions
export async function placeBid(data: {
  nomination_id: number;
  roster_id: number;
  max_bid: number;
}): Promise<{
  success: boolean;
  currentBid: AuctionBid;
  previousWinner?: number;
  newWinner: number;
}>;

export async function getBidsForNomination(nomination_id: number): Promise<AuctionBid[]>;

// Budget functions
export async function getRosterBudget(
  roster_id: number,
  draft_id: number
): Promise<RosterBudget>;

export async function validateBid(
  roster_id: number,
  draft_id: number,
  bid_amount: number
): Promise<{ valid: boolean; reason?: string }>;
```

### 1.5 Create Auction Controller (src/controllers/auctionController.ts)

Endpoints to create:
- `POST /api/drafts/:id/nominate` - Nominate a player
- `POST /api/drafts/:id/bid` - Place a bid (with proxy max)
- `GET /api/drafts/:id/nominations` - Get active nominations
- `GET /api/drafts/:id/nominations/:nominationId/bids` - Get bid history
- `GET /api/rosters/:id/budget` - Get roster's current budget

### 1.6 Validation Rules

Implement in `validateBid()`:
1. Check roster has enough available budget
2. If `reserve_budget_per_slot` is true, ensure $1 reserved per remaining slot
3. Bid must be >= current_bid + min_bid
4. Can't bid on own nominations (for slow auction)
5. Nomination must be active

## Testing Checklist
- [ ] Migration runs successfully
- [ ] Can create nomination
- [ ] Proxy bidding works correctly (scenarios A, B, C above)
- [ ] Budget calculations respect reserve_budget_per_slot setting
- [ ] Can't overbid budget
- [ ] Build compiles with no TypeScript errors

## Files to Create/Modify
- `src/migrations/033_create_auction_tables.sql` (new)
- `src/models/Auction.ts` (new)
- `src/controllers/auctionController.ts` (new)
- `src/routes/auctionRoutes.ts` (new)
- `src/index.ts` (add auction routes)

## Estimated Complexity
**Medium-High** - Proxy bidding logic is moderately complex but well-defined.
