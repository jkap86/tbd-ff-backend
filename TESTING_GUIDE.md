# Testing Guide - Draft Management Refactoring + Debouncing

**What to Test**: Draft management refactoring and debouncing/throttling optimizations

**Estimated Time**: 20-30 minutes

---

## Recent Fixes Included

- ✅ Draft timer cleanup on league reset (prevents memory leaks)
- ✅ Draft management refactoring (separate UI from league settings)
- ✅ Debouncing/throttling optimizations (performance improvements)

---

## Pre-Testing Checklist

### 1. Push Changes to Dev Branch

**Flutter App**:
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app
git push origin main:dev
```

**Backend**:
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
git push origin main:dev
```

**Root Docs**:
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff
git push origin dev
```

### 2. Deploy Backend to Heroku

```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
git push heroku main
```

Wait for deployment to complete, then verify:
```bash
heroku logs --tail --app tbd-ff
```

### 3. Rebuild Flutter App

```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app
flutter clean
flutter pub get
flutter build web
```

---

## Testing Sections

### PART 1: Draft Management Refactoring (15 minutes)

#### Test 1.1: Commissioner Draft Creation Flow ⭐ CRITICAL
**Expected Changes**: New Draft Management Card visible, create draft returns to League Details

**Steps**:
1. Login as **commissioner**
2. Navigate to a league (League Details screen)
3. **VERIFY**: Draft Management Card is visible below league info
4. **VERIFY**: Card shows "No draft has been created yet"
5. **VERIFY**: "Create Draft" button is visible
6. Click "Create Draft"
7. Configure draft settings (any type is fine)
8. Click "Create Draft"
9. **VERIFY**: Returns to League Details (NOT Draft Room)
10. **VERIFY**: See success snackbar: "Draft created successfully! Randomize the draft order before starting."
11. **VERIFY**: Draft Management Card now shows "Draft Not Started" state
12. **VERIFY**: Can see draft configuration (Type, Rounds, Pick Time)

**What to Look For**:
- ✅ Card is prominently displayed
- ✅ Returns to League Details (NOT Draft Room)
- ✅ Card updates immediately (no manual refresh needed)
- ❌ No errors in console
- ❌ Should NOT auto-navigate to Draft Room

---

#### Test 1.2: Commissioner-Only Actions ⭐ CRITICAL
**Expected Changes**: Only commissioners see create/delete/randomize buttons

**Steps**:
1. Still logged in as **commissioner**
2. In Draft Management Card (draft not started), **VERIFY** you see:
   - ✅ "Enter Draft Room" button
   - ✅ "Randomize Order" button
   - ✅ "Delete Draft" button
3. Logout
4. Login as **non-commissioner team member**
5. Navigate to same league
6. **VERIFY** Draft Management Card shows draft info
7. **VERIFY** you see:
   - ✅ "Enter Draft Room" button
   - ❌ NO "Randomize Order" button
   - ❌ NO "Delete Draft" button
   - ❌ NO "Create Draft" button

**What to Look For**:
- ✅ Non-commissioners can see draft info
- ✅ Non-commissioners can enter draft room
- ❌ Non-commissioners CANNOT create/delete/randomize

---

#### Test 1.3: Randomize Draft Order ⭐ CRITICAL
**Expected Changes**: New randomize functionality works

**Steps**:
1. Login as **commissioner**
2. Navigate to league with draft not started
3. Click "Randomize Order" button
4. **VERIFY**: Confirmation dialog appears
5. Click "Randomize"
6. **VERIFY**: See "Randomizing draft order..." snackbar
7. **VERIFY**: See "Draft order randomized successfully!" green snackbar
8. Click "Enter Draft Room"
9. **VERIFY**: Draft order has been randomized in the draft room

**What to Look For**:
- ✅ Confirmation dialog prevents accidental clicks
- ✅ Loading feedback during operation
- ✅ Success feedback after completion
- ✅ Draft order actually changes
- ❌ No errors in console

---

#### Test 1.4: Draft States Display
**Expected Changes**: Card shows correct state for each draft status

**Steps**:
1. **No Draft State**: Already tested in 1.1
2. **Not Started State**: Already tested in 1.1-1.3
3. **In Progress State**:
   - Start a draft (as commissioner)
   - Return to League Details
   - **VERIFY**: Card shows "DRAFT IN PROGRESS" banner (orange gradient)
   - **VERIFY**: Shows "Round X of Y" and "Pick X of Y"
   - **VERIFY**: Progress bar is visible
   - **VERIFY**: "Enter Draft Room" button prominent
4. **Completed State**:
   - Complete a draft (make all picks)
   - Return to League Details
   - **VERIFY**: Card shows "Draft Completed" banner (green)
   - **VERIFY**: Shows completion timestamp
   - **VERIFY**: "View Draft Results" button visible

**What to Look For**:
- ✅ Each state has distinct visual design
- ✅ Information is clear and actionable
- ✅ Buttons are appropriate for each state

---

#### Test 1.5: Widget Lifecycle (setState Crash Fix)
**Expected Changes**: No crashes when navigating away during loading

**Steps**:
1. Create or enter a draft with many players
2. Enter Draft Room
3. **IMMEDIATELY** navigate back (before stats finish loading)
4. **VERIFY**: No crash
5. **VERIFY**: No error in console about setState on disposed widget
6. Repeat 2-3 times to ensure stability

**What to Look For**:
- ❌ No crashes
- ❌ No console errors mentioning "_ElementLifecycle.defunct"
- ✅ Smooth navigation

---

### PART 2: Debouncing & Throttling (10 minutes)

#### Test 2.1: Available Players Search Debouncing ⭐ PERFORMANCE
**Expected Changes**: Search is smooth, no lag while typing

**Steps**:
1. Navigate to Available Players screen (from any league)
2. Type "Tom Brady" **very quickly**
3. **VERIFY**: Typing feels smooth (no lag)
4. **VERIFY**: Results appear ~300ms after you stop typing
5. Try rapid typing: "qwertyuiop" then backspace all
6. **VERIFY**: No stuttering or freezing

**What to Look For**:
- ✅ Instant keystroke response
- ✅ Filter runs once after typing stops
- ❌ No UI freezes
- ❌ No janky animations

**Before vs After**:
- Before: Lag on each keystroke, UI freezes
- After: Smooth typing, filter runs once

---

#### Test 2.2: Draft Room Search Debouncing ⭐ PERFORMANCE
**Expected Changes**: Draft room search is responsive during picks

**Steps**:
1. Enter Draft Room (any draft type)
2. Type in search box **very quickly**: "quarterback"
3. **VERIFY**: Typing is smooth
4. **VERIFY**: Results appear ~250ms after stopping
5. During your pick time, search for a player rapidly
6. **VERIFY**: No lag affects your ability to make pick

**What to Look For**:
- ✅ Responsive search during time pressure
- ✅ Smooth typing experience
- ❌ No UI freezes during critical moments

---

#### Test 2.3: League Chat Throttling
**Expected Changes**: Can't spam chat messages

**Steps**:
1. Open League Details screen with chat widget
2. Try to send 5 messages **very rapidly** (click send repeatedly)
3. **VERIFY**: Only 1 message per second goes through
4. **VERIFY**: No error messages (messages just don't send if too fast)

**What to Look For**:
- ✅ Maximum 1 message per second
- ✅ No spam possible
- ❌ No errors shown to user

---

#### Test 2.4: Draft Chat Rate Limiting (Backend)
**Expected Changes**: Can't spam draft chat

**Steps**:
1. Enter Draft Room
2. Open chat tab
3. Try to send multiple messages **very rapidly**
4. **VERIFY**: Maximum 2 messages per second
5. If you send faster, should see "Please slow down" message

**What to Look For**:
- ✅ Maximum 2 messages per second
- ✅ Rate limit error if too fast
- ❌ No chat spam possible

---

#### Test 2.5: Auction Bid Throttling (Backend)
**Expected Changes**: Can't spam auction bids

**Steps**:
1. Create and start an **auction draft**
2. During a nomination, try to click "Bid" button **very rapidly** (spam it)
3. **VERIFY**: Bids are throttled (max 5 per second)
4. **VERIFY**: No error messages (just ignores extra clicks)

**What to Look For**:
- ✅ Can't spam bid button
- ✅ Maximum 5 bids per second per team
- ❌ No server errors

---

### PART 3: Integration & Regression (5 minutes)

#### Test 3.1: Edit League Settings - Draft Code Removed
**Expected Changes**: Draft settings no longer in Edit League Settings

**Steps**:
1. Navigate to League Details
2. Click "Edit League Settings" (gear icon or menu)
3. **VERIFY**: NO draft settings visible
4. **VERIFY**: Only see: League Name, Scoring Settings, Roster Positions
5. Make a change to league name
6. Save
7. **VERIFY**: Saves successfully
8. **VERIFY**: No errors about draft settings

**What to Look For**:
- ✅ Cleaner, more focused Edit League Settings screen
- ❌ No draft-related options
- ✅ League settings still work correctly

---

#### Test 3.2: Navigation Between Screens
**Expected Changes**: All navigation flows work correctly

**Test Navigation**:
1. League Details → Create Draft → (save) → **Back to League Details** ✅
2. League Details → Enter Draft Room → **Draft Room opens** ✅
3. League Details → Edit League Settings → (save) → **Back to League Details** ✅
4. Draft Room → Back button → **League Details** ✅

**What to Look For**:
- ✅ All back buttons work correctly
- ✅ No unexpected navigation jumps
- ✅ Can navigate entire app without issues

---

#### Test 3.3: Different Draft Types
**Expected Changes**: Draft Management Card works with all draft types

**Test Each Type**:
1. **Snake Draft**:
   - Create snake draft
   - **VERIFY**: Card shows "Snake Draft"
   - Enter draft room → **VERIFY**: Goes to DraftRoomScreen
2. **Linear Draft**:
   - Create linear draft
   - **VERIFY**: Card shows "Linear Draft"
   - Enter draft room → **VERIFY**: Goes to DraftRoomScreen
3. **Auction Draft**:
   - Create auction draft
   - **VERIFY**: Card shows "Auction Draft" and starting budget
   - Enter draft room → **VERIFY**: Goes to AuctionDraftScreen
4. **Slow Auction**:
   - Create slow auction
   - **VERIFY**: Card shows "Slow Auction" and starting budget
   - Enter draft room → **VERIFY**: Goes to SlowAuctionDraftScreen

**What to Look For**:
- ✅ Correct draft type displayed
- ✅ Type-specific info shown (rounds for snake, budget for auction)
- ✅ Navigates to correct screen type

---

## Quick Smoke Test (5 minutes)

If you're short on time, test these critical paths:

1. ✅ **Create Draft** (Test 1.1) - MUST WORK
2. ✅ **Commissioner Permissions** (Test 1.2) - MUST WORK
3. ✅ **Randomize Order** (Test 1.3) - MUST WORK
4. ✅ **Search Debouncing** (Test 2.1 or 2.2) - MUST FEEL SMOOTH
5. ✅ **No setState Crash** (Test 1.5) - MUST NOT CRASH

---

## Console Checks

Throughout testing, monitor browser console for:

### Expected Messages (OK):
```
[Draft] Loading draft...
[Draft] Draft loaded successfully
[Timer] Switched to 10000ms interval
[Timer] Switched to 1000ms interval
```

### Red Flags (NOT OK):
```
❌ setState() called after dispose()
❌ _ElementLifecycle.defunct
❌ operator does not exist: character varying = integer
❌ [AuctionSocket] Error placing bid
❌ [LiveScore] Update exceeded 30s timeout
```

---

## Rollback Plan

If critical bugs found:

### Flutter App Rollback
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app
git reset --hard HEAD~5  # Undo last 5 commits
git push origin main:dev --force
flutter clean && flutter pub get && flutter build web
```

