# Derby Events and Operations - Complete Reference

## SUMMARY OF ALL DERBY OPERATIONS

### 1. Derby Creation
- API: POST /api/drafts/:draftId/derby/create
- Function: derbyController.ts -> createDerby()
- State: Creates draft_derby record with status='pending'
- Chat: "Derby has been created"

### 2. Derby Start  
- API: POST /api/drafts/:draftId/derby/start
- Function: derbyController.ts -> startDerby()
- State: status='in_progress', sets first roster as current_turn_roster_id
- Event: derby:update socket
- Chat: "Derby started - teams selecting positions"

### 3. Manual Position Selection
- API: POST /api/drafts/:draftId/derby/select
- Function: derbyController.ts -> selectDerbyPosition()
- State: Creates draft_derby_selections, updates current turn, advances to next roster
- Events: derby:selection_made, derby:turn_changed
- Chat: "Team X selected slot Y"

### 4. Timeout with Auto-Assign
- Trigger: Timer expires with derby_timeout_behavior='auto'
- Function: derbySocket.ts -> processDerbyTimeout()
- State: Auto-assigns random position to current roster, advances turn
- Events: derby:selection_made, derby:timeout, derby:turn_changed
- Chat: "Team X timed out - auto-assigned slot Y"

### 5. Timeout with Skip
- Trigger: Timer expires with derby_timeout_behavior='skip'
- Function: derbySocket.ts -> processDerbyTimeout()
- State: Adds roster to skipped_roster_ids, advances turn
- Events: derby:timeout, derby:turn_changed
- Chat: "Team X timed out - skipped (can pick later)"

### 6. Manual Skip by Commissioner
- API: POST /api/drafts/:draftId/derby/skip
- Function: derbyController.ts -> skipDerbyTurn()
- State: Adds roster to skipped_roster_ids, advances turn
- Events: derby:turn_changed
- Chat: "Commissioner skipped Team X"

### 7. Randomize Order
- API: POST /api/drafts/:draftId/derby/randomize
- Function: derbyController.ts -> randomizeDerby()
- State: Shuffles selection_order, sets is_randomized=TRUE
- Events: derby:update
- Chat: "Commissioner randomized selection order"

### 8. Timeout - Only Skipped Remaining
- Trigger: Timer expires when current_turn_roster_id=NULL
- Function: derbySocket.ts -> autoAssignAllSkippedRosters()
- State: Auto-assigns ALL skipped rosters, completes derby
- Events: derby:selection_made (x multiple), derby:completed
- Chat: "Remaining skipped teams auto-assigned"

### 9. Derby Completed
- Trigger: All rosters have selected positions
- Events: derby:completed
- Chat: "Derby completed! All positions selected"

### 10. Pause Timer
- API: POST /api/drafts/:draftId/derby/pause
- Function: derbyController.ts -> pauseDerby()
- State: Cancels scheduled timeout
- Events: derby:paused
- Chat: "Commissioner paused derby timer"

### 11. Resume Timer
- API: POST /api/drafts/:draftId/derby/resume
- Function: derbyController.ts -> resumeDerby()
- State: Schedules new timeout
- Events: derby:resumed
- Chat: "Commissioner resumed derby timer"

### 12. Only Skipped Remaining (signal)
- Trigger: When last non-skipped roster selects
- State: current_turn_roster_id=NULL, only skipped rosters remain
- Events: derby:turn_changed with onlySkippedRemaining=true
- Chat: "Only skipped teams remain - pick in any order"

---

## DATABASE TABLES

draft_derby:
  - id, draft_id, status (pending|in_progress|completed)
  - selection_order (JSONB array of roster IDs)
  - current_turn_roster_id (which roster is on clock, NULL if only skipped)
  - current_turn_started_at (when current turn began)
  - skipped_roster_ids (JSONB array)
  - is_randomized (boolean)
  - created_at, updated_at

draft_derby_selections:
  - id, derby_id, roster_id, draft_position, selected_at
  - UNIQUE(derby_id, roster_id) - each roster picks once
  - UNIQUE(derby_id, draft_position) - each position picked once

drafts (relevant):
  - derby_enabled (boolean)
  - derby_time_limit_seconds (integer)
  - derby_timeout_behavior (varchar: auto|skip)
  - derby_skipped_user_time_limit_seconds (integer)

---

## SOCKET EVENTS

derby:update - derby status/start/randomize
derby:selection_made - position selected (manual or auto)
derby:turn_changed - turn advanced
derby:timeout - timeout occurred
derby:completed - all positions selected
derby:paused - timer paused
derby:resumed - timer resumed

---

## TIMER MANAGEMENT

- In-memory JavaScript Map stored in derbySocket.ts
- NOT persisted to database
- Lost on server restart
- Uses setTimeout() with calculated delay
- One timer per draft_id

---

## AUTHORIZATION

Commissioner-only operations:
- createDerby, startDerby, skipDerbyTurn, randomizeDerby, pauseDerby, resumeDerby

Roster-owner operations:
- selectDerbyPosition (must own the roster)

---

## KEY FILES

Backend:
- src/controllers/derbyController.ts (7 endpoints)
- src/models/DraftDerby.ts (11+ operations)
- src/socket/derbySocket.ts (timer + timeout)
- src/routes/draftRoutes.ts (9 routes)

Database:
- src/migrations/059_add_derby_columns_to_drafts.sql
- src/migrations/060_create_draft_derby_table.sql
- src/migrations/061_create_draft_derby_selections_table.sql
- src/migrations/063_add_derby_skipped_user_timer.sql
- src/migrations/064_migrate_derby_schema.sql
- src/migrations/079_add_derby_is_randomized.sql

Tests:
- src/__tests__/derby.test.ts

---

END OF REFERENCE
