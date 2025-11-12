# Phase 1 Refactoring Examples

This document shows concrete before/after examples for applying the new utility classes.

## Backend Controller Refactoring

### Step 1: Add Imports

Add these imports to any controller file:

```typescript
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { validateId } from "../utils/validators";
```

### Example 1: Simple GET Handler

**BEFORE (32 lines):**
```typescript
export async function getUserLeaguesHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    console.log('[getUserLeagues] Request for userId:', req.params.userId);
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      console.log('[getUserLeagues] Invalid user ID');
      res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
      return;
    }

    const leagues = await getLeaguesForUser(userId);
    console.log('[getUserLeagues] Found', leagues.length, 'leagues');

    res.status(200).json({
      success: true,
      data: leagues,
    });
  } catch (error: any) {
    console.error("Get user leagues error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting user leagues",
    });
  }
}
```

**AFTER (8 lines - 75% reduction):**
```typescript
export const getUserLeaguesHandler = asyncHandler(async (req: Request, res: Response) => {
  console.log('[getUserLeagues] Request for userId:', req.params.userId);
  const userId = validateId(req.params.userId, "User ID");

  const leagues = await getLeaguesForUser(userId);
  console.log('[getUserLeagues] Found', leagues.length, 'leagues');

  ApiResponse.success(res, leagues);
});
```

**Changes:**
- ✅ Removed try-catch (asyncHandler handles it)
- ✅ Removed manual `parseInt` and `isNaN` check (validateId handles it)
- ✅ Removed manual error responses (validateId throws, asyncHandler catches)
- ✅ Replaced `res.status(200).json(...)` with `ApiResponse.success()`
- ✅ Changed from `async function` to `const` with asyncHandler wrapper

---

### Example 2: GET Handler Without Parameters

**BEFORE:**
```typescript
export async function getPublicLeaguesHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const { getPublicLeagues } = await import("../models/League");
    const leagues = await getPublicLeagues();

    res.status(200).json({
      success: true,
      data: leagues,
    });
  } catch (error: any) {
    console.error("Get public leagues error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching public leagues",
    });
  }
}
```

**AFTER:**
```typescript
export const getPublicLeaguesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const { getPublicLeagues } = await import("../models/League");
  const leagues = await getPublicLeagues();

  ApiResponse.success(res, leagues);
});
```

---

### Example 3: POST Handler with Validation

**BEFORE:**
```typescript
export async function createLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { name, season } = req.body;

    if (!name || !season) {
      res.status(400).json({
        success: false,
        message: "Name and season are required",
      });
      return;
    }

    if (!/^\d{4}$/.test(season)) {
      res.status(400).json({
        success: false,
        message: "Season must be a valid year",
      });
      return;
    }

    const league = await createLeague(req.body);

    res.status(201).json({
      success: true,
      data: league,
      message: "League created successfully",
    });
  } catch (error: any) {
    console.error("Create league error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating league",
    });
  }
}
```

**AFTER (using validateSeason from validators.ts):**
```typescript
export const createLeagueHandler = asyncHandler(async (req: Request, res: Response) => {
  const { name, season } = req.body;

  if (!name) {
    return ApiResponse.badRequest(res, "Name is required");
  }

  validateSeason(season); // Throws ValidationError if invalid

  const league = await createLeague(req.body);

  ApiResponse.created(res, league, "League created successfully");
});
```

**Note:** `ApiResponse.created()` automatically uses status 201.

---

### Example 4: Error Responses

**BEFORE:**
```typescript
// 400 Bad Request
res.status(400).json({
  success: false,
  message: "Invalid input",
});

// 401 Unauthorized
res.status(401).json({
  success: false,
  message: "Authentication required",
});

// 403 Forbidden
res.status(403).json({
  success: false,
  message: "Access denied",
});

// 404 Not Found
res.status(404).json({
  success: false,
  message: "League not found",
});

// 500 Internal Server Error
res.status(500).json({
  success: false,
  message: "Server error",
});
```

**AFTER:**
```typescript
// 400 Bad Request
ApiResponse.badRequest(res, "Invalid input");

// 401 Unauthorized
ApiResponse.unauthorized(res, "Authentication required");
// Or with default message:
ApiResponse.unauthorized(res);

// 403 Forbidden
ApiResponse.forbidden(res, "Access denied");

// 404 Not Found
ApiResponse.notFound(res, "League not found");

// 500 Internal Server Error
ApiResponse.error(res, "Server error");
```

---

## Flutter Screen Refactoring

### Step 1: Add Import

Add this import to any screen file:

```dart
import 'package:tbd_ff/utils/context_extensions.dart';
```

### Example 1: Success SnackBar

**BEFORE (7 lines):**
```dart
ScaffoldMessenger.of(context).showSnackBar(
  SnackBar(
    content: Text('League created successfully'),
    backgroundColor: Colors.green,
    duration: const Duration(seconds: 2),
  ),
);
```

**AFTER (1 line - 86% reduction):**
```dart
context.showSuccess('League created successfully');
```

---

### Example 2: Error SnackBar

**BEFORE:**
```dart
ScaffoldMessenger.of(context).showSnackBar(
  SnackBar(
    content: Text('Failed to create league'),
    backgroundColor: Colors.red,
    duration: const Duration(seconds: 3),
  ),
);
```

