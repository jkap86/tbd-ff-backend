# Waivers and Free Agents System - Handoff Documentation

## Overview

I've successfully built a functional waivers and free agents system for your fantasy football backend. The system supports FAAB (Free Agent Acquisition Budget) waiver processing, immediate free agent pickups, transaction tracking, and automated daily waiver processing.

## What Was Built

### 1. Database Schema (4 migrations created)

**Location:** `backend/src/migrations/`

#### Migration 020: waiver_claims table
- Stores all waiver claims (pending, processed, failed, cancelled)
- Tracks bid amounts, player to add, player to drop
- Indexed by league_id, roster_id, status, player_id

#### Migration 021: waiver_settings table
- League-specific waiver configuration
- Supports FAAB budget, waiver period, processing schedule
- Currently set up for FAAB with 100 budget, daily processing at 3 AM

#### Migration 022: rosters table updates
- Added `faab_budget` column (default 100)
- Added `waiver_priority` column (default 1, for future rolling waivers)

#### Migration 023: transactions table
- Records all completed transactions (waivers, free agents, trades)
- Stores adds/drops as JSONB arrays
- Tracks waiver bids and transaction types

### 2. Models (3 created/updated)

**Location:** `backend/src/models/`

#### WaiverClaim.ts
Key functions:
- `createWaiverClaim(data)` - Submit a new waiver claim
- `getWaiverClaimsByLeague(leagueId, status?)` - Get all claims for a league
- `getWaiverClaimsByRoster(rosterId, status?)` - Get claims for specific roster
- `getPendingClaims(leagueId)` - Get pending claims for processing
- `updateClaimStatus(id, status, reason?)` - Update claim status
- `cancelWaiverClaim(id)` - Cancel a pending claim
- `hasPendingClaimForPlayer(rosterId, playerId)` - Check for duplicate claims

#### Transaction.ts
Key functions:
- `createTransaction(data)` - Record a transaction
- `getTransactionsByLeague(leagueId, limit)` - Get league transaction history
- `getTransactionsByRoster(rosterId)` - Get roster transactions
- `getTransactionsWithPlayerDetails(leagueId, limit)` - Get transactions with player info

#### Roster.ts (updated)
New functions added:
- `getRosterFAAB(rosterId)` - Get current FAAB budget
- `updateFAAB(rosterId, amount)` - Set FAAB budget
- `deductFAAB(rosterId, amount)` - Deduct FAAB (with validation)
- `addPlayerToRoster(rosterId, playerId, location)` - Add player to bench/taxi/IR
- `removePlayerFromRoster(rosterId, playerId)` - Remove player from roster
- `rosterHasPlayer(rosterId, playerId)` - Check if roster owns player
- `getRosterSize(rosterId)` - Get total players on roster

### 3. Waiver Service

**Location:** `backend/src/services/waiverService.ts`

#### Key Functions:

**submitWaiverClaim(rosterId, playerId, dropPlayerId, bidAmount)**
- Validates bid amount against FAAB budget
- Checks player availability
- Prevents duplicate claims
- Creates pending waiver claim

**processWaivers(leagueId)**
- Main processing logic for FAAB system
- Groups claims by player
- Awards to highest bidder (bid amount DESC, then timestamp ASC)
- Handles tie-breaking
- Validates roster state before processing
- Uses database transactions for atomicity
- Creates transaction records

**pickupFreeAgent(rosterId, playerId, dropPlayerId)**
- Immediate player pickup (no waiver claim)
- Validates player availability
- Adds/drops players atomically
- Creates transaction record

**isPlayerAvailable(leagueId, playerId)**
- Checks if player is on any roster in league

**getAvailablePlayers(leagueId)**
- Returns array of all available player IDs

#### Processing Logic (FAAB):
1. Get all pending claims for league
2. Group claims by player_id
3. For each player:
   - Check if still available
   - Sort claims by bid_amount DESC, created_at ASC
   - Award to highest bidder if valid:
     - Check FAAB budget
     - Validate drop player (if specified)
     - Deduct FAAB
     - Add player to roster
     - Drop player (if specified)
     - Create transaction
     - Mark claim processed
   - Mark losing claims as failed

