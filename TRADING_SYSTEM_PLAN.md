# Trading System Design Plan

## Overview
Comprehensive plan for implementing a trading system that supports:
- Player-for-player trades
- Dynasty format with future draft pick trading
- Trade proposals, acceptance, rejection, and veto system
- Commissioner controls and league voting
- Trade deadline enforcement

---

## Phase 1: Database Schema - Future Draft Picks & Trades

### 1.1 Tradeable Draft Picks Table

**Purpose:** Track future draft picks that can be traded in dynasty/keeper leagues

```sql
-- Migration: 028_create_tradeable_draft_picks_table.sql

CREATE TABLE tradeable_draft_picks (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season VARCHAR(4) NOT NULL,  -- e.g., "2025", "2026", "2027"
  round INTEGER NOT NULL,       -- 1-15 (or configured rounds)

  -- Ownership tracking
  original_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  current_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE(league_id, season, round, original_roster_id),
  CHECK (round > 0 AND round <= 15),
  CHECK (season ~ '^\d{4}$')  -- Validate year format
);

CREATE INDEX idx_tradeable_picks_league ON tradeable_draft_picks(league_id);
CREATE INDEX idx_tradeable_picks_current_owner ON tradeable_draft_picks(current_roster_id);
CREATE INDEX idx_tradeable_picks_season ON tradeable_draft_picks(season);

COMMENT ON TABLE tradeable_draft_picks IS 'Future draft picks that can be traded in dynasty/keeper leagues';
COMMENT ON COLUMN tradeable_draft_picks.original_roster_id IS 'The roster that originally owned this pick';
COMMENT ON COLUMN tradeable_draft_picks.current_roster_id IS 'The roster that currently owns this pick';
```

**Key Design Decisions:**
- `original_roster_id`: Tracks which team the pick originally belonged to (for display: "LAD 2025 1st")
- `current_roster_id`: Tracks current ownership (can change through trades)
- `season`: String year for easy comparison and display
- Unique constraint ensures one pick per season/round/original-owner per league

---

### 1.2 Trades Table

**Purpose:** Track trade proposals, their status, and metadata

```sql
-- Migration: 029_create_trades_table.sql

CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  -- Participants
  proposer_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  receiver_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending': Awaiting receiver response
  -- 'accepted': Receiver accepted, awaiting processing (if review enabled)
  -- 'processed': Trade executed successfully
  -- 'rejected': Receiver declined
  -- 'cancelled': Proposer cancelled
  -- 'vetoed': Commissioner or league vetoed
  -- 'expired': Expired without response

  -- Review settings
  review_type VARCHAR(20) DEFAULT 'none',
  -- 'none': Instant processing upon acceptance
  -- 'commissioner': Commissioner must approve
  -- 'league_vote': League members vote (configurable threshold)

  review_hours INTEGER DEFAULT 0,  -- Hours for review period (0 = instant)
  veto_votes_for INTEGER DEFAULT 0,
  veto_votes_against INTEGER DEFAULT 0,
  votes_needed INTEGER,  -- Calculated based on league settings

  -- Notes and messaging
  proposer_message TEXT,
  commissioner_notes TEXT,
  rejection_reason TEXT,

  -- Timestamps
  proposed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  processed_at TIMESTAMP,
  expires_at TIMESTAMP,  -- Auto-reject if no response by this time

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CHECK (proposer_roster_id != receiver_roster_id),
  CHECK (status IN ('pending', 'accepted', 'processed', 'rejected', 'cancelled', 'vetoed', 'expired')),
  CHECK (review_type IN ('none', 'commissioner', 'league_vote'))
);

CREATE INDEX idx_trades_league ON trades(league_id);
CREATE INDEX idx_trades_proposer ON trades(proposer_roster_id);
CREATE INDEX idx_trades_receiver ON trades(receiver_roster_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_expires ON trades(expires_at) WHERE status = 'pending';

COMMENT ON TABLE trades IS 'Trade proposals and their status';
```

---

### 1.3 Trade Items Table

**Purpose:** Track what's being traded (players and draft picks)

