# Phase 1 Refactoring - File Reference

**Status:** In Progress
**Branch:** `refactor/phase1-quick-wins` (or main)
**Duration:** ~1 week
**Lines to Save:** ~1,200-1,800

---

## 🚫 FILES TO AVOID (Will Cause Merge Conflicts)

### Backend - Controllers (3 files - example refactors)
```
backend/src/controllers/leagueController.ts
backend/src/controllers/rosterController.ts
backend/src/controllers/tradeController.ts
```

### Backend - Middleware (1 file)
```
backend/src/middleware/authorization.ts
```

### Flutter - Screens (5 files - example refactors)
```
flutter_app/lib/screens/league/league_screen.dart
flutter_app/lib/screens/roster/roster_management_screen.dart
flutter_app/lib/screens/trade/trade_screen.dart
flutter_app/lib/screens/waiver/waiver_screen.dart
flutter_app/lib/screens/draft/draft_setup_screen.dart
```

---

## 📝 NEW FILES BEING CREATED

### Backend Utilities
```
backend/src/utils/ApiResponse.ts         (new)
backend/src/utils/asyncHandler.ts        (new)
backend/src/utils/validators.ts          (new)
backend/src/middleware/authFactory.ts    (new)
```

### Flutter Utilities
```
flutter_app/lib/utils/context_extensions.dart  (new)
```

---

## ✅ SAFE TO MODIFY (Everything Else)

### Backend - Safe Files
- ✅ All other controllers (22+ files)
  - `auctionController.ts`
  - `draftController.ts`
  - `matchupController.ts`
  - `playerController.ts`
  - `waiverController.ts`
  - etc.
- ✅ All models (26+ files)
- ✅ All routes (25+ files)
- ✅ All other middleware
- ✅ Database files
- ✅ Config files

### Flutter - Safe Files
- ✅ All other screens (22+ files)
  - `home_screen.dart`
  - `player_screen.dart`
  - `matchup_screen.dart`
  - `auction_screen.dart`
  - etc.
- ✅ All widgets (56+ files)
- ✅ All providers (15+ files)
- ✅ All services (19+ files)
- ✅ All models (21+ files)
- ✅ Config files

---

## 🎯 What Each Task is Doing

### Task 1: API Response Helper (Backend)
**Impact:** 500-700 lines saved
**Changes:** Creating response utility classes, refactoring 3 example controllers
**Pattern:** `res.status().json()` → `ApiResponse.success(res, data)`

### Task 2: BuildContext Extensions (Flutter)
**Impact:** 300-500 lines saved
**Changes:** Creating UI helper extensions, refactoring 5 example screens
**Pattern:** `ScaffoldMessenger.of(context).showSnackBar(...)` → `context.showSuccess()`

### Task 3: Authorization Middleware Factory (Backend)
**Impact:** 400-600 lines saved
**Changes:** Consolidating 8 auth middleware functions into factory pattern
**Pattern:** 8 x 50-line functions → 8 x 5-line declarations

---

## 📋 After Phase 1 Completes

Once merged, ALL future code should use:
- ✅ `ApiResponse.success()` instead of manual `res.status().json()`
- ✅ `context.showSuccess()` instead of manual SnackBars
- ✅ Auth middleware from factory instead of custom functions

---

## 🔀 Merge Strategy

**If working on a feature branch:**
1. Avoid the 10 files listed above
2. Work on any other files safely
3. When Phase 1 merges to main, rebase your branch
4. Minimal conflicts (only if you touched the 10 files)

**If you must touch one of the avoided files:**
- Note it down
- Expect a merge conflict later
- We'll resolve it when merging

---

Last Updated: 2025-11-08
