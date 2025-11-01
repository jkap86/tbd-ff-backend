# System Truths & Invariants

This document contains all system invariants, rules, and constraints that **must never be violated** in the TBD Fantasy Football application. These truths ensure data integrity, security, and correct business logic.

> **For AI Agents & Developers:** Before making changes, verify they don't violate any of these truths.

---

## Table of Contents
1. [Database Rules & Schema Constraints](#1-database-rules--schema-constraints)
2. [API Design Patterns](#2-api-design-patterns)
3. [Business Logic Invariants](#3-business-logic-invariants)
4. [Data Types & Formats](#4-data-types--formats)
5. [Security Rules](#5-security-rules)
6. [Performance Constraints](#6-performance-constraints)
7. [State Machine Rules](#7-state-machine-rules)
8. [Critical Invariants Summary](#8-critical-invariants-summary)

---

## 1. Database Rules & Schema Constraints

### Primary Key & Foreign Key Constraints

#### All Tables Use SERIAL PRIMARY KEY
- Auto-incrementing integer IDs
- Never manually set primary keys

#### CASCADE DELETE Rules

**Deleting a league cascades to:**
- rosters
- drafts
- matchups
- waiver_claims
- transactions
- trades
- league_invites
- playoff_settings
- waiver_settings
- league_median_settings

**Deleting a user cascades to:**
- rosters
- league_invites
- draft_chat_messages
- league_chat_messages
- push_tokens
- notification_preferences

**Deleting a roster cascades to:**
- draft_picks
- waiver_claims
- transactions
- trade_items
- keeper_selections
- season_history
- auction_bids

**Deleting a draft cascades to:**
- draft_order
- draft_picks
- draft_chat_messages
- auction_nominations
- draft_derby
- draft_audit_log

**Deleting a trade cascades to:**
- trade_items

**Deleting a player cascades to:**
- player_stats
- keeper_selections
- adp_tracking

#### SET NULL on Delete

**Preserves History:**
- `draft_picks.player_id` - keeps draft history even if player deleted
- `matchups.roster2_id` - allows bye weeks (no opponent)
- `draft_audit_log.roster_id, user_id` - preserves audit trail
- `draft_pick_trades.original_roster_id` - preserves trade history

### Unique Constraints

| Table | Unique Constraint | Reason |
|-------|------------------|---------|
| `users` | `username` | Global uniqueness |
| `users` | `email` | Global uniqueness |
| `leagues` | `invite_code` | 6-char code, globally unique |
| `rosters` | `(league_id, user_id)` | One roster per user per league |
| `rosters` | `(league_id, roster_id)` | roster_id unique within league |
| `drafts` | `league_id` | One draft per league maximum |
| `draft_order` | `(draft_id, roster_id)` | Each roster appears once |
| `draft_order` | `(draft_id, draft_position)` | Each position unique |
| `draft_picks` | `(draft_id, pick_number)` | Sequential, unique picks |
| `draft_picks` | `(draft_id, player_id)` | Player drafted once per draft |
| `auction_nominations` | `(draft_id, player_id)` | Player nominated once |
| `player_stats` | `(player_id, week, season, season_type)` | One stat line per player per week |
| `weekly_lineups` | `(roster_id, week, season)` | One lineup per roster per week |
| `waiver_settings` | `league_id` | One settings record per league |
| `playoff_settings` | `league_id` | One settings record per league |
| `league_median_settings` | `league_id` | One settings record per league |
| `league_invites` | `(league_id, invited_user_id)` | Can't invite same user twice |
| `matchups` | `(league_id, week, roster1_id)` | roster1 appears once per week |
| `push_tokens` | `(user_id, device_id)` | One token per device per user |
| `season_history` | `(roster_id, season)` | One record per roster per season |
| `keeper_selections` | `(roster_id, player_id, season)` | Can't keep same player twice |
| `draft_derby` | `draft_id` | One derby per draft |
| `draft_derby_selections` | `(derby_id, roster_id)` | Each roster selects once |
| `draft_derby_selections` | `(derby_id, draft_position)` | Each position selected once |
| `adp_tracking` | `(player_id, season, draft_type, league_size)` | ADP tracking granularity |
| `notification_preferences` | `user_id` | One preference set per user |

### Check Constraints

#### Trades
```sql
proposer_roster_id != receiver_roster_id  -- Can't trade with yourself
status IN ('pending', 'accepted', 'rejected', 'cancelled')
```

#### Draft (Chess Timer)
```sql
-- If timer_mode = 'chess', team_time_budget_seconds must be > 0
timer_mode != 'chess' OR team_time_budget_seconds > 0
```

#### Playoff Settings
```sql
playoff_teams IN (4, 6, 8, 10, 12)
matchup_duration IN (1, 2)
playoff_week_start < championship_week
```

#### Matchups
```sql
playoff_round IN ('wildcard', 'quarterfinal', 'semifinal', 'final', 'third_place') OR NULL
roster1_seed >= 1 OR NULL
roster2_seed >= 1 OR NULL
```

#### League Median
```sql
median_matchup_week_start >= 1 AND <= 18 OR NULL
median_matchup_week_end >= median_matchup_week_start OR NULL
```

#### Trade Notification Settings
```sql
trade_notification_setting IN ('always_off', 'always_on', 'proposer_choice')
trade_details_setting IN ('always_off', 'always_on', 'proposer_choice')
```

#### Draft Derby
```sql
status IN ('pending', 'in_progress', 'completed')
derby_timeout_behavior IN ('auto', 'skip')
```

#### Draft Pick Trades
```sql
round >= 1 AND round <= 20
from_roster_id != to_roster_id
```

---

## 2. API Design Patterns

### Authentication Requirements

#### Public Endpoints (No Auth Required)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/request-reset`
- `POST /api/auth/reset-password`
- `GET /api/health`

#### All Other Routes Require Authentication
- JWT token in Authorization header OR HTTP-only cookie
- Token contains: `userId`, `username`, `email`, `isAdmin`
- Token expiration enforced

### Authorization Patterns

| Role | Required For | Middleware |
|------|-------------|------------|
| **System Admin** (`is_admin = true`) | Data sync, bulk operations, recalculations | `requireAdmin` |
| **League Commissioner** (`settings.commissioner_id`) | League settings, draft management, force roster changes, trade approvals | `requireCommissioner` |
| **League Member** (has roster in league) | Viewing league data, chat, matchups | `requireLeagueMember` |
| **Roster Owner** (`roster.user_id`) | Lineup changes, waiver claims, trade proposals | `requireRosterOwnership` |
| **Trade Participant** (proposer or receiver) | Accepting/rejecting trades | `requireTradeParticipant` |
| **Commissioner OR Roster Owner** | Special hybrid permissions | `requireCommissionerOrRosterOwner` |

#### Critical Authorization Facts
- **Commissioner ID stored in:** `league.settings.commissioner_id` (JSONB field)
- **Commissioner transfer** requires current commissioner authentication
- **User ID extracted from JWT:** `req.user.userId`
- **Database lookups verify ownership** before all mutations

### Rate Limiting Rules

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Global API | 100 requests | 1 minute |
| Authentication | 5 requests | 15 minutes |
| Password Reset | 3 requests | 1 hour |
| Public Data | 30 requests | 1 minute |
| Search | 20 requests | 1 minute |
| Bulk Operations | 5 requests | 5 minutes |
| Smart Projections | Bypasses if cached, else limited | 5 minutes |

#### Smart Projections Rate Limiter
- **Cache hit:** Instant response, no rate limit
- **Cache miss:** Rate limited (expensive Sleeper API call)

### Caching Strategies

#### Projections Cache
- **Key format:** `season_projections_{season}_{season_type}`
- **Index key:** `{cacheKey}_index` (for O(1) lookups)
- **TTL:** 30 minutes (1800 seconds)
- **Indexed by:** `player_id`
- **Preloaded on:** Server startup + every 15 minutes (cron)

#### Stats Cache
- **Key format:** `season_stats_{season}_{season_type}`
- **Index key:** `{cacheKey}_index`
- **TTL:** 5 minutes (300 seconds)
- **Preloaded on:** Server startup + every 5 minutes (cron)

#### Week Range Aggregates Cache
- **Full season:** `week_range_aggregated_{season}_1_18_{season_type}`
- **Remaining weeks:** `week_range_aggregated_{season}_{currentWeek}_18_{season_type}`
- **Preloaded on:** Server startup + every 15 minutes
- **Contains:** All player aggregates for specified week range

#### Cache Bypass Rules
- **User data:** Always fresh (no cache)
- **League data:** Always fresh (no cache)
- **Live scores:** Always fresh (no cache)
- **Projections/Stats:** Cached with TTL

---

## 3. Business Logic Invariants

### Draft Rules

#### Draft Status State Machine
```
not_started → in_progress → paused ↔ in_progress
                  ↓
              completing → completed
                  ↑
            (last pick made)

resetDraft() → not_started (from any state)
```

**Valid Statuses:** `not_started`, `in_progress`, `paused`, `completing`, `completed`

**Transition Rules:**
- `not_started → in_progress`: `startDraft()` (requires draft order exists)
- `in_progress → paused`: `pauseDraft()`
- `paused → in_progress`: `resumeDraft()`
- `in_progress → completing`: Automatic when last pick made
- `completing → completed`: `completeDraft()` (assigns players to rosters)
- `Any → not_started`: `resetDraft()` (clears all picks and derby)

**Critical Invariants:**
- ✅ **Draft can only start if draft order exists**
- ✅ **Draft completion is idempotent** (safe to call multiple times)
- ✅ **One draft per league** (UNIQUE constraint on `league_id`)
- ✅ **Cannot pick if status != 'in_progress'**

#### Draft Types

| Type | Description | Pick Order |
|------|-------------|-----------|
| `snake` | Serpentine draft | Reverses every round (except round 3 if `third_round_reversal = true`) |
| `linear` | Straight draft | Same order every round |
| `auction` | Real-time auction | Budget-based bidding |
| `slow_auction` | Async auction | Nomination timers, multiple active nominations |

#### Draft Pick Rules
- ✅ **Pick numbers are sequential:** 1, 2, 3, ... (no gaps)
- ✅ **Each player drafted once per draft** (UNIQUE constraint)
- ✅ **Each pick has unique pick_number** (UNIQUE constraint)
- ✅ **Player assignment to rosters happens AFTER draft completion**
- ✅ **Auto-pick triggers when timer expires** (if enabled)
- ✅ **Picks can be traded** (`traded_to_roster_id` references future owner)

#### Timer Modes

| Mode | Description | Requirements |
|------|-------------|-------------|
| `traditional` | Fixed time per pick | `pick_time_seconds` set |
| `chess` | Total team time budget | `team_time_budget_seconds > 0` (CHECK constraint) |

**Chess Timer Invariant:**
```sql
timer_mode != 'chess' OR team_time_budget_seconds > 0
```

#### Draft Derby Rules

**Status Flow:** `pending → in_progress → completed`

**Selection Process:**
1. Selection order randomized on creation
2. Each roster selects draft position once (UNIQUE)
3. Each draft position selected once (UNIQUE)
4. Timeout behavior configurable:
   - `auto`: Random position assigned automatically
   - `skip`: Roster moved to end of queue (`skipped_roster_ids[]`)
5. Skipped rosters get priority when their turn comes again

**Derby Invariants:**
- ✅ **One derby per draft** (UNIQUE constraint on `draft_id`)
- ✅ **Cannot enable derby for auction drafts**
- ✅ **Derby defaults to disabled** (opt-in feature)
- ✅ **Derby selections are immutable** (no changes after selection)

#### Auto-Population of Rosters

**After draft/auction completion:**
1. **Starters filled first** (prioritize exact position matches, then FLEX)
2. **BN slots exist in starters array** (slot starts with 'BN')
3. **Bench array for overflow** (players beyond BN slots)
4. **Weekly lineups populated** (from `start_week` to `playoff_week_start - 1`)
5. **Process is idempotent** (checks if already assigned)

### Auction Rules

#### Nomination Rules
- ✅ **Each player nominated once per auction** (UNIQUE constraint)
- ✅ **Nomination statuses:** `active → completed | passed`
- ✅ **Nominating team places opening bid** (at `min_bid` automatically)
- ✅ **Deadline enforced** (`nomination_timer_hours` for slow auctions)
- ✅ **Multiple active nominations allowed** (slow auction only)

#### Bidding Rules

**Proxy Bidding (Slow Auction):**
- Users submit `max_bid` (hidden from others)
- System calculates `bid_amount` (visible) = 2nd highest `max_bid` + increment
- Winner pays minimum needed to beat 2nd place

**Direct Bidding (Regular Auction):**
- `bid_amount = max_bid` (no proxy)
- Highest bid wins immediately

**Budget Validation:**
```javascript
available = starting_budget - spent - active_bids - reserved

where:
  spent = sum of completed wins
  active_bids = sum of current winning bids
  reserved = (roster_size - current_players) * 1  // if reserve_budget_per_slot enabled

// MUST have: available >= bid_amount
```

**Bid Requirements:**
- ✅ **New bid >= current_high_bid + bid_increment**
- ✅ **Minimum bid:** `max(min_bid, 1)` (never less than $1)
- ✅ **Cannot bid if roster full** (`player_count >= rounds`)
- ✅ **Cannot bid if insufficient budget**

#### Auction Completion

**Complete when:**
- ALL active nominations closed AND
- (All rosters full OR all teams out of budget)

**Critical:** Must check no active nominations first

### Waiver Rules

#### Waiver Types

| Type | Description | Processing |
|------|-------------|-----------|
| `faab` | Free Agent Acquisition Budget | Highest bid wins |
| `rolling` | Rolling waivers | Position-based priority |
| `none` | First-come first-served | No waiver period |

#### FAAB Waiver Rules
- ✅ **Default budget:** 100 per roster
- ✅ **Bid must be <= roster.faab_budget**
- ✅ **Bid cannot be negative**
- ✅ **Processing order:** Highest bid first, then earliest claim time (tiebreaker)

**Failed Claim Reasons:**
- Insufficient FAAB
- Player not available (already claimed)
- Drop player not on roster
- Roster doesn't exist

#### Waiver Processing

**Transaction Isolation:** `SERIALIZABLE`

**Atomic Processing:**
1. Lock league (`SELECT FOR UPDATE`)
2. Lock claims (`FOR UPDATE OF wc`)
3. Track claimed players in Set (prevent duplicates)
4. Process claims in order:
   - Validate player available
   - Validate sufficient FAAB
   - Deduct FAAB on success
   - Create transaction record
   - Update claim status

**Claim Statuses:** `pending → processed | failed | cancelled`

#### Free Agent Pickup
- **No waiver needed** (immediate)
- **Validates:** Player available, roster doesn't have player, drop player on roster
- **Creates transaction** with type `'free_agent'`

### Trade Rules

#### Trade Proposal Validation
- ✅ **Both rosters in same league**
- ✅ **Cannot trade with yourself** (CHECK constraint)
- ✅ **Proposer owns all players they're giving**
- ✅ **Receiver owns all players they're receiving**
- ✅ **Trade items created for each player** (with `from_roster_id`/`to_roster_id`)

#### Trade Status State Machine
```
pending → accepted | rejected | cancelled
```

**Authorization:**
- **Accept/Reject:** Receiver only
- **Cancel:** Proposer only
- **Process:** Only when `status = 'pending'`

#### Trade Processing

**Transaction Isolation:** `BEGIN/COMMIT` with rollback

**Atomic Steps:**
1. Remove players from giving roster
2. Add players to receiving roster
3. Update trade status to `'accepted'`
4. Create transaction records (both rosters)

**Transaction Records Include:**
- `adds`: Players received
- `drops`: Players given away
- `transaction_type`: `'trade'`

#### Trade Notifications

**League Settings:**
- `trade_notification_setting`: `'always_off' | 'always_on' | 'proposer_choice'`
- `trade_details_setting`: `'always_off' | 'always_on' | 'proposer_choice'`

---

## 4. Data Types & Formats

### Player IDs

| Context | Type | Usage |
|---------|------|-------|
| **Database (players table)** | `INTEGER` | Primary key, auto-increment |
| **Sleeper API** | `VARCHAR(50)` | Stored as `player_id` column |
| **Foreign keys** | `INTEGER` | References `players.id` |

**Critical:**
- ✅ `player_id` (VARCHAR) for external API lookups
- ✅ `id` (INTEGER) for internal foreign key references

### Roster IDs

| Field | Type | Description |
|-------|------|-------------|
| `roster.id` | `INTEGER` | Primary key, auto-increment |
| `roster.roster_id` | `INTEGER` | League-specific ID (1-N within league) |

**Usage:**
- ✅ Use `roster.id` for foreign key references
- ✅ Use `roster.roster_id` for display/ordering within league

### Season Format
- **Format:** `'YYYY'` (e.g., `'2024'`, `'2025'`)
- **Type:** `VARCHAR/TEXT`
- **Used in:** `leagues`, `player_stats`, `weekly_lineups`, `keeper_selections`, `season_history`

### Season Type
- **Values:** `'pre' | 'regular' | 'post'`
- **Default:** `'regular'`
- **Affects:** Stats queries, projections, playoff calculations

### Week Numbers
- **Range:** 1-18 (NFL weeks)
- **Playoff weeks:** Typically 15-18
- **Week 0:** Not used (weeks start at 1)

**Constraints:**
```javascript
start_week: 1-17
end_week: 1-17
playoff_week_start: 1-18
playoff_week_start > start_week
```

### Date/Time Handling
- **Storage:** `TIMESTAMP` (UTC in database)
- **Deadlines:** `TIMESTAMP` (`pick_deadline`, nomination deadline)
- **Auto-timestamps:** `created_at`, `updated_at` (`CURRENT_TIMESTAMP`)
- **Triggers:** `update_updated_at_column()` on UPDATE

### Roster Positions Structure

**Storage:** JSONB array

```json
[
  {"position": "QB", "count": 1},
  {"position": "RB", "count": 2},
  {"position": "WR", "count": 2},
  {"position": "TE", "count": 1},
  {"position": "FLEX", "count": 1},
  {"position": "BN", "count": 5}
]
```

**Special Positions:**
- `BN`: Bench slots (stored in starters array as `BN1`, `BN2`, etc.)
- `TAXI`: Taxi squad (separate array)
- `IR`: Injured reserve (separate array)

### Lineup Structure

```javascript
{
  starters: [
    {slot: 'QB', player_id: 123},
    {slot: 'RB1', player_id: 456},
    {slot: 'BN1', player_id: 789}  // Bench in starters array
  ],
  bench: [234, 567],  // Simple array of player IDs
  taxi: [890],        // Simple array of player IDs
  ir: [123]           // Simple array of player IDs
}
```

**Critical:**
- ✅ **Starters:** Slot-based structure `{slot, player_id}`
- ✅ **Bench/Taxi/IR:** Simple arrays of player IDs

### FLEX Position Eligibility

| FLEX Type | Eligible Positions |
|-----------|-------------------|
| `FLEX` | RB, WR, TE |
| `SUPER_FLEX` | QB, RB, WR, TE |
| `WRT` | WR, RB, TE |
| `REC_FLEX` | WR, TE |
| `IDP_FLEX` | DL, LB, DB |

**Validation:** `isPlayerEligibleForPosition()` enforces eligibility

---

## 5. Security Rules

### Password Security
- ✅ **Passwords hashed with bcrypt** (never stored plain text)
- ✅ **Password never returned in API responses**
- ✅ **Separate function for password retrieval:** `getUserByUsernameWithPassword()` (auth only)
- ✅ **Default queries exclude password field**

### Password Reset
- ✅ **Tokens stored hashed** in `password_reset` table
- ✅ **Token expiration:** 1 hour (default)
- ✅ **One-time use:** Token deleted after successful reset
- ✅ **Rate limited:** 3 requests/hour per IP

### Commissioner-Only Actions
- League settings changes
- Draft start/pause/reset/delete
- Force roster changes (via `requireCommissionerOrRosterOwner`)
- Playoff bracket generation
- Schedule generation
- Waiver settings
- Trade review/veto (if enabled)

### Roster Owner Actions
- Lineup changes (own roster only)
- Waiver claims (own roster only)
- Trade proposals (must own players offered)
- Trade acceptance/rejection (receiver only)
- Weekly lineup submission (own roster only)

### SQL Injection Protection
- ✅ **All queries use parameterized queries** (`$1`, `$2`, etc.)
- ✅ **No string concatenation for user input**
- ✅ **`escapeLikePattern()` for LIKE queries**
- ✅ **JSONB fields validated before storage**

### Authorization Checks
- ✅ **Every protected route has middleware**
- ✅ **User ID extracted from JWT token** (`req.user.userId`)
- ✅ **Database lookups verify ownership before mutations**
- ✅ **Foreign key constraints prevent orphaned records**

---

## 6. Performance Constraints

### Database Timeouts
- **Statement timeout:** 5000ms (5 seconds)
- **Lock timeout:** 3000ms (3 seconds)

**Transaction-Specific Timeouts:**
- Draft pick: 5000ms
- Auction bid: 5000ms
- Waiver claim: 5000ms
- Trade: 5000ms

**Timeout Error Codes:**
- Statement timeout: `'57014'`
- Lock timeout: `'55P03'`

### Transaction Isolation Levels

| Operation | Isolation Level | Reason |
|-----------|----------------|---------|
| Waiver processing | `SERIALIZABLE` | Prevents phantom reads |
| Draft picks | `BEGIN/COMMIT` + `FOR UPDATE` | Row-level locks |
| Trades | `BEGIN/COMMIT` + rollback | Atomic player movement |
| Auction bids | `BEGIN/COMMIT` + rollback | Budget validation |
| Derby selections | `BEGIN/COMMIT` + `FOR UPDATE` | Prevent double selection |

### Cache TTLs

| Cache Type | TTL | Update Frequency |
|------------|-----|-----------------|
| Projections | 30 minutes | Every 15 minutes (cron) |
| Stats | 5 minutes | Every 5 minutes (cron) |
| User data | No cache | Always fresh |
| League data | No cache | Always fresh |
| Live scores | No cache | Always fresh |

### Bulk Operation Limits

| Operation | Rate Limit | Window |
|-----------|-----------|---------|
| Player sync | 5 requests | 5 minutes |
| Stats sync | 5 requests | 5 minutes |
| Projections (cached) | Unlimited | N/A |
| Projections (uncached) | 5 requests | 5 minutes |

### Database Indexes

**All Foreign Keys Are Indexed:**
- Every `league_id`, `user_id`, `roster_id`, `draft_id`, etc.

**Additional Indexes:**
- Status fields (`draft.status`, `trade.status`)
- Composite unique indexes (for uniqueness checks)
- Query-optimized indexes (for frequent WHERE clauses)

---

## 7. State Machine Rules

### Draft Status Transitions

```
     ┌─────────────┐
     │ not_started │
     └──────┬──────┘
            │ startDraft()
            ↓
     ┌─────────────┐
     │ in_progress │←──────┐
     └──────┬──────┘       │
            │              │ resumeDraft()
            │ pauseDraft() │
            ↓              │
     ┌─────────────┐       │
     │   paused    │───────┘
     └─────────────┘

     (last pick made)
            ↓
     ┌─────────────┐
     │ completing  │
     └──────┬──────┘
            │ completeDraft()
            ↓
     ┌─────────────┐
     │  completed  │
     └─────────────┘

     resetDraft() → not_started (from any state)
```

**Constraints:**
- Cannot start if no draft order
- Cannot pick if status != `'in_progress'`
- Cannot complete if status != `'completing'`
- Reset clears picks and derby

### Waiver Claim States

```
          ┌─────────┐
          │ pending │
          └────┬────┘
               │
      ┌────────┼────────┐
      │        │        │
      ↓        ↓        ↓
┌──────────┬─────────┬───────────┐
│processed │ failed  │ cancelled │
└──────────┴─────────┴───────────┘
   (final states - no transitions)
```

**Final States:** `processed`, `failed`, `cancelled`

### Trade States

```
     ┌─────────┐
     │ pending │
     └────┬────┘
          │
    ┌─────┼─────┬─────────┐
    │     │     │         │
    ↓     ↓     ↓         ↓
┌────────┬────────┬───────────┐
│accepted│rejected│ cancelled │
└────────┴────────┴───────────┘
   (final states)
```

**Authorization:**
- Accept/Reject: Receiver only
- Cancel: Proposer only

### Auction Nomination States

```
  ┌────────┐
  │ active │
  └───┬────┘
      │
   ┌──┴──┐
   ↓     ↓
┌──────┬────────┐
│completed│ passed │
└──────┴────────┘
```

- `active`: Accepting bids
- `completed`: Winner determined
- `passed`: No bids (rare)

### Draft Derby States

```
┌─────────┐      ┌─────────────┐      ┌───────────┐
│ pending │─────→│ in_progress │─────→│ completed │
└─────────┘      └─────────────┘      └───────────┘
     ↑                                       │
     └───────────────────────────────────────┘
              resetDerby() (clears & re-randomizes)
```

- `pending`: Created, not started
- `in_progress`: Rosters selecting positions
- `completed`: All positions selected

### Matchup States

```
┌───────────┐      ┌─────────────┐      ┌───────────┐
│ scheduled │─────→│ in_progress │─────→│ completed │
└───────────┘      └─────────────┘      └───────────┘
      │                                        │
      └────────────────────────────────────────┘
                  cancelled (commissioner)

is_finalized flag: true when scores locked
```

**Constraints:**
- Cannot change lineup when `in_progress` or `completed`

### League Status

```
┌────────────┐      ┌─────────────┐      ┌───────────┐
│ pre_draft  │─────→│ in_progress │─────→│ completed │
└────────────┘      └─────────────┘      └───────────┘
```

- `pre_draft`: Before draft starts
- `in_progress`: Draft complete, season ongoing
- `completed`: Season finished

---

## 8. Critical Invariants Summary

### Must NEVER Violate

These are the absolute core truths that, if violated, could lead to data corruption, security vulnerabilities, or broken business logic:

#### Data Integrity
1. ✅ **One roster per user per league** (UNIQUE constraint)
2. ✅ **One draft per league** (UNIQUE constraint)
3. ✅ **Player drafted once per draft** (UNIQUE constraint)
4. ✅ **Foreign keys CASCADE or SET NULL appropriately**
5. ✅ **Player IDs: VARCHAR for API, INTEGER for internal**
6. ✅ **Roster IDs: Use `id` for FK, `roster_id` for display**

#### Business Logic
7. ✅ **Commissioner ID always in `league.settings.commissioner_id`**
8. ✅ **Chess timer mode requires `time_budget > 0`** (CHECK constraint)
9. ✅ **Cannot trade with yourself** (CHECK constraint)
10. ✅ **FAAB bid <= roster.faab_budget** (validation)
11. ✅ **Draft completion is idempotent** (safe to call multiple times)
12. ✅ **Waiver processing is atomic** (all-or-nothing per batch)
13. ✅ **Auto-populate rosters after draft/auction** (business rule)
14. ✅ **Derby defaults to disabled** (opt-in feature)
15. ✅ **Derby cannot be enabled for auction drafts**

#### Data Structures
16. ✅ **Starters use `{slot, player_id}` structure**
17. ✅ **Bench/Taxi/IR use player ID arrays**
18. ✅ **Weeks: 1-18, seasons: YYYY format**
19. ✅ **All timestamps in UTC**

#### Security
20. ✅ **All passwords hashed with bcrypt** (never plain text)
21. ✅ **All database queries parameterized** (SQL injection protection)
22. ✅ **Authorization middleware on all protected routes**
23. ✅ **Rate limits enforced per IP** (DDoS protection)
24. ✅ **JWT tokens contain user context** (userId, username, email)

#### Performance
25. ✅ **Transaction isolation for critical operations** (concurrency safety)
26. ✅ **Projections/stats pre-cached on server startup**
27. ✅ **Cron jobs warm caches every 5-15 minutes**
28. ✅ **Database timeouts prevent long-running queries** (5s statement, 3s lock)
29. ✅ **All foreign keys indexed** (query performance)

#### State Machines
30. ✅ **Draft status transitions follow state machine** (no illegal jumps)
31. ✅ **Trade/waiver/nomination states are final** (no transitions after completion)
32. ✅ **Draft reset is the only way back to `not_started`**

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-31 | Initial comprehensive truths documentation |

---

## For AI Agents

When implementing features or making changes:

1. **Read this document first**
2. **Check if any truths are affected by your changes**
3. **Verify database migrations don't violate constraints**
4. **Ensure new features follow existing patterns**
5. **Update this document if new invariants are discovered**

If you find a truth that's violated or missing, please update this document.

---

## For Developers

This document serves as:
- Reference for system constraints
- Onboarding guide for new team members
- Design guide for new features
- Troubleshooting resource for bugs

When in doubt, **the database schema and code are the source of truth**. This document should reflect them.