```sql
-- Migration: 030_create_trade_items_table.sql

CREATE TABLE trade_items (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,

  -- Direction
  from_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  to_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,

  -- Item type and reference
  item_type VARCHAR(20) NOT NULL,  -- 'player' or 'draft_pick'
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  draft_pick_id INTEGER REFERENCES tradeable_draft_picks(id) ON DELETE CASCADE,

  -- Metadata (for display/auditing)
  player_name VARCHAR(100),  -- Snapshot at trade time
  pick_description VARCHAR(50),  -- e.g., "LAD 2025 Round 1"

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CHECK (item_type IN ('player', 'draft_pick')),
  CHECK (
    (item_type = 'player' AND player_id IS NOT NULL AND draft_pick_id IS NULL) OR
    (item_type = 'draft_pick' AND draft_pick_id IS NOT NULL AND player_id IS NULL)
  )
);

CREATE INDEX idx_trade_items_trade ON trade_items(trade_id);
CREATE INDEX idx_trade_items_player ON trade_items(player_id);
CREATE INDEX idx_trade_items_pick ON trade_items(draft_pick_id);

COMMENT ON TABLE trade_items IS 'Players and draft picks included in trades';
```

**Design Notes:**
- Each trade item represents ONE thing moving from one roster to another
- For a 2-for-2 trade, you'd have 4 trade_item rows
- Snapshot player names and pick descriptions for historical accuracy (even if player renamed later)

---

### 1.4 Trade Votes Table (for league voting)

**Purpose:** Track votes when league voting on trades is enabled

```sql
-- Migration: 031_create_trade_votes_table.sql

CREATE TABLE trade_votes (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,

  vote VARCHAR(10) NOT NULL,  -- 'approve' or 'veto'
  voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE(trade_id, roster_id),  -- One vote per roster per trade
  CHECK (vote IN ('approve', 'veto'))
);

CREATE INDEX idx_trade_votes_trade ON trade_votes(trade_id);

COMMENT ON TABLE trade_votes IS 'League member votes on trades when voting is enabled';
```

---

## Phase 2: League Settings Extension

### 2.1 Add Trade Settings to League

Update `leagues.settings` JSONB to include:

```typescript
interface LeagueSettings {
  // ... existing settings ...

  // Trade settings
  trade_deadline_week?: number;  // Week number (e.g., 13), null = no deadline
  trade_review_type?: 'none' | 'commissioner' | 'league_vote';
  trade_review_hours?: number;  // Review period duration (default 24)
  trade_vote_threshold?: number;  // Percentage needed to veto (default 50)
  allow_future_pick_trading?: boolean;  // Enable draft pick trades (dynasty/keeper)
  future_seasons_tradeable?: number;  // How many years ahead (default 3)
  trade_expiry_hours?: number;  // Auto-expire proposals (default 48)
}
```

### 2.2 Initialize Future Draft Picks

**When to create:**
- When league is created (if dynasty/keeper)
- At season rollover (regenerate for next season)

**Logic:**
```typescript
async function initializeFutureDraftPicks(leagueId: number) {
  const league = await getLeague(leagueId);
  const currentYear = new Date().getFullYear();
  const futureSeasons = league.settings.future_seasons_tradeable || 3;
  const rounds = league.settings.rounds || 15;

  const rosters = await getRostersByLeague(leagueId);

  for (let year = currentYear + 1; year <= currentYear + futureSeasons; year++) {
    for (let round = 1; round <= rounds; round++) {
      for (const roster of rosters) {
        await createTradeableDraftPick({
          league_id: leagueId,
          season: year.toString(),
          round,
          original_roster_id: roster.id,
          current_roster_id: roster.id
        });
      }
    }
  }
}
```

---

## Phase 3: API Endpoints

### 3.1 Trade Proposal Endpoints

**POST /api/trades/propose**
- Create a trade proposal
- Body: `{ receiver_roster_id, player_ids_giving[], player_ids_receiving[], draft_pick_ids_giving[], draft_pick_ids_receiving[], message? }`
- Validation:
  - Proposer owns all players/picks they're giving
  - Receiver owns all players/picks they're giving
  - Not past trade deadline
  - Both rosters active in league

**GET /api/trades/:id**
- Get trade details with all items

**GET /api/leagues/:id/trades**
- Get all trades for a league
- Query params: `?status=pending&roster_id=123`

**POST /api/trades/:id/accept**
- Receiver accepts the trade
- Triggers processing (immediate or review period)

**POST /api/trades/:id/reject**
- Receiver rejects the trade
- Body: `{ reason? }`

**POST /api/trades/:id/cancel**
- Proposer cancels pending trade

**GET /api/rosters/:id/trades**
- Get all trades involving a specific roster

---

### 3.2 Trade Processing Endpoints

