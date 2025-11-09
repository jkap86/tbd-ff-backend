# Quick Local Testing Checklist

**Time Required**: 5-10 minutes
**Goal**: Verify nothing is broken before deploying to production

---

## Setup (2 minutes)

### Step 1: Start Backend
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
npm run dev
```

**Wait for**:
```
Server running on port 3000
✓ Connected to PostgreSQL database
```

---

### Step 2: Start Flutter App
```bash
# In a NEW terminal
cd C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app
flutter run -d chrome
```

**Wait for**:
```
✓ Built build\web\main.dart.js
Application running on http://localhost:xxxxx
```

Browser should open automatically with your app.

---

## Quick Tests (5-8 minutes)

### Test 1: Login & Basic Navigation (1 min)
- [ ] Login with your test account
- [ ] See leagues list
- [ ] Click into a league
- [ ] See League Details screen

**✅ PASS**: Can login and navigate
**❌ FAIL**: Can't login or crashes → Check console for errors

---

### Test 2: Draft Management Card Appears (1 min)
On League Details screen:
- [ ] **VERIFY**: Draft Management Card is visible (below league info)
- [ ] **VERIFY**: Card shows appropriate state (No Draft, Not Started, In Progress, or Completed)
- [ ] **VERIFY**: Card has proper styling (not broken layout)

**✅ PASS**: Card displays correctly
**❌ FAIL**: Card missing or broken → Check browser console

---

### Test 3: Create Draft Flow (2 min)
**Only if you're a commissioner**:
- [ ] Click "Create Draft" (if no draft exists)
- [ ] Fill in draft settings (any values)
- [ ] Click "Create Draft"
- [ ] **VERIFY**: Returns to League Details (NOT Draft Room)
- [ ] **VERIFY**: Draft Management Card updates to "Not Started"

**✅ PASS**: Create draft works, navigation correct
**❌ FAIL**: Error or wrong navigation → Note the error

---

### Test 4: Search Performance (1 min)
- [ ] Go to Available Players screen (any league)
- [ ] Type "Tom Brady" **very quickly**
- [ ] **VERIFY**: Typing feels smooth (no lag or stuttering)
- [ ] Clear and type "quarterback" quickly
- [ ] **VERIFY**: Still smooth

**✅ PASS**: Search is smooth and responsive
**❌ FAIL**: Typing lags or freezes → Debouncing issue

---

### Test 5: Draft Room Navigation (1 min)
From League Details:
- [ ] Click "Enter Draft Room" (if draft exists)
- [ ] **VERIFY**: Draft Room opens without errors
- [ ] **IMMEDIATELY** click back button
- [ ] **VERIFY**: No crash or errors

**✅ PASS**: Navigation works, no crashes
**❌ FAIL**: Crashes or errors → Widget lifecycle issue

---

### Test 6: Derby Feature (Optional - 2 min)
**Only if creating new draft**:
- [ ] Create a new draft
- [ ] Look for "Enable Derby" or derby-related options
- [ ] **VERIFY**: Derby options appear
- [ ] Try creating draft with derby enabled
- [ ] **VERIFY**: No errors

**✅ PASS**: Derby options work
**❌ FAIL**: Errors or missing → Derby integration issue

---

## Results Summary

### All Tests Pass ✅
**You're good to deploy!** Proceed with production deployment.

```bash
# Stop local servers (Ctrl+C in both terminals)
# Then follow DEPLOYMENT_SUMMARY.md
```

---

### Some Tests Fail ❌

**Note which tests failed**, then check:

1. **Browser Console** (F12 → Console tab)
   - Look for error messages
   - Note the red errors

2. **Backend Terminal**
   - Look for error logs
   - Note any stack traces

3. **Report Issues**
   - Which test failed
   - What error appeared
   - Browser console output
   - Backend terminal output

---

## Common Issues & Fixes

### Issue: "Draft Management Card not showing"
**Check**:
- Browser console for errors
- Network tab - did API call succeed?
- Is DraftProvider loading correctly?

**Quick Fix**:
- Hard refresh (Ctrl+Shift+R)
- Check if draft exists in database

---

### Issue: "Search is laggy"
**Check**:
- Are debounce utilities imported?
- Console for errors

**Quick Fix**:
- Verify `lib/utils/debounce.dart` exists
- Check imports in `available_players_screen.dart`

---

### Issue: "Can't create draft"
**Check**:
- Backend terminal for errors
- Network tab in browser (F12 → Network)
- Are migrations run? (check earlier output)

**Quick Fix**:
- Re-run migrations: `npm run migrate`
- Check database connection

---

### Issue: "Crash when navigating away from draft room"
**Check**:
- Browser console for "setState" or "disposed" errors

**This should be fixed**, but if it happens:
- Note the exact error message
- Report it as a regression

---

## Backend Console - What to Look For

### Good Signs ✅:
```
Server running on port 3000
✓ Connected to PostgreSQL database
[Draft] Loading draft...
[Timer] Started timer broadcast
```

### Warning Signs ⚠️:
```
Error: <anything>
Unhandled exception
Database error
Socket error
```

---

## Browser Console - What to Look For

### Good Signs ✅:
```
[Draft] Draft loaded successfully
Application started
No errors in console
```

### Warning Signs ⚠️:
```
❌ setState() called after dispose()
❌ Network error
❌ 404 Not Found
❌ 500 Internal Server Error
❌ Uncaught exception
```

---

## Quick Verification Commands

While app is running, verify in another terminal:

### Check Database Tables
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
npm run psql
```

Then:
```sql
-- Verify derby tables exist
\dt draft_derby*

-- Should see:
-- draft_derby
-- draft_derby_selections

-- Exit psql
\q
```

### Check Latest Migration
```bash
cd C:\Users\jkap8\Documents\DEV\tbd-ff\backend
npm run migrate
```

Should show:
```
All migrations completed successfully!
```

---

## Time Estimate Breakdown

- Setup (start servers): 2 min
- Test 1 (Login): 1 min
- Test 2 (Card display): 1 min
- Test 3 (Create draft): 2 min
- Test 4 (Search): 1 min
- Test 5 (Navigation): 1 min
- Test 6 (Derby - optional): 2 min

**Total**: 8-10 minutes

---

## After Local Testing

### ✅ If All Pass:
1. Stop local servers (Ctrl+C)
2. Follow `DEPLOYMENT_SUMMARY.md`
3. Deploy to production
4. Run production tests from `TESTING_GUIDE.md`

### ❌ If Any Fail:
1. Note all failing tests
2. Collect error messages
3. Report issues
4. Fix before deploying

---

**Ready to start? Run the Setup commands and work through the tests! 🚀**
