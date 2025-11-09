# Derby Skip Feature Implementation - NFL Style

## Overview
Implements NFL-style draft derby skip rules where skipped users can pick at any time, even when someone else is on the clock.

## Status: Backend Complete, Database Migration Pending, Frontend Pending

---

## What's Been Done

### ✅ Backend Implementation Complete

#### 1. Database Schema
- **File**: `backend/src/migrations/063_add_derby_skipped_user_timer.sql`
  - Adds `derby_skipped_user_time_limit_seconds` to `drafts` table
  - Allows commissioner to set separate timer for when only skipped users remain

- **File**: `backend/src/migrations/064_migrate_derby_schema.sql`
  - Transforms old derby schema to new schema
  - Old: `derby_order`, `current_turn`, `turn_deadline`
  - New: `selection_order`, `current_turn_roster_id`, `current_turn_started_at`, `skipped_roster_ids`

#### 2. Model Updates

**Draft Model** (`backend/src/models/Draft.ts`):
- Added `derby_skipped_user_time_limit_seconds: number | null` to interface
- ⚠️ **TODO**: Add to `createDraft` function parameters and SQL INSERT

**DraftDerby Model** (`backend/src/models/DraftDerby.ts`):
- ✅ Modified `makeDerbySelection` to allow picks if:
  - It's your turn OR
  - You're in the skipped list OR
  - Only skipped users remain (`current_turn_roster_id === null`)
- ✅ Added `checkOnlySkippedRemaining()` helper
- ✅ Updated `calculateNextTurn()` to:
  - Return `onlySkippedRemaining` flag
  - Set `current_turn_roster_id = NULL` when only skipped users left
  - Properly track `skipped_roster_ids` array

#### 3. Controller Updates

**Derby Controller** (`backend/src/controllers/derbyController.ts`):
- ⚠️ **NEEDS WORK**: Currently still using old schema (direct SQL queries)
- Should use DraftDerby model functions instead
- selectDerbyPosition and skipDerbyTurn functions were updated but got reverted

**Socket Handler** (`backend/src/socket/derbySocket.ts`):
- ✅ Updated `processDerbyTimeout` to:
  - Use DraftDerby model functions
  - Check if only skipped users remain
  - Apply `derby_skipped_user_time_limit_seconds` timer when appropriate
  - Emit proper socket events with skip status

#### 4. Socket Events

New event data structure includes:
```typescript
{
  draftId: number,
  currentRosterId: number | null,  // NULL when only skipped remain
  skippedRosterIds: number[],
  onlySkippedRemaining: boolean,
  turnDeadline: string
}
```

---

## How It Works

### Normal Flow:
1. User on the clock has X seconds to pick
2. If timeout with `derby_timeout_behavior='skip'`:
   - User is added to `skipped_roster_ids` array
   - Next user in order goes on the clock
   - Skipped user can still pick ANY TIME

### Only Skipped Users Remain:
1. When all remaining users are in `skipped_roster_ids`:
   - `current_turn_roster_id` is set to `NULL`
   - No specific user is "on the clock"
   - ALL skipped users can pick simultaneously
   - Timer uses `derby_skipped_user_time_limit_seconds` (if set)

### Skipped User Picks:
1. Skipped user makes their selection
2. They're removed from `skipped_roster_ids`
3. Derby continues with next non-skipped user (or stays in skipped-only mode)

---

## Next Steps

### ⚠️ IMMEDIATE: Fix Database

**Option A - Manual SQL (Recommended)**:
1. Open pgAdmin
2. Run `backend/manual_derby_migration.sql`
3. Verify with: `SELECT * FROM information_schema.columns WHERE table_name = 'draft_derby'`

**Option B - Find psql.exe**:
```bash
"C:\Program Files\PostgreSQL\<version>\bin\psql.exe" -U postgres -d tbdff_test -f backend/manual_derby_migration.sql
```

### Backend Remaining:

1. **Complete Draft.ts createDraft function**:
   ```typescript
   // Add to createDraft parameters
   derby_skipped_user_time_limit_seconds?: number;

   // Add to INSERT query
   derby_skipped_user_time_limit_seconds,

   // Add to query values
   draftData.derby_skipped_user_time_limit_seconds || null,
   ```