**POST /api/trades/:id/process** (Commissioner only if review enabled)
- Manually process an accepted trade
- Executes the trade atomically

**POST /api/trades/:id/veto** (Commissioner only)
- Veto a trade during review period
- Body: `{ reason }`

**POST /api/trades/:id/vote** (League members)
- Vote to approve or veto
- Body: `{ vote: 'approve' | 'veto' }`

---

### 3.3 Draft Pick Endpoints

**GET /api/leagues/:id/draft-picks**
- Get all tradeable draft picks for a league
- Query params: `?season=2025&roster_id=123`

**GET /api/rosters/:id/draft-picks**
- Get all draft picks owned by a roster

---

## Phase 4: Business Logic / Services

### 4.1 Trade Service (`tradeService.ts`)

```typescript
// Core trade functions

async function proposeTrade(params: {
  league_id: number;
  proposer_roster_id: number;
  receiver_roster_id: number;
  items_giving: TradeItem[];
  items_receiving: TradeItem[];
  message?: string;
}): Promise<Trade>;

async function acceptTrade(tradeId: number, acceptorRosterId: number): Promise<Trade>;

async function rejectTrade(tradeId: number, rejectReason?: string): Promise<Trade>;

async function cancelTrade(tradeId: number, proposerRosterId: number): Promise<Trade>;

async function processTrade(tradeId: number): Promise<Trade>;
// Atomically:
// 1. Transfer all players between rosters
// 2. Transfer all draft picks (update current_roster_id)
// 3. Update trade status to 'processed'
// 4. Create transaction records
// 5. Emit socket events
// 6. Update weekly lineups if affected

async function vetoTrade(tradeId: number, vetoerId: number, reason: string): Promise<Trade>;

async function voteTrade(tradeId: number, rosterId: number, vote: 'approve' | 'veto'): Promise<Trade>;
// If vote threshold met, auto-veto or auto-process

async function expirePendingTrades(): Promise<number>;
// Background job: Mark expired trades
```

### 4.2 Draft Pick Service (`draftPickService.ts`)

```typescript
async function initializeFutureDraftPicks(leagueId: number): Promise<void>;

async function getTradeablePicks(leagueId: number, rosterId?: number, season?: string): Promise<TradeableDraftPick[]>;

async function transferPickOwnership(pickId: number, newOwnerId: number): Promise<void>;

async function regeneratePicksForSeason(leagueId: number, season: string): Promise<void>;
// Called during season rollover

async function getPickDescription(pick: TradeableDraftPick): Promise<string>;
// Returns: "LAD 2025 Round 1" (team abbreviation + year + round)
```

### 4.3 Trade Validation Service

```typescript
async function validateTradeProposal(tradeData: ProposeTrade): Promise<ValidationResult>;
// Check:
// - Proposer owns all items they're giving
// - Receiver owns all items they're giving
// - Not past trade deadline
// - Players not on IR (optional rule)
// - Both rosters in same league
// - League allows pick trading (if picks involved)
// - Roster space constraints (optional)

async function checkTradeDeadline(leagueId: number): Promise<boolean>;
// Returns true if trades allowed, false if past deadline
```

---

## Phase 5: WebSocket Events

Add real-time updates for trades:

```typescript
// Socket events to implement

// Trade proposed
socket.to(`league_${leagueId}`).emit('trade_proposed', {
  trade: tradeData,
  proposer: rosterData,
  receiver: rosterData
});

// Trade accepted
socket.to(`league_${leagueId}`).emit('trade_accepted', {
  trade: tradeData,
  review_period_ends: timestamp
});

// Trade processed
socket.to(`league_${leagueId}`).emit('trade_processed', {
  trade: tradeData,
  rosters_updated: [rosterId1, rosterId2],
  players_moved: [...],
  picks_moved: [...]
});

// Trade rejected/cancelled/vetoed
socket.to(`league_${leagueId}`).emit('trade_status_changed', {
  trade: tradeData,
  old_status: 'pending',
  new_status: 'rejected'
});

// Trade vote cast
socket.to(`league_${leagueId}`).emit('trade_vote_cast', {
  trade_id: tradeId,
  votes_for: count,
  votes_against: count,
  votes_needed: threshold
});
```

---

## Phase 6: Frontend Implementation

### 6.1 Flutter Models