**AFTER:**
```dart
context.showError('Failed to create league');
```

---

### Example 3: Confirmation Dialog

**BEFORE (20+ lines):**
```dart
final confirmed = await showDialog<bool>(
  context: context,
  builder: (context) => AlertDialog(
    title: Text('Delete League'),
    content: Text('Are you sure you want to delete this league? This action cannot be undone.'),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context, false),
        child: Text('Cancel'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, true),
        style: FilledButton.styleFrom(
          backgroundColor: Colors.red,
        ),
        child: Text('Delete'),
      ),
    ],
  ),
);

if (confirmed == true) {
  // Perform delete
}
```

**AFTER (9 lines - 55% reduction):**
```dart
final confirmed = await context.showConfirmDialog(
  title: 'Delete League',
  message: 'Are you sure you want to delete this league? This action cannot be undone.',
  confirmText: 'Delete',
  cancelText: 'Cancel',
  isDestructive: true,
);

if (confirmed == true) {
  // Perform delete
}
```

---

### Example 4: Loading Dialog

**BEFORE:**
```dart
showDialog(
  context: context,
  barrierDismissible: false,
  builder: (context) => WillPopScope(
    onWillPop: () async => false,
    child: AlertDialog(
      content: Row(
        children: [
          CircularProgressIndicator(),
          SizedBox(width: 16),
          Text('Creating league...'),
        ],
      ),
    ),
  ),
);

try {
  await createLeague();
  Navigator.pop(context); // Dismiss dialog
  showSuccess();
} catch (e) {
  Navigator.pop(context); // Dismiss dialog
  showError();
}
```

**AFTER:**
```dart
final dismiss = context.showLoadingDialog(message: 'Creating league...');

try {
  await createLeague();
  dismiss();
  context.showSuccess('League created successfully');
} catch (e) {
  dismiss();
  context.showError('Failed to create league');
}
```

---

### Example 5: Info and Warning SnackBars

**NEW CAPABILITIES:**
```dart
// Info message (blue)
context.showInfo('Draft starts in 5 minutes');

// Warning message (orange)
context.showWarning('This action cannot be undone');

// Simple alert dialog
await context.showAlert(
  title: 'Success',
  message: 'Your changes have been saved',
);

// Bottom sheet
await context.showBottomSheet(
  builder: (context) => MyCustomBottomSheet(),
);
```

---

## Complete File Example: leagueController.ts

### Refactoring Checklist

For `backend/src/controllers/leagueController.ts`:

1. ✅ Add imports at top
2. ⬜ Refactor `getUserLeaguesHandler` (line 183)
3. ⬜ Refactor `getPublicLeaguesHandler` (line 217)
4. ⬜ Refactor other handlers as needed

### Estimated Impact

- **Before:** ~650 lines
- **After:** ~420 lines
- **Savings:** ~230 lines (35%)

---

## Complete File Example: league_screen.dart

### Refactoring Checklist

For `flutter_app/lib/screens/league/league_screen.dart`:

1. ✅ Add import at top
2. ⬜ Replace all `ScaffoldMessenger.of(context).showSnackBar` → `context.showSuccess/Error/Info`
3. ⬜ Replace all `showDialog` for confirmations → `context.showConfirmDialog`
4. ⬜ Replace loading dialogs → `context.showLoadingDialog`

### Search/Replace Patterns

You can use find/replace in your IDE:

**Find:**
```dart
ScaffoldMessenger.of(context).showSnackBar(
  SnackBar(
    content: Text('$1'),
    backgroundColor: Colors.green,
```

**Replace with:**
```dart
context.showSuccess('$1');
```

---

## Files to Refactor

### Backend Controllers (Examples - Top Priority)
- ✅ `backend/src/middleware/authorization.ts` (DONE - saved 220 lines)
- ⬜ `backend/src/controllers/leagueController.ts`
- ⬜ `backend/src/controllers/rosterController.ts`
- ⬜ `backend/src/controllers/tradeController.ts`

### Flutter Screens (Examples - Top Priority)
- ⬜ `flutter_app/lib/screens/league/league_screen.dart`
- ⬜ `flutter_app/lib/screens/roster/roster_management_screen.dart`
- ⬜ `flutter_app/lib/screens/trade/trade_screen.dart`
- ⬜ `flutter_app/lib/screens/waiver/waiver_screen.dart`
- ⬜ `flutter_app/lib/screens/draft/draft_setup_screen.dart`

---

## Testing

After refactoring, test:

1. **Backend:**
   - All API endpoints still return correct responses
   - Error handling works (try invalid IDs, missing auth, etc.)
   - Status codes are correct (200, 201, 400, 401, 403, 404, 500)

2. **Flutter:**
   - SnackBars appear correctly
   - Dialogs work and return correct values
   - Loading dialogs can be dismissed
   - UI matches previous behavior

---

## Questions?

If you're unsure about a refactoring:
1. Keep logging statements (`console.log`, `print`)
2. Preserve business logic exactly
3. Only change response formatting and error handling
4. Test after each file

The utilities are designed to be drop-in replacements with identical behavior!
