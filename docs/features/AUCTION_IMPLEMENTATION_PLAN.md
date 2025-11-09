# Auction Draft Implementation Plan

## Overview
Add auction and slow auction draft types with proxy bidding to the fantasy football platform.

## Current Status
✅ **Foundation Complete** (committed to main)
- Draft model updated with auction types ('auction', 'slow_auction')
- Auction-specific fields added to drafts table
- Migration 032 created

## Parallel Task Breakdown

### Task Dependencies
```
Task 1 (Backend Core)
    ├─> Task 2 (Sockets) [requires Task 1]
    └─> Task 3 & 4 (Frontend) [requires Task 1 & 2]

Task 5 (Draft Setup UI) [independent, can start immediately]
```

### Task 1: Database & Backend Core ⭐ START HERE
**Location:** `backend/AUCTION_TASK_1_DATABASE_BACKEND.md`
**Estimated Time:** 3-4 hours
**Complexity:** Medium-High

**Deliverables:**
- Migration 033: auction_nominations and auction_bids tables
- `src/models/Auction.ts` with interfaces and functions
- `src/controllers/auctionController.ts` with API endpoints
- Proxy bidding logic implementation
- Budget validation with optional reserve

**Key Feature:** Proxy bidding (eBay-style)
- User enters max bid ($50)
- System shows minimum needed ($1 to start)
- Auto-outbids opponents up to max
- Never reveals max bid to others

### Task 2: Real-time Socket System ⚠️ REQUIRES TASK 1
**Location:** `backend/AUCTION_TASK_2_SOCKETS.md`
**Estimated Time:** 2-3 hours
**Complexity:** Medium

**Deliverables:**
- `src/socket/auctionSocket.ts` with event handlers
- Timer management for nominations
- Auto-win logic when timer expires
- Multiple simultaneous nomination support

**Key Feature:** Timer resets
- Regular auction: seconds-based timer
- Slow auction: hours-based timer, resets on new bid

### Task 3: Regular Auction UI ⚠️ REQUIRES TASKS 1 & 2
**Location:** `flutter_app/AUCTION_TASK_3_REGULAR_AUCTION_UI.md`
**Estimated Time:** 4-5 hours
**Complexity:** Medium

**Deliverables:**
- `lib/models/auction_model.dart`
- `lib/services/auction_service.dart`
- `lib/providers/auction_provider.dart`
- `lib/screens/auction_draft_screen.dart`
- Budget display widget
- Bidding interface

**Key Feature:** Live auction
- One player at a time
- Quick bid buttons
- Real-time updates
- Budget tracking

### Task 4: Slow Auction UI ⚠️ REQUIRES TASKS 1 & 2
**Location:** `flutter_app/AUCTION_TASK_4_SLOW_AUCTION_UI.md`
**Estimated Time:** 5-6 hours
**Complexity:** Medium-High

**Deliverables:**
- `lib/screens/slow_auction_draft_screen.dart`
- Grid view with multiple nominations
- Individual timers per nomination
- Proxy bid entry dialog
- Activity feed

**Key Feature:** Multiple simultaneous players
- 20-30 players at once
- Each with own timer
- Compact card view
- Expand for details

### Task 5: Draft Setup UI ✅ CAN START IMMEDIATELY
**Location:** `flutter_app/AUCTION_TASK_5_DRAFT_SETUP.md`
**Estimated Time:** 2-3 hours
**Complexity:** Low-Medium

**Deliverables:**
- Updated `lib/screens/draft_setup_screen.dart`
- Auction type selection (4 chips)
- Auction-specific settings forms
- Navigation to correct draft screen

**Key Feature:** Commissioner settings
- Starting budget ($200 default)
- Reserve budget toggle (optional $1/slot)
- Max simultaneous nominations (slow auction)
- Timer configuration

## Recommended Execution Strategy

### Option A: Sequential (Single Developer)
1. Task 1 → Task 2 → Task 5 → Task 3 → Task 4
2. Estimated total time: 16-21 hours
3. Can test incrementally