```dart
// lib/models/tradeable_draft_pick_model.dart
class TradeableDraftPick {
  final int id;
  final int leagueId;
  final String season;
  final int round;
  final int originalRosterId;
  final int currentRosterId;
  final String? originalRosterName;
  final String? currentRosterName;
  String get description => '$originalRosterName $season Round $round';
}

// lib/models/trade_model.dart
class Trade {
  final int id;
  final int leagueId;
  final int proposerRosterId;
  final int receiverRosterId;
  final String status;
  final List<TradeItem> itemsFromProposer;
  final List<TradeItem> itemsFromReceiver;
  final String? proposerMessage;
  final DateTime proposedAt;
  final DateTime? expiresAt;
  // ... other fields
}

// lib/models/trade_item_model.dart
class TradeItem {
  final String itemType; // 'player' or 'draft_pick'
  final int? playerId;
  final int? draftPickId;
  final String? playerName;
  final String? pickDescription;
  final Player? player;  // Populated if itemType = 'player'
  final TradeableDraftPick? draftPick;  // Populated if itemType = 'draft_pick'
}
```

### 6.2 Trade Service

```dart
// lib/services/trade_service.dart
class TradeService {
  Future<Trade?> proposeTrade({
    required int leagueId,
    required int receiverRosterId,
    required List<int> playerIdsGiving,
    required List<int> playerIdsReceiving,
    required List<int> draftPickIdsGiving,
    required List<int> draftPickIdsReceiving,
    String? message,
  });

  Future<Trade?> acceptTrade(int tradeId);
  Future<Trade?> rejectTrade(int tradeId, String? reason);
  Future<Trade?> cancelTrade(int tradeId);
  Future<List<Trade>> getLeagueTrades(int leagueId, {String? status});
  Future<List<Trade>> getRosterTrades(int rosterId);
  Future<List<TradeableDraftPick>> getRosterDraftPicks(int rosterId);
}
```

### 6.3 Trade Provider

```dart
// lib/providers/trade_provider.dart
class TradeProvider extends ChangeNotifier {
  List<Trade> _activeTrades = [];
  List<Trade> _tradeHistory = [];
  List<TradeableDraftPick> _myDraftPicks = [];

  Trade? _currentTradeProposal;

  // Socket integration
  void listenToTradeEvents(int leagueId);

  Future<void> proposeTrade(...);
  Future<void> acceptTrade(int tradeId);
  Future<void> rejectTrade(int tradeId, String? reason);
  Future<void> loadLeagueTrades(int leagueId);
  Future<void> loadMyDraftPicks(int rosterId);
}
```

### 6.4 UI Screens

**Trades Hub Screen** (`lib/screens/trades/trades_hub_screen.dart`)
- Tab 1: Active Trades (pending, under review)
- Tab 2: Trade History (processed, rejected, vetoed)
- FAB: Propose New Trade

**Propose Trade Screen** (`lib/screens/trades/propose_trade_screen.dart`)
- Select receiver roster
- Add players/picks from your team
- Add players/picks from their team
- Preview trade balance
- Add message
- Submit proposal