### Backend Rollback
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
git reset --hard HEAD~1  # Undo last commit
git push origin main --force
git push heroku main --force
```

---

## Success Criteria

### Must Pass ✅:
- [ ] Create draft returns to League Details (not Draft Room)
- [ ] Only commissioners can create/delete/randomize drafts
- [ ] Randomize draft order works
- [ ] No setState crashes when navigating away
- [ ] Search typing is smooth (no lag)

### Should Pass ✅:
- [ ] All 4 draft states display correctly
- [ ] Chat throttling works (max 1-2 msg/sec)
- [ ] All draft types work correctly
- [ ] Edit League Settings has no draft options

### Nice to Have ✅:
- [ ] Auction bid throttling works
- [ ] Timer optimization (can verify in backend logs)

---

## Reporting Issues

If you find bugs, note:
1. **Which test** (e.g., "Test 1.1: Commissioner Draft Creation")
2. **What happened** (actual behavior)
3. **What should happen** (expected behavior)
4. **Console errors** (if any)
5. **Browser** (Chrome, Firefox, etc.)

Example:
```
Test 1.1 - FAILED
Expected: Return to League Details after creating draft
Actual: Navigated to Draft Room
Console: No errors
Browser: Chrome
```

---

## After Testing

Once all tests pass:

### Merge to Main
```bash
# Flutter
cd C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app
git checkout main
git merge dev
git push origin main

# Backend
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
git checkout main
git merge dev
git push origin main

# Root
cd C:\Users\jkap8\Documents\DEV\tbd-ff
git checkout main
git merge dev
git push origin main
```

---

**Ready to test! Start with Part 1, then Part 2, then Part 3. Good luck! 🚀**
