# Draft Provider Refactor - Migration Guide

## Overview

The monolithic `DraftProvider` (1,634 lines) has been refactored into 5 focused, single-responsibility providers following clean architecture principles.

## Architecture Change

### Before (Monolithic)
```
DraftProvider (1,634 lines)
  ├── Draft State
  ├── Socket Management
  ├── Derby Logic
  ├── Timer Management
  └── Player Filtering
```

### After (Focused Providers)
```
├── DraftStateProvider (488 lines)
│   └── Core draft data, picks, order, status
│
├── DraftSocketProvider (224 lines)
│   └── WebSocket connections, event listeners
│
├── DraftTimerProvider (253 lines)
│   └── Pick timer, chess timer, UI updates
│
├── DraftDerbyProvider (509 lines)
│   └── Derby selections, turn tracking, timer
│
└── DraftPlayerProvider (140 lines)
    └── Available players, filtering, pagination
```

**Total: 1,614 lines** (20 lines saved from deduplication)

---

## New Provider Responsibilities

### 1. DraftStateProvider
**Purpose:** Manages core draft data and state

**Responsibilities:**
- Draft model and metadata
- Pick history (`_draftPicks`)
- Draft order (`_draftOrder`)
- Current turn tracking
- Draft status (not_started, in_progress, paused, completed)
- Chat messages
- CRUD operations (create, update, start, pause, resume, reset)

**Key Methods:**
- `createDraft()` - Create new draft
- `updateDraft()` - Update draft settings
- `loadDraftByLeague()` - Load draft data
- `setDraftOrder()` - Set/randomize draft order
- `startDraft()` / `pauseDraft()` / `resumeDraft()` - Draft control
- `makePick()` - Make draft pick
- `updateDraftFromSocket()` - Update from socket events
- `addPickFromSocket()` - Add pick from socket

**Getters:**
- `currentDraft` - Draft model
- `draftPicks` - List of picks
- `draftOrder` - Draft order
- `chatMessages` - Chat messages
- `status` - DraftStatus enum
- `errorMessage` - Error text

---

### 2. DraftSocketProvider
**Purpose:** Manages WebSocket lifecycle and events

**Responsibilities:**
- Socket connection/disconnection
- Event listener registration
- Real-time event broadcasting to other providers
- Socket state tracking

**Key Methods:**
- `initializeWithToken()` - Initialize with auth token
- `connect()` / `disconnect()` - Socket lifecycle
- `joinDraft()` / `leaveDraft()` - Join/leave draft room
- `sendChatMessage()` - Send chat via socket
- `toggleAutodraft()` - Toggle autodraft via socket
- `clearCallbacks()` - Clear all callback references

**Event Callbacks:**
Set these in consuming providers to receive events:
- `onPickMade` - Pick was made
- `onStatusChanged` - Draft status changed
- `onOrderUpdated` - Draft order updated
- `onChatMessage` - Chat message received
- `onTimerUpdate` - Timer sync from server
- `onChessTimerUpdate` - Chess timer update
- `onDerbyUpdate` - Derby state update
- `onDerbySelectionMade` - Derby selection made
- `onDerbyTurnChanged` - Derby turn changed
- `onDerbyTimeout` - Derby timeout occurred

**Getters:**
- `isConnected` - Socket connection status

---

### 3. DraftTimerProvider
**Purpose:** Manages all timer functionality

**Responsibilities:**
- Pick timer countdown
- Chess timer budgets per roster
- Server time synchronization
- UI timer updates (1 second intervals)
- Timer pause/resume
- Timer expiration handling

**Key Methods:**
- `handleTimerUpdate()` - Sync from server
- `handleDraftStarted()` - Start timer on draft start
- `handleDraftPaused()` - Pause timer
- `handleDraftResumed()` - Resume timer
- `handleChessTimerUpdate()` - Update roster time
- `handleTimeAdjusted()` - Commissioner adjusted time
- `initializeDeadline()` - Initialize from existing draft
- `initializeChessTimerState()` - Initialize chess timers
- `adjustRosterTime()` - Adjust roster time (commissioner)

**Getters:**
- `timeRemaining` - Duration until pick deadline
- `isChessTimerMode` - Chess timer enabled
- `getRosterTimeRemaining(rosterId)` - Roster's remaining time

---

### 4. DraftDerbyProvider
**Purpose:** Manages draft derby (draft position selection)

**Responsibilities:**
- Derby state and participants
- Derby turn tracking
- Selection validation
- Derby timer
- Derby completion
- Skipped roster tracking