**Trade Detail Screen** (`lib/screens/trades/trade_detail_screen.dart`)
- Show all trade items (players + picks)
- Show status and timeline
- Accept/Reject buttons (if you're receiver)
- Cancel button (if you're proposer)
- Vote buttons (if league voting enabled)
- Commissioner actions (veto/approve if applicable)

**Draft Picks Screen** (`lib/screens/trades/my_draft_picks_screen.dart`)
- List all current draft picks owned
- Group by season
- Show original owner vs current owner
- Quick action: Propose trade with pick

---

## Phase 7: Implementation Order

### Sprint 1: Foundation (Database + Models)
1. Create migrations 028-031 (4 new tables)
2. Create TypeScript models (TradeableDraftPick, Trade, TradeItem)
3. Create basic CRUD functions
4. Write unit tests for models

### Sprint 2: Core Trade Logic
1. Implement tradeService.ts (propose, accept, reject, cancel)
2. Implement draftPickService.ts (initialize, transfer, get)
3. Implement trade validation logic
4. Write integration tests

### Sprint 3: Trade Processing & Review
1. Implement processTrade() with atomic transaction
2. Implement veto logic (commissioner + league voting)
3. Implement trade expiry background job
4. Add transaction history records

### Sprint 4: API Endpoints
1. Create tradeController.ts
2. Implement all REST endpoints
3. Add authentication/authorization checks
4. Write API tests

### Sprint 5: WebSocket Integration
1. Add trade socket events to socket server
2. Implement trade listeners
3. Test real-time updates

### Sprint 6: Frontend Foundation
1. Create Flutter models (Trade, TradeItem, TradeableDraftPick)
2. Create trade_service.dart
3. Create trade_provider.dart
4. Set up socket listeners

### Sprint 7: Frontend UI - Part 1
1. Trades Hub Screen
2. Trade Detail Screen
3. Trade item widgets (player cards, pick cards)

### Sprint 8: Frontend UI - Part 2
1. Propose Trade Screen
2. Draft Picks Screen
3. Trade builder UI components
4. Trade notifications

### Sprint 9: Polish & Testing
1. Add loading states and error handling
2. Add trade deadline warnings
3. Add confirmation dialogs
4. End-to-end testing
5. Bug fixes

---

## Phase 8: Advanced Features (Future)

### Trade Analyzer
- Calculate trade fairness using player values
- Show projected points impact
- Integrate with trade evaluation APIs

### Trade Suggestions
- AI-powered trade suggestions based on team needs
- "Fill this position" auto-trader

### Trade Block
- Players marked as "on the block"
- Browse other teams' trade blocks
- Quick propose from trade block

### Trade Notifications
- Push notifications for trade proposals
- Email summaries of league trades
- In-app notification center

### Multi-Team Trades
- Support 3+ team trades
- More complex item routing
- Requires UI redesign

---

## Key Considerations

### Dynasty Format Specifics
1. **Rookie Drafts:** Future picks are for next season's rookie draft
2. **Pick Value:** Early picks more valuable (consider trade value charts)
3. **Roster Rollover:** When season ends, carry rosters forward to next season
4. **Pick Regeneration:** Generate new future picks after each draft

### Trade Fairness
- Optional: Integrate with KeepTradeCut or similar APIs for player values
- Optional: Require "fair" trades within X% value difference
- Optional: Display trade analyzer in UI

### Performance
- Index all foreign keys
- Cache tradeable picks per roster
- Use transactions for all trade processing
- Background job for expired trades (cron every hour)

### Security
- Validate ownership at every step
- Prevent self-trading
- Rate limit trade proposals (prevent spam)
- Log all trade actions for audit trail

### Edge Cases
1. **Player dropped mid-trade:** Mark trade invalid
2. **Roster deleted mid-trade:** Cancel all pending trades
3. **League settings changed mid-review:** Apply old settings to pending trades
4. **Draft pick already used:** Validate picks are still future when processing
5. **Concurrent trades for same player:** Lock players in pending trades

---

## Database Migration Order

1. `028_create_tradeable_draft_picks_table.sql`
2. `029_create_trades_table.sql`
3. `030_create_trade_items_table.sql`
4. `031_create_trade_votes_table.sql`
5. `032_add_trade_settings_to_leagues.sql` (update function)

Total: 5 migrations

---

## Testing Strategy

### Unit Tests
- Trade validation logic
- Draft pick ownership transfer
- Trade status transitions
- Vote counting logic

### Integration Tests
- Full trade flow (propose → accept → process)
- Atomic transaction rollback on error
- WebSocket event delivery
- Background job execution

### E2E Tests
- User proposes trade via UI
- Receiver accepts via UI
- Trade processes and rosters update
- Transaction history records created

---

## Success Metrics

1. **Trade Completion Rate:** % of proposed trades that complete
2. **Trade Volume:** Trades per league per season
3. **Response Time:** Avg time from proposal to acceptance/rejection
4. **Error Rate:** Failed trade processing attempts
5. **User Engagement:** % of users who propose at least 1 trade

---

## Timeline Estimate

- **Sprint 1-2:** 2 weeks (Backend foundation)
- **Sprint 3-5:** 2 weeks (Backend completion)
- **Sprint 6-8:** 3 weeks (Frontend implementation)
- **Sprint 9:** 1 week (Polish & testing)

**Total: ~8 weeks for full trading system with dynasty support**

---

## Questions to Answer Before Implementation

1. **Trade review default:** None, commissioner, or league vote?
2. **Trade deadline:** Default to week 13? Configurable?
3. **Future seasons:** Default 3 years ahead for dynasty?
4. **Trade expiry:** Default 48 hours for proposals?
5. **Vote threshold:** Default 50% to veto?
6. **Roster limits:** Enforce roster size limits during trades?
7. **IR restrictions:** Can you trade players on IR?
8. **Taxi squad:** Can you trade taxi squad players?

---

This plan provides a complete roadmap for implementing a robust trading system with full dynasty format support, including future draft pick trading.