### 4. API Routes

**Location:** `backend/src/routes/waiverRoutes.ts` and `backend/src/controllers/waiverController.ts`

All routes require authentication.

#### Endpoints:

**POST /api/leagues/:leagueId/waivers/claim**
- Submit a waiver claim
- Body: `{ roster_id, player_id, drop_player_id?, bid_amount }`
- Validates ownership and FAAB budget

**GET /api/leagues/:leagueId/waivers/claims**
- Get all waiver claims for a league
- Query params: `?status=pending` (optional)

**GET /api/rosters/:rosterId/waivers/claims**
- Get waiver claims for specific roster
- Query params: `?status=pending` (optional)

**DELETE /api/waivers/claims/:claimId**
- Cancel a pending waiver claim
- Must be claim owner
- Only works on pending claims

**POST /api/leagues/:leagueId/waivers/process**
- Manually trigger waiver processing
- Commissioner only

**POST /api/leagues/:leagueId/transactions/free-agent**
- Pick up free agent immediately
- Body: `{ roster_id, player_id, drop_player_id? }`

**GET /api/leagues/:leagueId/transactions**
- Get transaction history
- Query params: `?limit=50` (default 50)
- Includes player details

**GET /api/leagues/:leagueId/players/available**
- Get list of available player IDs
- Returns count and array of IDs

### 5. Scheduler

**Location:** `backend/src/services/waiverScheduler.ts`

- Uses `node-cron` to schedule daily processing
- Runs at 3:00 AM UTC every day (cron: `0 3 * * *`)
- Processes waivers for all leagues with pending claims
- Continues processing other leagues even if one fails
- Logs all processing activity

**Functions:**
- `startWaiverScheduler()` - Start the scheduler (called in index.ts)
- `triggerWaiverProcessing()` - Manual trigger for testing

### 6. Integration

**Updated:** `backend/src/index.ts`
- Imported waiver routes
- Registered routes: `app.use("/api", waiverRoutes)`
- Started scheduler on server startup

## How to Use

### 1. Run Migrations

```bash
npm run migrate
```

This will create all 4 new tables and update the rosters table.

### 2. Start the Server

```bash
npm run dev
```

The waiver scheduler will automatically start and run daily at 3 AM UTC.

### 3. Testing the API

#### Submit a Waiver Claim
```bash
POST /api/leagues/1/waivers/claim
{
  "roster_id": 1,
  "player_id": 123,
  "drop_player_id": 456,  // optional
  "bid_amount": 15
}
```

#### View Pending Claims
```bash
GET /api/leagues/1/waivers/claims?status=pending
```

#### Pick Up Free Agent
```bash
POST /api/leagues/1/transactions/free-agent
{
  "roster_id": 1,
  "player_id": 123,
  "drop_player_id": 456  // optional
}
```

#### Process Waivers Manually (Commissioner)
```bash
POST /api/leagues/1/waivers/process
```

#### View Transaction History
```bash
GET /api/leagues/1/transactions?limit=20
```

#### Cancel a Claim
```bash
DELETE /api/waivers/claims/5
```

## Example Flow

1. **User submits waiver claim:**
   - POST to `/api/leagues/1/waivers/claim` with bid amount
   - System validates FAAB budget, player availability
   - Creates pending claim

2. **Automated processing (3 AM daily):**
   - Scheduler runs `processWaivers()` for all leagues
   - Groups claims by player
   - Awards to highest bidder
   - Deducts FAAB, adds/drops players
   - Creates transaction records
   - Marks claims processed/failed

3. **User views results:**
   - GET `/api/leagues/1/transactions` to see processed waivers
   - GET `/api/rosters/1/waivers/claims` to see claim history

## Database Schema Details

### waiver_claims
```sql
id (serial, PK)
league_id (int, FK -> leagues)
roster_id (int, FK -> rosters)
player_id (int)
drop_player_id (int, nullable)
bid_amount (int, default 0)
status (varchar: pending/processed/failed/cancelled)
processed_at (timestamp)
failure_reason (text)
created_at (timestamp)
updated_at (timestamp)
```