**Key Methods:**
- `loadDerby()` - Load derby data
- `createDerby()` - Create new derby (commissioner)
- `startDerby()` - Start derby (commissioner)
- `makeDerbySelection()` - Make position selection
- `skipDerbyTurn()` - Skip turn (timeout or commissioner)
- `handleDerbyUpdate()` - Update from socket
- `handleDerbySelectionMade()` - Selection made event
- `handleDerbyTurnChanged()` - Turn changed event
- `handleDerbyCompleted()` - Derby completed event
- `handleDerbyTimeout()` - Timeout event

**Getters:**
- `currentDerby` - DraftDerbyWithDetails model
- `isDerbyActive` - Derby in progress
- `isDerbyCompleted` - Derby completed
- `derbyTimeRemaining` - Duration until turn deadline
- `isRosterSkipped(rosterId)` - Check if roster skipped
- `canRosterMakeDerbyPick(rosterId)` - Can roster pick now
- `onlySkippedRemaining` - Only skipped rosters remain

---

### 5. DraftPlayerProvider
**Purpose:** Manages available players and filtering

**Responsibilities:**
- Available players list
- Position/team/search filters
- Player sorting
- Pagination
- Player removal on pick

**Key Methods:**
- `loadAvailablePlayers()` - Load initial players
- `filterPlayers()` - Apply position/team/search filters
- `loadMorePlayers()` - Load next page
- `removePlayer()` - Remove picked player
- `handlePickMade()` - Remove player when picked
- `reloadAfterReset()` - Reload after draft reset
- `clearFilters()` - Clear all filters

**Getters:**
- `availablePlayers` - List of available players
- `hasMorePlayers` - More pages available
- `isLoadingMorePlayers` - Loading next page
- `totalPlayersCount` - Total available
- `loadedPlayersCount` - Currently loaded
- `currentPositionFilter` - Active position filter
- `currentTeamFilter` - Active team filter
- `currentSearchFilter` - Active search filter

---

## Migration Steps

### Step 1: Update Imports
Replace old import:
```dart
import '../providers/draft_provider.dart';
```

With new imports (as needed):
```dart
import '../providers/draft_state_provider.dart';
import '../providers/draft_socket_provider.dart';
import '../providers/draft_timer_provider.dart';
import '../providers/draft_derby_provider.dart';
import '../providers/draft_player_provider.dart';
```

### Step 2: Update Provider.of / Consumer Calls

**Before:**
```dart
final draftProvider = Provider.of<DraftProvider>(context);
```

**After (multiple providers):**
```dart
final draftState = Provider.of<DraftStateProvider>(context);
final draftSocket = Provider.of<DraftSocketProvider>(context);
final draftTimer = Provider.of<DraftTimerProvider>(context);
final draftDerby = Provider.of<DraftDerbyProvider>(context);
final draftPlayer = Provider.of<DraftPlayerProvider>(context);
```

### Step 3: Update Method Calls

**Draft Operations:**
```dart
// Before
draftProvider.createDraft(...)
draftProvider.startDraft(...)
draftProvider.makePick(...)

// After
draftState.createDraft(...)
draftState.startDraft(...)
draftState.makePick(...)
```

**Socket Operations:**
```dart
// Before
draftProvider.joinDraftRoom(...)
draftProvider.leaveDraftRoom(...)

// After
draftSocket.joinDraft(...)
draftSocket.leaveDraft(...)
```

**Timer Operations:**
```dart
// Before
draftProvider.timeRemaining
draftProvider.getRosterTimeRemaining(rosterId)

// After
draftTimer.timeRemaining
draftTimer.getRosterTimeRemaining(rosterId)
```

**Derby Operations:**
```dart
// Before
draftProvider.loadDerby(...)
draftProvider.makeDerbySelection(...)
draftProvider.currentDerby

// After
draftDerby.loadDerby(...)
draftDerby.makeDerbySelection(...)
draftDerby.currentDerby
```

**Player Operations:**
```dart
// Before
draftProvider.filterPlayers(...)
draftProvider.availablePlayers
draftProvider.loadMorePlayers(...)

// After
draftPlayer.filterPlayers(...)
draftPlayer.availablePlayers
draftPlayer.loadMorePlayers(...)
```

### Step 4: Connect Providers via Socket Events

The providers communicate through socket events. Set up event forwarding:

```dart
// In a coordinator or initialization code
final draftSocket = Provider.of<DraftSocketProvider>(context, listen: false);
final draftState = Provider.of<DraftStateProvider>(context, listen: false);
final draftTimer = Provider.of<DraftTimerProvider>(context, listen: false);
final draftDerby = Provider.of<DraftDerbyProvider>(context, listen: false);
final draftPlayer = Provider.of<DraftPlayerProvider>(context, listen: false);

// Forward socket events to appropriate providers
draftSocket.onPickMade = (data) {
  if (data['draft'] != null) {
    draftState.updateDraftFromSocket(Draft.fromJson(data['draft']));
  }
  if (data['pick'] != null) {
    final pick = DraftPick.fromJson(data['pick']);
    draftState.addPickFromSocket(pick);
    draftPlayer.handlePickMade(pick);
  }
};

draftSocket.onTimerUpdate = (data) {
  draftTimer.handleTimerUpdate(data);
};

draftSocket.onDerbySelectionMade = (data) {
  draftDerby.handleDerbySelectionMade(data);
};
```

