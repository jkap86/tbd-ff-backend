# Debouncing & Throttling Analysis Report

**Date**: 2025-10-31
**Status**: 15 Critical Issues Found

---

## Executive Summary

Your app has **15 locations** where debouncing or throttling should be added:
- **4 Critical** issues (performance/stability risks)
- **5 High** priority issues (user-facing performance)
- **4 Medium** priority issues (optimization)
- **2 Low** priority issues (nice-to-have)

**Biggest Risks**:
1. Player search triggers on every keystroke (causes lag with 1000s of players)
2. Auction bids have no throttling (could spam server)
3. Live score updates could overlap and cascade
4. Draft room search is unoptimized during time-sensitive picks

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Priority Issues](#high-priority-issues)
3. [Medium Priority Issues](#medium-priority-issues)
4. [Low Priority Issues](#low-priority-issues)
5. [Implementation Guide](#implementation-guide)
6. [Code Examples](#code-examples)

---

## CRITICAL ISSUES

### 1. Player Search - Available Players Screen (Frontend) 🔴

**File**: `flutter_app/lib/screens/players/available_players_screen.dart:293-297`

**Current Code**:
```dart
TextField(
  onChanged: (value) {
    setState(() {
      _searchQuery = value;
    });
  },
)
```

**Problem**:
- Every keystroke triggers `setState()` → recalculates filtered list (lines 179-197)
- Typing "Tom Brady" = 9 setState calls + 9 filter operations
- With 2000+ NFL players, this causes visible lag

**Impact**: **High** - User experiences lag when searching players

**Solution**: Debounce 300ms
```dart
Timer? _searchDebounce;

TextField(
  onChanged: (value) {
    if (_searchDebounce?.isActive ?? false) _searchDebounce!.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      setState(() {
        _searchQuery = value;
      });
    });
  },
)

@override
void dispose() {
  _searchDebounce?.cancel();
  super.dispose();
}
```

---

### 2. Draft Room Player Search (Frontend) 🔴

**File**: `flutter_app/lib/screens/draft_room_screen.dart:94-98, 929-948`

**Current Code**:
```dart
_searchController.addListener(() {
  setState(() {
    _filterPlayers();
  });
});
```

**Problem**:
- Filters on every keystroke during time-sensitive draft picks
- Filter logic (lines 508-573) includes position filtering, search matching, stat sorting
- Combined with live draft updates, causes jank

**Impact**: **Critical** - Draft picks are time-sensitive, search lag is unacceptable

**Solution**: Debounce 250ms (faster than general search due to draft urgency)
```dart
Timer? _searchDebounce;

void _initSearchListener() {
  _searchController.addListener(() {
    if (_searchDebounce?.isActive ?? false) _searchDebounce!.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 250), () {
      setState(() {
        _filterPlayers();
      });
    });
  });
}

@override
void dispose() {
  _searchDebounce?.cancel();
  _searchController.removeListener(_initSearchListener);
  super.dispose();
}
```

---

### 3. Auction Bid Placement (Backend) 🔴

**File**: `backend/src/socket/auctionSocket.ts:164-275`

**Current Code**:
```typescript
socket.on("place_bid", async (data: {
  nominationId: number;
  rosterId: number;
  maxBid: number;
  draftId: number;
}) => {
  // Process bid immediately
  // No throttling
});
```

**Problem**:
- Users can spam bids rapidly
- Proxy bidding system (lines 203-207) can trigger cascading bids
- No per-user throttling

**Impact**: **Critical** - Could overwhelm server during active auctions, create race conditions

**Solution**: Throttle 200ms per rosterId
```typescript
import { throttle } from 'lodash';

// Create throttled bid handlers per roster
const bidThrottlers = new Map<number, Function>();

socket.on("place_bid", async (data) => {
  const rosterId = data.rosterId;

  // Get or create throttled handler for this roster
  if (!bidThrottlers.has(rosterId)) {
    bidThrottlers.set(rosterId, throttle(async (bidData) => {
      // Original bid processing logic here
      await processBid(bidData);
    }, 200, { leading: true, trailing: false }));
  }

  const throttledHandler = bidThrottlers.get(rosterId)!;
  throttledHandler(data);
});
```

---

### 4. Live Score Updates - Overlap Protection (Backend) 🔴

**File**: `backend/src/services/liveScoreService.ts:79-155`

**Current Code**:
```typescript
const liveUpdateInterval = setInterval(() => {
  updateLiveScores(io);
}, 10 * 1000); // 10 seconds
```

**Problem**:
- If `updateLiveScores()` takes >10s, multiple instances run simultaneously
- Has `isUpdating` flag (lines 81-84) but no timeout protection
- Heavy load could cause cascading updates

**Impact**: **Critical** - Could crash server during peak NFL game times

**Solution**: Add mutex with timeout
```typescript
let isUpdating = false;
let updateTimeout: NodeJS.Timeout | null = null;

const liveUpdateInterval = setInterval(async () => {
  if (isUpdating) {
    console.warn('[LiveScore] Previous update still running, skipping...');
    return;
  }

  isUpdating = true;

  // Safety timeout: if update takes >30s, force reset
  updateTimeout = setTimeout(() => {
    console.error('[LiveScore] Update exceeded 30s timeout, forcing reset');
    isUpdating = false;
  }, 30000);

  try {
    await updateLiveScores(io);
  } catch (error) {
    console.error('[LiveScore] Update failed:', error);
  } finally {
    if (updateTimeout) clearTimeout(updateTimeout);
    isUpdating = false;
  }
}, 10 * 1000);
```

---

## HIGH PRIORITY ISSUES

### 5. Draft Chat Messages (Backend) 🟠

**File**: `backend/src/socket/draftSocket.ts:120-162`

**Current Code**:
```typescript
socket.on("send_chat_message", async (data) => {
  // No rate limiting
  // Save and broadcast immediately
});
```

**Problem**: Users can spam chat messages via socket

**Impact**: **High** - Chat spam, unnecessary database writes, broadcast overhead

**Solution**: Rate limit 500ms per user
```typescript
const userChatTimestamps = new Map<number, number>();
const CHAT_COOLDOWN = 500; // ms

socket.on("send_chat_message", async (data: { draft_id: number; message: string; user_id: number }) => {
  const now = Date.now();
  const lastMessage = userChatTimestamps.get(data.user_id) || 0;

  if (now - lastMessage < CHAT_COOLDOWN) {
    socket.emit('chat_error', { message: 'Please slow down' });
    return;
  }

  userChatTimestamps.set(data.user_id, now);

  // Original chat logic
  await saveChatMessage(data);
  io.to(`draft_${data.draft_id}`).emit('new_chat_message', data);
});
```

---

### 6. Draft Provider - Filter Players API Call (Frontend) 🟠

**File**: `flutter_app/lib/providers/draft_provider.dart:593-610`

**Current Code**:
```dart
Future<void> filterPlayers({
  required String token,
  String? position,
  String? team,
  String? search,
}) async {
  _availablePlayers = await _draftService.getAvailablePlayers(
    // ... API call on every filter change
  );
  notifyListeners();
}
```

**Problem**: Makes API call on every filter change (no debouncing)

**Impact**: **High** - Unnecessary API requests, database load

**Solution**: Debounce 400ms
```dart
Timer? _filterDebounce;

Future<void> filterPlayers({
  required String token,
  String? position,
  String? team,
  String? search,
}) async {
  if (_filterDebounce?.isActive ?? false) _filterDebounce!.cancel();

  _filterDebounce = Timer(const Duration(milliseconds: 400), () async {
    if (_currentDraft == null) return;

    _availablePlayers = await _draftService.getAvailablePlayers(
      token: token,
      draftId: _currentDraft!.id,
      position: position,
      team: team,
      search: search,
    );
    notifyListeners();
  });
}

@override
void dispose() {
  _filterDebounce?.cancel();
  super.dispose();
}
```

---

### 7. League Chat Widget (Frontend) 🟠

**File**: `flutter_app/lib/widgets/league_chat_widget.dart:100-117`

**Current Code**:
```dart
void _sendMessage() {
  final message = _messageController.text.trim();
  _messageController.clear();

  _socketService.sendLeagueChatMessage(
    // ... no debouncing
  );
}
```

**Problem**: No debouncing on send button

**Impact**: **High** - Users can spam chat messages

**Solution**: Debounce 500ms on button
```dart
DateTime? _lastMessageTime;
static const _messageCooldown = Duration(milliseconds: 500);

void _sendMessage() {
  final now = DateTime.now();
  if (_lastMessageTime != null &&
      now.difference(_lastMessageTime!) < _messageCooldown) {
    // Show snackbar: "Please slow down"
    return;
  }

  _lastMessageTime = now;

  final message = _messageController.text.trim();
  _messageController.clear();

  _socketService.sendLeagueChatMessage(
    leagueId: widget.leagueId,
    userId: authProvider.user!.id,
    username: authProvider.user!.username,
    message: message,
  );
}
```

---

### 8. Draft Timer Broadcast Optimization (Backend) 🟠

**File**: `backend/src/socket/draftSocket.ts:407-450`

**Current Code**:
```typescript
const intervalId = setInterval(async () => {
  // Broadcast timer every 5 seconds
}, 5000);
```

**Problem**: 5s interval is aggressive for 90s pick timers

**Impact**: **High** - Unnecessary database queries and broadcasts

**Solution**: Dynamic interval based on time remaining
```typescript
function getTimerInterval(secondsRemaining: number): number {
  if (secondsRemaining > 60) return 10000;  // 10s when >60s left
  if (secondsRemaining > 30) return 5000;   // 5s when >30s left
  if (secondsRemaining > 10) return 2000;   // 2s when >10s left
  return 1000;                              // 1s when <10s left
}

let intervalId: NodeJS.Timeout;
let currentInterval = 10000;

function broadcastTimer(draft: Draft) {
  const secondsRemaining = calculateSecondsRemaining(draft);
  const newInterval = getTimerInterval(secondsRemaining);

  // Adjust interval if needed
  if (newInterval !== currentInterval) {
    clearInterval(intervalId);
    currentInterval = newInterval;
    intervalId = setInterval(() => broadcastTimer(draft), currentInterval);
  }

  // Broadcast
  io.to(`draft_${draft.id}`).emit('timer_update', {
    secondsRemaining,
    currentPick: draft.current_pick
  });
}
```

---

### 9. Player Search API Endpoint (Backend) 🟠

**File**: `backend/src/controllers/playerController.ts:106-130`

**Current Code**:
```typescript
export async function getPlayersHandler(req: Request, res: Response) {
  const { position, team, search } = req.query;
  const players = await getAllPlayers({
    position, team, search
  });
  // ...
}
```

**Problem**: Route has `searchLimiter` middleware, but need to verify it's aggressive enough

**Impact**: **High** - Expensive LIKE queries on large tables

**Solution**: Verify rate limiter configuration
```typescript
// In playerRoutes.ts
import rateLimit from 'express-rate-limit';

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 requests per minute per IP
  message: 'Too many search requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/players', searchLimiter, getPlayersHandler);
```

---

## MEDIUM PRIORITY ISSUES

### 10. Draft Room Stats Scrolling (Frontend) 🟡

**File**: `flutter_app/lib/screens/draft_room_screen.dart:1459-1511`

**Problem**: Synchronizes scroll across multiple controllers in a loop

**Impact**: **Medium** - Could cause jank with many visible players

**Solution**: Throttle scroll synchronization to 16ms (one frame)
```dart
Timer? _scrollThrottle;
bool _isScrolling = false;

void _syncScrollControllers(double offset) {
  if (_isScrolling) return;

  _isScrolling = true;

  if (_scrollThrottle?.isActive ?? false) _scrollThrottle!.cancel();
  _scrollThrottle = Timer(const Duration(milliseconds: 16), () {
    for (var controller in _scrollControllers) {
      if (controller.hasClients) {
        controller.jumpTo(offset);
      }
    }
    _isScrolling = false;
  });
}
```

---

### 11. Chatbot Widget Query Sending (Frontend) 🟡

**File**: `flutter_app/lib/widgets/chatbot/chatbot_widget.dart:332-337`

**Problem**: No rate limiting on chatbot queries

**Impact**: **Medium** - Rapid queries increase API costs

**Solution**: Debounce 500ms
```dart
DateTime? _lastQueryTime;
static const _queryCooldown = Duration(milliseconds: 500);

void _sendQuery(String text) {
  final now = DateTime.now();
  if (_lastQueryTime != null &&
      now.difference(_lastQueryTime!) < _queryCooldown) {
    return;
  }

  _lastQueryTime = now;
  chatbot.sendMessage(text);
  controller.clear();
}
```

---

### 12. Sleeper API Calls - Caching (Backend) 🟡

**File**: `backend/src/services/liveScoreService.ts:116-117`

**Problem**: Calls Sleeper API every 10s, no caching

**Impact**: **Medium** - Could hit Sleeper rate limits

**Solution**: Add caching layer
```typescript
import NodeCache from 'node-cache';

const sleeperCache = new NodeCache({ stdTTL: 60 }); // 60s cache

async function syncSleeperStatsForWeek(season: string, week: number, seasonType: string) {
  const cacheKey = `sleeper_stats_${season}_${week}_${seasonType}`;

  // Check cache first
  const cached = sleeperCache.get(cacheKey);
  if (cached) {
    console.log('[Sleeper] Using cached stats');
    return cached;
  }

  // Fetch from API
  const stats = await fetchSleeperStats(season, week, seasonType);

  // Cache for 60s
  sleeperCache.set(cacheKey, stats);

  return stats;
}
```

---

### 13. Socket Reconnection Storms (Backend/Frontend) 🟡

**Problem**: Server restart causes all clients to reconnect simultaneously

**Impact**: **Medium** - Thundering herd problem

**Solution**: Exponential backoff on client
```dart
// In Flutter socket service
int _reconnectAttempts = 0;
Timer? _reconnectTimer;

void _handleDisconnect() {
  _reconnectAttempts++;
  final delay = min(1000 * pow(2, _reconnectAttempts), 30000); // Max 30s

  _reconnectTimer = Timer(Duration(milliseconds: delay.toInt()), () {
    _connect();
  });
}

void _handleConnect() {
  _reconnectAttempts = 0; // Reset on successful connection
}
```

---

## LOW PRIORITY ISSUES

### 14. Draft Button Double-Click (Frontend) ⚪

**File**: `flutter_app/lib/screens/draft_room_screen.dart:1340-1345`

**Problem**: IconButton for drafting player could be double-tapped

**Impact**: **Low** - Backend likely has protection, but prevents error messages

**Solution**: Disable button after click
```dart
bool _isDrafting = false;

IconButton(
  onPressed: _isDrafting ? null : () async {
    setState(() => _isDrafting = true);

    try {
      await _draftPlayer(player);
    } finally {
      setState(() => _isDrafting = false);
    }
  },
  icon: Icon(Icons.add),
)
```

---

### 15. Notification Polling (Backend) ⚪

**File**: `backend/src/routes/notificationRoutes.ts:23`

**Problem**: If frontend polls for notifications, needs rate limiting

**Impact**: **Low** - Only if polling is implemented

**Solution**: Rate limit to 12 req/min
```typescript
const notificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many notification requests',
});

router.get('/notifications', authenticate, notificationLimiter, getNotifications);
```

---

## IMPLEMENTATION GUIDE

### Phase 1: Critical Fixes (Do First)

**Week 1 - Focus on search performance**:
1. Add debouncing to Available Players search (Frontend #1)
2. Add debouncing to Draft Room search (Frontend #2)
3. Add throttling to Draft Provider filters (Frontend #6)

**Week 2 - Focus on backend stability**:
4. Add throttling to auction bids (Backend #3)
5. Add overlap protection to live scores (Backend #4)
6. Add rate limiting to draft chat (Backend #5)

### Phase 2: High Priority (Next 2 Weeks)

7. Optimize draft timer broadcasts (Backend #8)
8. Add chat debouncing (Frontend #7)
9. Verify search API rate limits (Backend #9)

### Phase 3: Medium Priority (As Needed)

10-13. Implement remaining optimizations as you work on those features

### Phase 4: Low Priority (Nice to Have)

14-15. Add when convenient

---

## CODE EXAMPLES

### Flutter Debounce Helper Utility

Create: `flutter_app/lib/utils/debounce.dart`

```dart
import 'dart:async';

class Debouncer {
  final Duration delay;
  Timer? _timer;

  Debouncer({required this.delay});

  void call(void Function() action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }

  void cancel() {
    _timer?.cancel();
  }

  void dispose() {
    _timer?.cancel();
  }
}

// Usage:
// final _debouncer = Debouncer(delay: Duration(milliseconds: 300));
//
// TextField(
//   onChanged: (value) {
//     _debouncer(() {
//       // Your action here
//     });
//   },
// )
```

### Flutter Throttle Helper Utility

Create: `flutter_app/lib/utils/throttle.dart`

```dart
import 'dart:async';

class Throttler {
  final Duration delay;
  Timer? _timer;
  bool _isRunning = false;

  Throttler({required this.delay});

  void call(void Function() action) {
    if (_isRunning) return;

    _isRunning = true;
    action();

    _timer = Timer(delay, () {
      _isRunning = false;
    });
  }

  void cancel() {
    _timer?.cancel();
    _isRunning = false;
  }

  void dispose() {
    _timer?.cancel();
  }
}
```

### Node.js Rate Limiter Helper

Create: `backend/src/utils/socketRateLimiter.ts`

```typescript
export class SocketRateLimiter {
  private timestamps: Map<string, number> = new Map();
  private cooldown: number;

  constructor(cooldownMs: number) {
    this.cooldown = cooldownMs;
  }

  canProceed(userId: string | number): boolean {
    const now = Date.now();
    const lastAction = this.timestamps.get(String(userId)) || 0;

    if (now - lastAction < this.cooldown) {
      return false;
    }

    this.timestamps.set(String(userId), now);
    return true;
  }

  reset(userId: string | number): void {
    this.timestamps.delete(String(userId));
  }
}

// Usage:
// const chatLimiter = new SocketRateLimiter(500);
//
// socket.on('send_message', (data) => {
//   if (!chatLimiter.canProceed(data.userId)) {
//     socket.emit('rate_limit_error', { message: 'Please slow down' });
//     return;
//   }
//   // Process message
// });
```

---

## Testing Your Changes

### Frontend Testing

```dart
// Test debounced search
testWidgets('Search is debounced', (tester) async {
  await tester.pumpWidget(MyApp());

  // Type multiple characters quickly
  await tester.enterText(find.byType(TextField), 'T');
  await tester.pump(Duration(milliseconds: 100));
  await tester.enterText(find.byType(TextField), 'To');
  await tester.pump(Duration(milliseconds: 100));
  await tester.enterText(find.byType(TextField), 'Tom');

  // API should not be called yet
  verify(mockApiService.searchPlayers(any)).called(0);

  // Wait for debounce
  await tester.pump(Duration(milliseconds: 300));

  // API should be called once
  verify(mockApiService.searchPlayers('Tom')).called(1);
});
```

### Backend Testing

```typescript
// Test socket rate limiting
describe('Chat Rate Limiting', () => {
  it('should block rapid messages', async () => {
    const socket = io.connect('http://localhost:3000');

    // Send 3 messages rapidly
    socket.emit('send_chat_message', { message: 'msg1', userId: 1 });
    socket.emit('send_chat_message', { message: 'msg2', userId: 1 });
    socket.emit('send_chat_message', { message: 'msg3', userId: 1 });

    await waitFor(100);

    // Only first message should be processed
    expect(chatMessages).toHaveLength(1);
  });
});
```

---

## Monitoring & Metrics

### Frontend (Add analytics)

```dart
// Track search performance
void _onSearchDebounced(String query) {
  analytics.logEvent(
    name: 'search_performed',
    parameters: {
      'query_length': query.length,
      'debounce_delay': 300,
    },
  );
}
```

### Backend (Add logging)

```typescript
// Track rate limiting
function logRateLimit(userId: number, action: string) {
  console.warn(`[RateLimit] User ${userId} rate limited on ${action}`);

  // Optional: Track in database for abuse detection
  incrementRateLimitCounter(userId, action);
}
```

---

## Quick Wins (Implement in 1 Hour)

If you only have 1 hour, implement these 3:

1. **Available Players Search Debounce** (15 min) - Biggest user-facing impact
2. **Draft Room Search Debounce** (15 min) - Most critical for draft experience
3. **Live Score Overlap Protection** (30 min) - Prevents potential crashes

These 3 fixes will give you 80% of the benefit.

---

## Dependencies to Install

### Backend
```bash
cd backend
npm install lodash
npm install @types/lodash --save-dev
npm install node-cache
npm install @types/node-cache --save-dev
```

### Frontend
No additional dependencies needed - use built-in `Timer` class

---

*Last Updated: 2025-10-31*
*Total Issues: 15 (4 Critical, 5 High, 4 Medium, 2 Low)*