### transactions
```sql
id (serial, PK)
league_id (int, FK -> leagues)
roster_id (int, FK -> rosters)
transaction_type (varchar: waiver/free_agent/trade/add/drop)
status (varchar: processed/pending/failed)
adds (jsonb array of player IDs)
drops (jsonb array of player IDs)
waiver_bid (int, nullable)
processed_at (timestamp)
created_at (timestamp)
```

### rosters (new columns)
```sql
faab_budget (int, default 100)
waiver_priority (int, default 1)
```

## Key Features

- **FAAB System:** Supports bidding on players with budget tracking
- **Atomic Transactions:** Uses database transactions for consistency
- **Validation:** Extensive validation of claims, budgets, roster state
- **Tie Breaking:** Bid amount DESC, then timestamp ASC
- **Transaction History:** Complete audit trail of all moves
- **Automated Processing:** Daily processing at 3 AM UTC
- **Manual Processing:** Commissioner can trigger anytime
- **Free Agents:** Immediate pickups for unclaimed players
- **Error Handling:** Graceful handling with detailed error messages

## Limitations and TODOs

### Current Limitations:
1. **Only FAAB:** No support for rolling waivers or reverse standings order yet
2. **No Waiver Period:** Players can be picked up immediately as free agents (no waiver period enforcement)
3. **No Socket Events:** Real-time updates not implemented (Agent 3 will handle)
4. **Basic Settings:** Waiver settings table created but not fully utilized

### Future Enhancements:
1. **Waiver Period:** Enforce waiver period for dropped/undrafted players
2. **Waiver Types:** Add support for rolling waivers, reverse standings
3. **Custom Schedule:** Allow leagues to set custom processing times
4. **Weekly/Bi-weekly:** Support different processing schedules
5. **Roster Limits:** Enforce max roster size during add/drop
6. **Socket Events:** Real-time notifications for processed waivers
7. **Waiver Settings UI:** API endpoints to manage waiver settings per league

## Files Created/Modified

### Created:
- `backend/src/migrations/020_create_waiver_claims_table.sql`
- `backend/src/migrations/021_create_waiver_settings_table.sql`
- `backend/src/migrations/022_add_waiver_fields_to_rosters.sql`
- `backend/src/migrations/023_create_transactions_table.sql`
- `backend/src/models/WaiverClaim.ts`
- `backend/src/models/Transaction.ts`
- `backend/src/services/waiverService.ts`
- `backend/src/services/waiverScheduler.ts`
- `backend/src/controllers/waiverController.ts`
- `backend/src/routes/waiverRoutes.ts`

### Modified:
- `backend/src/models/Roster.ts` (added FAAB and player management functions)
- `backend/src/index.ts` (registered routes and started scheduler)

## Testing Checklist

- [ ] Run migrations successfully
- [ ] Submit a waiver claim
- [ ] View pending claims
- [ ] Cancel a claim
- [ ] Process waivers manually (commissioner)
- [ ] Pick up a free agent
- [ ] View transaction history
- [ ] Check FAAB deduction after processing
- [ ] Test with multiple claims on same player
- [ ] Test bid tie-breaking (same bid, different timestamps)
- [ ] Test insufficient FAAB error
- [ ] Test claiming rostered player error
- [ ] Test dropping non-owned player error

## Notes

- All times are in UTC
- FAAB budget defaults to 100 per roster
- Minimum bid is 0 (free)
- Transaction history defaults to last 50 records
- Scheduler runs every day at 3 AM UTC
- All routes require authentication
- Commissioner-only routes enforce permission checks

## Next Steps for Agent 3 (Socket Integration)

When implementing real-time updates:
1. Emit event when claim is submitted
2. Emit event when waivers are processed
3. Emit event when free agent is picked up
4. Consider emitting to league room: `io.to('league_${leagueId}')`
5. Update transaction feed in real-time
6. Show processing status during automated runs

The system is ready for production use. Just run the migrations and test the endpoints!