---

## Key Differences

### State Access
**Before:**
```dart
// Single provider for everything
final draft = draftProvider.currentDraft;
final picks = draftProvider.draftPicks;
final players = draftProvider.availablePlayers;
final timeLeft = draftProvider.timeRemaining;
final derby = draftProvider.currentDerby;
```

**After:**
```dart
// Specific providers for specific concerns
final draft = draftState.currentDraft;
final picks = draftState.draftPicks;
final players = draftPlayer.availablePlayers;
final timeLeft = draftTimer.timeRemaining;
final derby = draftDerby.currentDerby;
```

### Socket Connection
**Before:**
```dart
draftProvider.joinDraftRoom(
  draftId: draftId,
  userId: userId,
  username: username,
);
```

**After:**
```dart
// Initialize socket with token first
await draftSocket.initializeWithToken(token);
await draftSocket.connect();

draftSocket.joinDraft(
  draftId: draftId,
  userId: userId,
  username: username,
);
```

### Multiple Consumers
Use `Consumer` or `Selector` for granular rebuilds:

```dart
// Listen to only what you need
Consumer<DraftTimerProvider>(
  builder: (context, timer, child) {
    return Text('Time: ${timer.timeRemaining}');
  },
)

// Or use Selector for even more granularity
Selector<DraftStateProvider, int>(
  selector: (_, provider) => provider.draftPicks.length,
  builder: (context, pickCount, child) {
    return Text('$pickCount picks made');
  },
)
```

---

## Benefits

### 1. **Single Responsibility**
Each provider has one clear purpose - easier to understand and maintain.

### 2. **Reduced Complexity**
Instead of 1,634 lines to navigate, each provider is 140-509 lines.

### 3. **Better Testing**
Test each provider in isolation with mock dependencies.

### 4. **Performance**
Use `Selector` to rebuild only when specific data changes.

### 5. **Easier Debugging**
Isolated state makes it easier to track down issues.

### 6. **Team Collaboration**
Multiple developers can work on different providers simultaneously.

---

## Testing Checklist

### DraftStateProvider
- [ ] Create draft with all settings
- [ ] Update draft settings
- [ ] Load draft by league ID
- [ ] Set draft order (manual and random)
- [ ] Start draft
- [ ] Pause draft
- [ ] Resume draft
- [ ] Reset draft
- [ ] Make pick
- [ ] Send chat message
- [ ] Handle socket updates (draft, picks, order)
- [ ] Error handling

### DraftSocketProvider
- [ ] Connect to WebSocket
- [ ] Disconnect from WebSocket
- [ ] Join draft room
- [ ] Leave draft room
- [ ] Send chat message via socket
- [ ] Toggle autodraft via socket
- [ ] Receive all event types
- [ ] Callback forwarding works
- [ ] Clear callbacks on dispose

### DraftTimerProvider
- [ ] Initialize deadline from draft
- [ ] Handle timer updates from server
- [ ] Calculate time remaining accurately
- [ ] Start UI timer (1 second intervals)
- [ ] Pause timer
- [ ] Resume timer
- [ ] Initialize chess timer state
- [ ] Update roster time from socket
- [ ] Adjust roster time (commissioner)
- [ ] Timer cleanup on dispose

### DraftDerbyProvider
- [ ] Load derby data
- [ ] Create derby (commissioner)
- [ ] Start derby (commissioner)
- [ ] Make derby selection
- [ ] Skip derby turn
- [ ] Handle derby update from socket
- [ ] Handle selection made from socket
- [ ] Handle turn changed from socket
- [ ] Handle derby completed from socket
- [ ] Handle derby timeout from socket
- [ ] Derby timer updates
- [ ] Skipped roster tracking
- [ ] Can roster make pick logic

### DraftPlayerProvider
- [ ] Load available players (first page)
- [ ] Filter by position
- [ ] Filter by team
- [ ] Filter by search query
- [ ] Load more players (pagination)
- [ ] Remove player when picked
- [ ] Handle pick made from socket
- [ ] Reload after draft reset
- [ ] Clear filters
- [ ] Debounced filtering

