# Draft Slot Selection Derby - Feasibility Analysis

## Executive Summary

**Verdict**: ✅ **SAFE TO IMPLEMENT** with careful consideration of the identified issues below.

The draft derby feature can be added without breaking existing functionality, but requires:
1. New database tables (no schema modifications to existing tables)
2. New status/phase in draft workflow
3. Careful handling of auction vs snake/linear draft types
4. Integration with existing draft order system

---

## Current System Architecture

### Draft Order System
- **Table**: `draft_order`
- **Key constraint**: `UNIQUE(draft_id, draft_position)` - each position unique per draft
- **Key constraint**: `UNIQUE(draft_id, roster_id)` - each roster appears once
- **Current flow**:
  1. Draft created → `draft_order` empty
  2. Commissioner calls `POST /api/drafts/:draftId/order` with `randomize=true`
  3. `randomizeDraftOrder()` shuffles roster IDs and assigns positions 1, 2, 3...
  4. Draft starts → uses `draft_position` to determine pick order

### Draft Types
1. **Snake** - Order reverses each round (except optional round 3)
2. **Linear** - Same order every round
3. **Auction** - No traditional pick order, uses nominations
4. **Slow Auction** - Same as auction, slower pace

### Draft Status Flow
```
not_started → in_progress → paused → completing → completed
```

---

## Potential Conflicts & Solutions

### ✅ 1. Draft Order Randomization (LOW RISK)
**Current**: Commissioner randomizes draft order before draft starts
**Derby Change**: Replace randomization with derby selection phase

**Solution**:
- Derby is **optional** (commissioner setting)
- If `derby_enabled = false`: Use existing randomization
- If `derby_enabled = true`: Enter derby phase instead
- Derby phase **must complete** before draft can start
- Derby ultimately calls `setDraftOrder()` with final selections

**No Breaking Changes**: Existing flow unchanged when derby disabled

---

### ✅ 2. Auction Draft Compatibility (MEDIUM RISK)
**Issue**: Auction drafts don't use traditional draft order
- `calculateCurrentRoster()` returns `{round: 1, pickInRound: 1, draftPosition: 1}` for auctions
- Draft order table still exists but isn't used for determining picks
- Nomination order might still matter for some auction formats

**Solution**:
- **Option A**: Disable derby for auction/slow_auction types (simplest)
- **Option B**: Allow derby for auctions to set nomination order priority
- **Recommended**: Option A initially, add Option B later if requested

**Implementation**:
```typescript
// In league settings validation
if (league.derby_enabled && draft.draft_type in ['auction', 'slow_auction']) {
  throw new Error('Derby is not available for auction drafts');
}
```

---

### ✅ 3. Draft Reset Flow (LOW RISK)
**Current Reset Behavior**:
- `resetDraft()`: Clears picks, chat messages, resets status to `not_started`
- Does **NOT** delete `draft_order` entries
- `resetLeagueHandler()`: Deletes draft entirely, clears rosters, resets to `pre_draft`

**Derby Consideration**:
- When draft is reset, should derby selections be preserved or cleared?
- When league is reset, derby is deleted (draft deleted cascades to derby)

**Solution**:
```typescript
// In resetDraft() function
export async function resetDraft(draftId: number): Promise<Draft> {
  // ... existing code ...

  // Delete derby selections but preserve derby configuration
  await client.query("DELETE FROM draft_derby_selections WHERE derby_id IN (SELECT id FROM draft_derby WHERE draft_id = $1)", [draftId]);

  // Reset derby status to pending
  await client.query("UPDATE draft_derby SET status = 'pending', current_turn_team_id = NULL WHERE draft_id = $1", [draftId]);

  // ... rest of existing code ...
}
```

---

### ✅ 4. Draft Status/Phase Conflicts (MEDIUM RISK)
**Issue**: Where does derby fit in the draft lifecycle?

**Current Flow**:
```
Draft created (not_started)
  → Commissioner sets order via randomize
  → Draft starts (in_progress)
```

**New Flow with Derby**:
```
Draft created (not_started)
  → Derby phase starts (status = 'derby_in_progress')
  → Derby completes → setDraftOrder() called with selections
  → Draft can now start (status back to 'not_started')
  → Draft starts (in_progress)
```

**Solution**:
- Add new draft status: `'derby_in_progress'`
- Or use separate `derby` table with its own status (cleaner)
- **Recommended**: Separate table - keeps draft table clean

**Schema**:
```sql
ALTER TABLE drafts ADD COLUMN derby_enabled BOOLEAN DEFAULT FALSE;

-- Draft derby has its own status
CREATE TABLE draft_derby (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER UNIQUE REFERENCES drafts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  ...
);
```

---

### ✅ 5. Frontend State Management (MEDIUM RISK)
**Current**: `DraftProvider` manages draft state
- Polls for draft updates
- Socket events for real-time updates
- Timer management for pick deadlines

**Derby Needs**:
- New screen/modal for derby phase
- Real-time updates as managers select slots
- Timer for selection deadline (optional)
- Transition to normal draft when derby completes

**Solution**:
- Add `DerbyProvider` or extend `DraftProvider`
- Add socket events: `derby:selection_made`, `derby:turn_changed`, `derby:completed`
- Add new screen: `DraftDerbyScreen`
- Show derby screen when `draft.derby_status === 'in_progress'`
- Transition to normal draft screen when `derby.status === 'completed'`

**No Breaking Changes**: Existing draft screens unaffected

---

### ✅ 6. Chess Timer & Time Budgets (LOW RISK)
**Current**: Chess timer mode tracks time remaining per roster
- Initialized in `initializeChessTimerBudgets()` when draft starts
- Stored in `draft_order.time_remaining_seconds`

