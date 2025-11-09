# Debounce & Throttle - Quick Start Guide

**Goal**: Fix the 4 critical performance issues in 2 hours

---

## Step 1: Install Dependencies (5 minutes)

### Backend
```bash
cd backend
npm install lodash @types/lodash node-cache @types/node-cache
```

### Frontend
No dependencies needed - utilities created in `flutter_app/lib/utils/`

---

## Step 2: Fix Critical Issue #1 - Available Players Search (20 minutes)

**File**: `flutter_app/lib/screens/players/available_players_screen.dart`

### Import the utility
Add at top of file:
```dart
import '../utils/debounce.dart';
```

### Add debouncer as class property
Add after class declaration:
```dart
class _AvailablePlayersScreenState extends State<AvailablePlayersScreen> {
  final _searchDebouncer = Debouncer(delay: Duration(milliseconds: 300));
  // ... rest of your properties
```

### Update the TextField onChanged (around line 293)
Replace:
```dart
TextField(
  onChanged: (value) {
    setState(() {
      _searchQuery = value;
    });
  },
)
```

With:
```dart
TextField(
  onChanged: (value) {
    _searchDebouncer(() {
      setState(() {
        _searchQuery = value;
      });
    });
  },
)
```

### Dispose the debouncer
Add to dispose method (or create if doesn't exist):
```dart
@override
void dispose() {
  _searchDebouncer.dispose();
  super.dispose();
}
```

**Test**: Type "Tom Brady" quickly - filter should only run once after 300ms

---

## Step 3: Fix Critical Issue #2 - Draft Room Search (20 minutes)

**File**: `flutter_app/lib/screens/draft_room_screen.dart`

### Import the utility
```dart
import '../utils/debounce.dart';
```

### Add debouncer as class property
```dart
class _DraftRoomScreenState extends State<DraftRoomScreen> {
  final _searchDebouncer = Debouncer(delay: Duration(milliseconds: 250));
  // ... rest of your properties
```

### Update search listener (around line 94-98)
Replace:
```dart
_searchController.addListener(() {
  setState(() {
    _filterPlayers();
  });
});
```

With:
```dart
_searchController.addListener(() {
  _searchDebouncer(() {
    setState(() {
      _filterPlayers();
    });
  });
});
```

### Dispose
```dart
@override
void dispose() {
  _searchDebouncer.dispose();
  _searchController.dispose();
  super.dispose();
}
```

**Test**: Search for players during draft - no lag on typing

---

## Step 4: Fix Critical Issue #3 - Auction Bid Throttling (30 minutes)

**File**: `backend/src/socket/auctionSocket.ts`

### Import lodash at top
```typescript
import { throttle } from 'lodash';
```

### Add throttle map before socket handlers (around line 20)
```typescript
// Throttle bid placements per roster to prevent spam
const bidThrottlers = new Map<number, Function>();
const BID_THROTTLE_MS = 200;
```

### Update place_bid handler (around line 164)
Replace:
```typescript
socket.on("place_bid", async (data: {
  nominationId: number;
  rosterId: number;
  maxBid: number;
  draftId: number;
}) => {
  // Existing logic
});
```

With:
```typescript
socket.on("place_bid", async (data: {
  nominationId: number;
  rosterId: number;
  maxBid: number;
  draftId: number;
}) => {
  const rosterId = data.rosterId;

  // Get or create throttled handler for this roster
  if (!bidThrottlers.has(rosterId)) {
    bidThrottlers.set(rosterId, throttle(async (bidData) => {
      try {
        // Your existing bid processing logic here
        // Just move all the existing code inside this block
        const { nominationId, rosterId, maxBid, draftId } = bidData;

        // ... all your existing bid processing code ...

      } catch (error) {
        console.error("[AuctionSocket] Error placing bid:", error);
        socket.emit("bid_error", {
          message: "Failed to place bid",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }, BID_THROTTLE_MS, { leading: true, trailing: false }));
  }

  const throttledHandler = bidThrottlers.get(rosterId)!;
  throttledHandler(data);
});
```

**Test**: Try rapid-clicking bid button - should only process once per 200ms

---

## Step 5: Fix Critical Issue #4 - Live Score Overlap Protection (30 minutes)

**File**: `backend/src/services/liveScoreService.ts`

### Add mutex variables (around line 79, before the setInterval)
```typescript
let isUpdating = false;
let updateTimeout: NodeJS.Timeout | null = null;
const UPDATE_TIMEOUT_MS = 30000; // 30 seconds max

const liveUpdateInterval = setInterval(async () => {
  // Check if previous update is still running
  if (isUpdating) {
    console.warn('[LiveScore] Previous update still running, skipping...');
    return;
  }

  isUpdating = true;

  // Safety timeout: if update takes >30s, force reset
  updateTimeout = setTimeout(() => {
    console.error('[LiveScore] Update exceeded 30s timeout, forcing reset');
    isUpdating = false;
  }, UPDATE_TIMEOUT_MS);

  try {
    await updateLiveScores(io);
  } catch (error) {
    console.error('[LiveScore] Update failed:', error);
  } finally {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
      updateTimeout = null;
    }
    isUpdating = false;
  }
}, 10 * 1000);
```

**Test**: Check logs during NFL game time - should see no overlap warnings

---

## Step 6: Verify Everything Works (15 minutes)

### Frontend Testing

```bash
cd flutter_app

# Hot reload the app
flutter run

# Test search screens:
# 1. Go to Available Players
# 2. Type quickly - should feel smooth
# 3. Go to Draft Room
# 4. Search for players - should feel smooth
```

### Backend Testing

```bash
cd backend

# Restart server
npm run dev

# Check logs for:
# - No overlap warnings in live scores
# - Bid throttling working (if testing auction)
```

---

## Visual Confirmation

### Before Fix (What You're Experiencing Now)
- Typing in search feels laggy
- Each keystroke causes visible UI freeze
- Can spam bid button and server gets overwhelmed
- Live score updates occasionally overlap

### After Fix (What You Should Experience)
- Typing in search feels instant and smooth
- UI stays responsive while typing
- Bid button prevents spam automatically
- Live score updates never overlap

---

## If Something Breaks

### Issue: "Cannot find module '../utils/debounce'"
**Solution**: Make sure files were created:
- `flutter_app/lib/utils/debounce.dart`
- `flutter_app/lib/utils/throttle.dart`

### Issue: "Cannot find module 'lodash'"
**Solution**: Run `npm install lodash @types/lodash` in backend folder

### Issue: Search still feels laggy
**Solution**: Increase debounce delay from 300ms to 500ms

### Issue: Bids not going through
**Solution**: Check console for errors, may need to adjust throttle time from 200ms to 100ms

---

## Success Metrics

After these fixes, you should see:

✅ Search typing feels smooth (no lag)
✅ No duplicate API calls in network tab while typing
✅ Bid spam is prevented automatically
✅ No live score overlap warnings in logs

---

## Next Steps (Optional)

If you have time, implement the High Priority fixes:

5. **Draft Chat Rate Limiting** (15 min) - See main doc section #5
6. **Draft Provider Filter Debounce** (15 min) - See main doc section #6
7. **League Chat Debounce** (10 min) - See main doc section #7

But the 4 critical fixes above will give you 80% of the benefit!

---

## Need Help?

If you get stuck on any step, tell me:
1. Which step you're on
2. What error you're seeing
3. I'll help you fix it

The utilities are already created and ready to use. Just follow the steps above!

---

*Total Time: ~2 hours*
*Impact: Massive improvement in search performance and server stability*