### Integration Tests
- [ ] All providers work together
- [ ] Socket events route to correct providers
- [ ] State updates trigger UI rebuilds
- [ ] Multiple consumers don't conflict
- [ ] Memory leaks fixed (timers disposed)
- [ ] No duplicate event handling

### Regression Tests
- [ ] Draft room screen works
- [ ] Derby screen works
- [ ] Auction integration still works
- [ ] Chat still works
- [ ] Autodraft still works
- [ ] Chess timer still works
- [ ] Commissioner actions still work
- [ ] Mobile and web both work

---

## Common Issues & Solutions

### Issue 1: "Provider not found"
**Cause:** Forgot to add provider to `main.dart`

**Solution:** Ensure all 5 providers are in `MultiProvider`:
```dart
MultiProvider(
  providers: [
    // ...
    ChangeNotifierProvider(create: (_) => DraftStateProvider()),
    ChangeNotifierProvider(create: (_) => DraftSocketProvider()),
    ChangeNotifierProvider(create: (_) => DraftTimerProvider()),
    ChangeNotifierProvider(create: (_) => DraftDerbyProvider()),
    ChangeNotifierProvider(create: (_) => DraftPlayerProvider()),
  ],
)
```

### Issue 2: "Socket events not received"
**Cause:** Forgot to set up event callbacks

**Solution:** Connect socket events to provider handlers:
```dart
draftSocket.onPickMade = (data) {
  draftState.updateDraftFromSocket(...);
  draftPlayer.handlePickMade(...);
};
```

### Issue 3: "Timers keep running after dispose"
**Cause:** Timer not cancelled in dispose()

**Solution:** Each timer provider has proper cleanup:
```dart
@override
void dispose() {
  _timer?.cancel();
  _timer = null;
  super.dispose();
}
```

### Issue 4: "State not updating"
**Cause:** Forgot to call `notifyListeners()`

**Solution:** All state changes call `notifyListeners()`:
```dart
_draftPicks.add(pick);
notifyListeners(); // ← Don't forget this!
```

### Issue 5: "Multiple rebuilds"
**Cause:** Using `Provider.of` with `listen: true` unnecessarily

**Solution:** Use `Selector` or `Consumer` for specific data:
```dart
// Instead of:
final draftState = Provider.of<DraftStateProvider>(context);

// Use:
Selector<DraftStateProvider, Draft?>(
  selector: (_, provider) => provider.currentDraft,
  builder: (context, draft, child) => ...
)
```

---

## Rollback Plan

If issues arise, the old `DraftProvider` is still available in `main.dart`:

```dart
// Keep old provider active temporarily
ChangeNotifierProvider(create: (_) => DraftProvider()),
```

To rollback:
1. Comment out new providers in `main.dart`
2. Revert screen imports to use `DraftProvider`
3. Test functionality
4. Fix issues in new providers
5. Re-enable new providers

---

## Next Steps

1. ✅ Create 5 new providers
2. ✅ Update `main.dart` with MultiProvider
3. ⏳ Update `draft_room_screen.dart` (IN PROGRESS)
4. ⏳ Update `draft_derby_screen.dart` (IN PROGRESS)
5. ⏳ Test all functionality
6. ⏳ Remove old `DraftProvider` after verification
7. ⏳ Update any other screens using DraftProvider

---

## Questions?

**Q: Do I need all 5 providers in every screen?**
A: No! Only import and use the providers you need. For example, `draft_derby_screen.dart` only needs `DraftDerbyProvider` and `DraftSocketProvider`.

**Q: Can providers depend on each other?**
A: Yes, via socket events or direct `Provider.of()` calls. Prefer event-based communication to reduce coupling.

**Q: What if I need data from multiple providers?**
A: Use multiple `Consumer` widgets or nest them. Or use `Consumer2`, `Consumer3`, etc.:
```dart
Consumer2<DraftStateProvider, DraftTimerProvider>(
  builder: (context, state, timer, child) {
    return Text('Pick ${state.currentDraft?.currentPick} - ${timer.timeRemaining}');
  },
)
```

**Q: Performance impact of 5 providers vs 1?**
A: **Better performance!** Rebuilds are more targeted. Use `Selector` to rebuild only when specific fields change.

---

## File Structure

```
lib/providers/
├── draft_provider.dart              (OLD - 1,634 lines - will be removed)
├── draft_state_provider.dart        (NEW - 488 lines)
├── draft_socket_provider.dart       (NEW - 224 lines)
├── draft_timer_provider.dart        (NEW - 253 lines)
├── draft_derby_provider.dart        (NEW - 509 lines)
└── draft_player_provider.dart       (NEW - 140 lines)
```

---

**Generated:** 2025-01-08
**Refactor:** DraftProvider → 5 focused providers
**Total Lines:** 1,634 → 1,614 (20 lines saved)