2. **Fix derbyController.ts**:
   - Replace direct SQL with DraftDerby model functions
   - Both `selectDerbyPosition` and `skipDerbyTurn` functions

3. **Build and test backend**:
   ```bash
   cd backend && npm run build
   ```

### Frontend Remaining:

1. **Update Flutter Draft Model** (`flutter_app/lib/models/draft_model.dart`):
   - Add `derbySkippedUserTimeLimitSeconds` field
   - Update `fromJson` and `toJson`

2. **Update Flutter DraftDerby Model** (`flutter_app/lib/models/draft_derby_model.dart`):
   - Add `skippedRosterIds` field
   - Add `onlySkippedRemaining` derived property

3. **Update Flutter Service** (`flutter_app/lib/services/draft_derby_service.dart`):
   - Handle new socket events
   - Handle `onlySkippedRemaining` state

4. **Update Flutter Provider** (`flutter_app/lib/providers/draft_provider.dart`):
   - Track skipped roster state
   - Allow picks when user is skipped

5. **Update Flutter UI** (`flutter_app/lib/screens/draft_derby_screen.dart`):
   - Show "SKIPPED - You can still pick!" banner for skipped users
   - Show "Waiting for skipped users..." when `onlySkippedRemaining`
   - Display which users are skipped
   - Use correct timer (normal vs skipped-user timer)

6. **Commissioner UI**:
   - Add setting for `derby_skipped_user_time_limit_seconds` in draft settings

---

## Testing Checklist

### Backend Tests:
- [ ] User can be skipped (manual or timeout)
- [ ] Skipped user can pick when someone else is on clock
- [ ] Multiple skipped users can all pick
- [ ] When only skipped remain, `current_turn_roster_id` is NULL
- [ ] Correct timer is used (normal vs skipped-user)
- [ ] Socket events include skip status

### Frontend Tests:
- [ ] Skipped user sees notification they can still pick
- [ ] Skipped user can select position out of turn
- [ ] UI shows which users are skipped
- [ ] "Only skipped remaining" state displays correctly
- [ ] Timer displays correct duration

### End-to-End:
- [ ] Full derby with skip timeout behavior
- [ ] Full derby with auto-assign timeout behavior
- [ ] Mixed scenario (some skip, some auto-assign)
- [ ] Commissioner manual skip
- [ ] All skipped users eventually pick or time out

---

## Files Modified

### Backend:
- `backend/src/migrations/063_add_derby_skipped_user_timer.sql` ✅
- `backend/src/migrations/064_migrate_derby_schema.sql` ✅
- `backend/src/migrations/060_create_draft_derby_table.sql` ✅ (updated for compatibility)
- `backend/src/models/Draft.ts` ⚠️ (needs createDraft completion)
- `backend/src/models/DraftDerby.ts` ✅
- `backend/src/controllers/derbyController.ts` ⚠️ (needs rewrite to use model)
- `backend/src/socket/derbySocket.ts` ✅
- `backend/manual_derby_migration.sql` ✅ (for manual DB fix)

### Frontend (Pending):
- `flutter_app/lib/models/draft_model.dart`
- `flutter_app/lib/models/draft_derby_model.dart`
- `flutter_app/lib/services/draft_derby_service.dart`
- `flutter_app/lib/providers/draft_provider.dart`
- `flutter_app/lib/screens/draft_derby_screen.dart`

---

## Known Issues

1. **Database Migration Failed**:
   - Existing `draft_derby` table has old schema
   - Use `manual_derby_migration.sql` to fix

2. **derbyController Reverted**:
   - Changes to use DraftDerby model were reverted by linter
   - Need to reapply or recommit

3. **Draft.createDraft Incomplete**:
   - New field added to interface but not to INSERT query
   - Complete before testing

---

## NFL Draft Rules Reference

From NFL rookie draft:
- Each team has a time limit to make their pick
- If time expires, next team can pick immediately
- The team that ran out of time can still make their pick at ANY point
- Multiple teams can be "skipped" at once
- Skipped teams don't lose their pick, just their priority in order