### Option B: Parallel (Multiple Developers) ⚡ RECOMMENDED
**Phase 1:** (Can start now)
- Developer A: Task 1
- Developer B: Task 5

**Phase 2:** (After Task 1 complete)
- Developer A: Task 2
- Developer B: Task 3
- Developer C: Task 4 (in parallel with Task 3)

**Phase 3:** (Integration & Testing)
- Connect all pieces
- End-to-end testing

Estimated total time: **8-10 hours** (with 2-3 developers working in parallel)

### Option C: Using Claude Agents ⚡⚡ FASTEST
Launch 3 Sonnet agents simultaneously:
1. Agent 1: Tasks 1 & 2 (backend) - 5-7 hours
2. Agent 2: Tasks 3 & 5 (regular auction + setup) - 6-8 hours
3. Agent 3: Task 4 (slow auction) - 5-6 hours

All work in parallel, then merge. **Estimated total time: 7-8 hours wall clock**

## Testing Strategy

### Unit Tests
- [ ] Proxy bidding logic (all scenarios)
- [ ] Budget validation with/without reserve
- [ ] Timer expiry handling

### Integration Tests
- [ ] Create auction draft
- [ ] Nominate player
- [ ] Place bid (regular)
- [ ] Place bid (proxy outbid)
- [ ] Timer expires, award player
- [ ] Multiple nominations (slow auction)

### UI Tests
- [ ] Budget display updates
- [ ] Real-time bid updates
- [ ] Timer countdown
- [ ] Grid view (slow auction)
- [ ] Navigation to correct draft type

## Key Technical Decisions

### Proxy Bidding Algorithm
```
When new bid arrives:
1. Find all bids for this nomination, sorted by max_bid DESC
2. If new_bid.max_bid > current_winning_bid.max_bid:
   - New bidder becomes winner
   - Set their bid_amount = current_bid + min_bid
3. Else:
   - Current winner stays
   - Increment their bid_amount = new_bid.max_bid + min_bid
4. Mark one bid as is_winning = true, rest = false
5. Broadcast new winning bid (NOT max_bid)
```

### Budget Calculation
```
available = starting_budget
            - spent (completed purchases)
            - active_bids (sum of winning bids on active nominations)
            - reserved (if enabled: $1 × remaining_roster_slots)
```

### Timer Reset Logic (Slow Auction)
- When new bid placed: deadline = now + nomination_timer_hours
- Prevents sniping at the last second
- Ensures everyone has fair chance to respond

## Database Schema

### auction_nominations
```sql
id (PK), draft_id, player_id, nominating_roster_id,
winning_roster_id, winning_bid, status, deadline, timestamps
```

### auction_bids
```sql
id (PK), nomination_id, roster_id,
bid_amount (visible), max_bid (hidden), is_winning, timestamps
```

## API Endpoints

### Nomination
- `POST /api/drafts/:id/nominate`
- `GET /api/drafts/:id/nominations`
- `GET /api/drafts/:id/nominations/:nominationId/bids`

### Bidding
- `POST /api/drafts/:id/bid`
- `GET /api/rosters/:id/budget`

## Socket Events

### Client → Server
- `join_auction`
- `nominate_player`
- `place_bid`

### Server → Client
- `active_nominations`
- `player_nominated`
- `bid_placed`
- `player_won`
- `nomination_expired`
- `budget_updated`

## Success Criteria
- [ ] Can create auction draft with custom settings
- [ ] Proxy bidding works correctly (pays minimum, not max)
- [ ] Regular auction: one player at a time, seconds timer
- [ ] Slow auction: 20+ players at once, hours timer
- [ ] Budget reserves correctly (if enabled)
- [ ] Can't overbid available budget
- [ ] Real-time updates work smoothly
- [ ] Timer expires and awards player
- [ ] Multiple users can participate simultaneously

## Next Steps
1. Review task specifications
2. Decide on execution strategy (A, B, or C)
3. If Option C (agents): Launch agents with task files
4. Begin implementation
5. Test incrementally
6. Integrate and deploy

---

**Questions? Check the individual task files for detailed implementation instructions.**