**Derby Impact**: None - derby happens before draft starts
**Solution**: No changes needed

---

### ⚠️ 7. Third Round Reversal (LOW RISK BUT TRICKY)
**Current**: Snake drafts can have optional 3rd round reversal
- Affects pick order calculation in `calculateCurrentRoster()`
- Draft order positions stay the same, but reversal logic changes who picks when

**Derby Impact**:
- Managers need to understand how 3rd round reversal affects their pick value
- Position 1 gets: Pick 1, 20, 21, 40... (if reversal enabled)
- Position 10 gets: Pick 10, 11, 30, 31... (if reversal enabled)

**Solution**:
- Show pick preview for each position during derby selection
- Display "You'll pick at: 1, 20, 21, 40..." for each available slot
- Calculate using existing `calculateCurrentRoster()` logic

**UI Enhancement**:
```dart
// Show pick numbers for each available slot
for (int slot = 1; slot <= totalTeams; slot++) {
  List<int> pickNumbers = [];
  for (int round = 1; round <= rounds; round++) {
    int pick = calculatePickNumber(slot, round, totalTeams, draftType, thirdRoundReversal);
    pickNumbers.add(pick);
  }
  // Display: "Slot 1: Picks 1, 20, 21, 40..."
}
```

---

## Database Schema Requirements

### New Tables Needed

```sql
-- Add derby settings to drafts table
ALTER TABLE drafts
  ADD COLUMN derby_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN derby_time_limit_seconds INTEGER, -- NULL = no time limit
  ADD COLUMN derby_timeout_behavior VARCHAR(10) DEFAULT 'auto' CHECK (derby_timeout_behavior IN ('auto', 'skip'));

-- Derby state table
CREATE TABLE draft_derby (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER UNIQUE NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  current_turn_team_id INTEGER REFERENCES rosters(id),
  current_turn_started_at TIMESTAMP,
  selection_order JSONB NOT NULL, -- Array of roster IDs in selection order
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Derby selections table
CREATE TABLE draft_derby_selections (
  id SERIAL PRIMARY KEY,
  derby_id INTEGER NOT NULL REFERENCES draft_derby(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  draft_position INTEGER NOT NULL, -- The slot they selected (1, 2, 3...)
  selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(derby_id, roster_id), -- Each roster selects once
  UNIQUE(derby_id, draft_position) -- Each position taken once
);

-- Indexes
CREATE INDEX idx_draft_derby_draft_id ON draft_derby(draft_id);
CREATE INDEX idx_draft_derby_selections_derby_id ON draft_derby_selections(derby_id);
CREATE INDEX idx_draft_derby_selections_roster_id ON draft_derby_selections(roster_id);
```

---

## Implementation Checklist

### Phase 1: Backend Core
- [ ] Create migration scripts for new tables
- [ ] Add derby models (`DraftDerby.ts`)
- [ ] Add derby API endpoints (`/api/drafts/:draftId/derby/...`)
- [ ] Add socket events for real-time derby updates
- [ ] Update `resetDraft()` to handle derby
- [ ] Add validation: No derby for auction drafts

### Phase 2: Backend Logic
- [ ] Implement derby start (randomize selection order)
- [ ] Implement selection logic with timeout handling
- [ ] Implement skip logic (priority queue for skipped managers)
- [ ] Auto-transition to draft when derby completes
- [ ] Call `setDraftOrder()` with final selections

### Phase 3: Frontend Core
- [ ] Add derby models (`draft_derby_model.dart`)
- [ ] Add derby service (`draft_derby_service.dart`)
- [ ] Add derby provider or extend draft provider
- [ ] Add socket listeners for derby events

### Phase 4: Frontend UI
- [ ] Create `DraftDerbyScreen`
- [ ] Show selection order, available slots, timer
- [ ] Show pick preview for each slot
- [ ] Add selection confirmation
- [ ] Show real-time updates as others pick
- [ ] Handle skip/timeout scenarios

### Phase 5: Commissioner Settings
- [ ] Add derby toggle to league/draft settings
- [ ] Add time limit slider (optional)
- [ ] Add timeout behavior radio buttons
- [ ] Validate auction compatibility

### Phase 6: Testing
- [ ] Test derby with snake draft
- [ ] Test derby with linear draft
- [ ] Test derby with 3rd round reversal
- [ ] Test timeout behaviors (auto and skip)
- [ ] Test skip priority queue
- [ ] Test reset flows
- [ ] Test concurrent selections (race conditions)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing draft order | LOW | Derby uses same `setDraftOrder()` function |
| Auction draft conflicts | MEDIUM | Disable derby for auctions initially |
| Reset flow confusion | LOW | Clear derby data on reset, document behavior |
| Frontend state complexity | MEDIUM | Use separate provider/screen, clear separation |
| Race conditions | MEDIUM | Use database constraints, proper locking |
| Skip priority queue bugs | MEDIUM | Thorough testing, clear logic documentation |

---

## Conclusion

**The derby feature is safe to implement** with the following guardrails:

1. ✅ No modifications to existing draft tables (only additions)
2. ✅ Derby is optional - existing flow unchanged when disabled
3. ✅ Use separate tables for derby state
4. ✅ Disable derby for auction drafts initially
5. ✅ Clear separation in frontend (new screen/provider)
6. ✅ Comprehensive testing of edge cases

**Recommended Approach**: Implement in phases, starting with basic snake draft support, then add advanced features (skip priority, time limits, etc.) incrementally.
