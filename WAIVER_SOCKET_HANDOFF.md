# Waiver Socket System - Handoff Documentation

## Overview

Real-time socket functionality for waiver claims, free agent pickups, and roster transactions has been implemented using Socket.io. This system allows users to receive instant updates when waiver-related events occur in their league.

---

## Backend Implementation

### File Created
- **`src/socket/waiverSocket.ts`** - Main socket handler for waiver events

### File Modified
- **`src/index.ts`** - Integrated waiver socket setup into main server

---

## Socket Events

### Client -> Server Events

#### `join_waiver_room`
Join a waiver room to receive real-time updates for a specific league.

**Payload:**
```typescript
{
  league_id: number;
  user_id?: number;      // Optional
  username?: string;     // Optional
}
```

**Response:**
```typescript
{
  league_id: number;
  message: string;
  timestamp: Date;
}
```

---

#### `leave_waiver_room`
Leave a waiver room.

**Payload:**
```typescript
{
  league_id: number;
  user_id?: number;
  username?: string;
}
```

---

#### `request_waiver_state`
Request current waiver state (useful for reconnection sync).

**Payload:**
```typescript
{
  league_id: number;
}
```

---

### Server -> Client Events

#### `claim_submitted`
Emitted when a waiver claim is submitted.

**Payload:**
```typescript
{
  league_id: number;
  claim: {
    id: number;
    roster_id: number;
    player_id: number;
    drop_player_id?: number;
    priority: number;
    // ... other claim fields
  };
  timestamp: Date;
}
```

**When to emit:** After a waiver claim is successfully created in the database.

---

#### `claim_cancelled`
Emitted when a waiver claim is cancelled.

**Payload:**
```typescript
{
  league_id: number;
  claim_id: number;
  roster_id?: number;
  timestamp: Date;
}
```

**When to emit:** After a waiver claim is successfully deleted/cancelled.

---

#### `waivers_processing`
Emitted when waiver processing begins.

**Payload:**
```typescript
{
  league_id: number;
  status: "processing";
  timestamp: Date;
}
```

**When to emit:** At the start of the waiver processing job (typically runs overnight or at scheduled time).

---

#### `waivers_processed`
Emitted when waiver processing completes.

**Payload:**
```typescript
{
  league_id: number;
  results: {
    successful: WaiverClaim[];  // Claims that were successful
    failed: WaiverClaim[];      // Claims that failed
  };
  status: "completed";
  timestamp: Date;
}
```

**When to emit:** After all waiver claims have been processed.

---

#### `free_agent_added`
Emitted when a free agent is picked up.

**Payload:**
```typescript
{
  league_id: number;
  transaction: {
    id: number;
    roster_id: number;
    player_id: number;
    transaction_type: "add";
    // ... other transaction fields
  };
  timestamp: Date;
}
```

**When to emit:** After a free agent is successfully added to a roster.

---

#### `player_dropped`
Emitted when a player is dropped from a roster.

**Payload:**
```typescript
{
  league_id: number;
  transaction: {
    id: number;
    roster_id: number;
    player_id: number;
    transaction_type: "drop";
    // ... other transaction fields
  };
  timestamp: Date;
}
```

**When to emit:** After a player is successfully dropped from a roster.

---

#### `waiver_priority_changed`
Emitted when waiver priorities change (after processing or manual adjustment).

**Payload:**
```typescript
{
  league_id: number;
  priorities: Array<{
    roster_id: number;
    priority: number;
  }>;
  timestamp: Date;
}
```

**When to emit:** After waiver priorities are updated in the database.

---

## How to Use in Backend Services

### Import the Emitters

```typescript
import { io } from "../index";
import {
  emitClaimSubmitted,
  emitClaimCancelled,
  emitWaiversProcessing,
  emitWaiversProcessed,
  emitFreeAgentAdded,
  emitPlayerDropped,
  emitWaiverPriorityChanged,
  emitWaiverUpdate
} from "../socket/waiverSocket";
```

### Example: After Creating a Waiver Claim

```typescript
// In waiverService.ts or waiverController.ts
export async function submitWaiverClaim(
  leagueId: number,
  rosterId: number,
  playerId: number,
  dropPlayerId?: number
) {
  // Create the claim in database
  const claim = await createWaiverClaimInDB({
    league_id: leagueId,
    roster_id: rosterId,
    player_id: playerId,
    drop_player_id: dropPlayerId,
    // ... other fields
  });

  // Emit socket event to all users in the league
  emitClaimSubmitted(io, leagueId, claim);

  return claim;
}
```

### Example: Processing Waivers

```typescript
// In waiverProcessingService.ts
export async function processWaivers(leagueId: number) {
  // Notify that processing has started
  emitWaiversProcessing(io, leagueId);

  const successful: any[] = [];
  const failed: any[] = [];

  // Get all pending claims for the league
  const claims = await getPendingClaims(leagueId);

  // Process each claim...
  for (const claim of claims) {
    const result = await processClaim(claim);
    if (result.success) {
      successful.push(claim);
    } else {
      failed.push(claim);
    }
  }

  // Notify that processing is complete with results
  emitWaiversProcessed(io, leagueId, { successful, failed });
}
```

### Example: Free Agent Pickup

```typescript
// In freeAgentService.ts
export async function pickupFreeAgent(
  leagueId: number,
  rosterId: number,
  playerId: number
) {
  // Create transaction in database
  const transaction = await createTransaction({
    league_id: leagueId,
    roster_id: rosterId,
    player_id: playerId,
    transaction_type: "add",
    // ... other fields
  });

  // Emit socket event
  emitFreeAgentAdded(io, leagueId, transaction);

  return transaction;
}
```

---

## Frontend Integration (Flutter)

### Socket Service Setup

In your `socket_service.dart`:

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  late IO.Socket _socket;

  void setupWaiverListeners(BuildContext context) {
    // Claim submitted
    _socket.on('claim_submitted', (data) {
      final claim = WaiverClaim.fromJson(data['claim']);
      Provider.of<WaiverProvider>(context, listen: false).addClaim(claim);
    });

    // Claim cancelled
    _socket.on('claim_cancelled', (data) {
      final claimId = data['claim_id'] as int;
      Provider.of<WaiverProvider>(context, listen: false).removeClaim(claimId);
    });

    // Waivers processing
    _socket.on('waivers_processing', (data) {
      Provider.of<WaiverProvider>(context, listen: false).setProcessing(true);
    });

    // Waivers processed
    _socket.on('waivers_processed', (data) {
      Provider.of<WaiverProvider>(context, listen: false).setProcessing(false);
      Provider.of<WaiverProvider>(context, listen: false).refresh();

      // Show notification
      _showNotification('Waivers have been processed!');
    });

    // Free agent added
    _socket.on('free_agent_added', (data) {
      final transaction = Transaction.fromJson(data['transaction']);
      Provider.of<TransactionProvider>(context, listen: false).addTransaction(transaction);
    });

    // Player dropped
    _socket.on('player_dropped', (data) {
      final transaction = Transaction.fromJson(data['transaction']);
      Provider.of<TransactionProvider>(context, listen: false).addTransaction(transaction);
    });

    // Waiver priority changed
    _socket.on('waiver_priority_changed', (data) {
      final priorities = (data['priorities'] as List)
          .map((p) => WaiverPriority.fromJson(p))
          .toList();
      Provider.of<WaiverProvider>(context, listen: false).updatePriorities(priorities);
    });
  }

  void joinWaiverRoom(int leagueId, {int? userId, String? username}) {
    _socket.emit('join_waiver_room', {
      'league_id': leagueId,
      'user_id': userId,
      'username': username,
    });
  }

  void leaveWaiverRoom(int leagueId, {int? userId, String? username}) {
    _socket.emit('leave_waiver_room', {
      'league_id': leagueId,
      'user_id': userId,
      'username': username,
    });
  }
}
```

### Provider Updates

Add these methods to your `WaiverProvider`:

```dart
class WaiverProvider extends ChangeNotifier {
  List<WaiverClaim> _myClaims = [];
  bool _isProcessing = false;

  void addClaim(WaiverClaim claim) {
    _myClaims.add(claim);
    _myClaims.sort((a, b) => a.priority.compareTo(b.priority));
    notifyListeners();
  }

  void removeClaim(int claimId) {
    _myClaims.removeWhere((c) => c.id == claimId);
    notifyListeners();
  }

  void setProcessing(bool processing) {
    _isProcessing = processing;
    notifyListeners();
  }

  Future<void> refresh() async {
    // Reload claims and transactions from API
    await loadClaims();
    notifyListeners();
  }

  void updatePriorities(List<WaiverPriority> priorities) {
    // Update roster waiver priorities
    // This depends on your data structure
    notifyListeners();
  }
}
```

### Screen Integration

When entering waiver/league screens:

```dart
@override
void initState() {
  super.initState();

  // Join the waiver room for this league
  final socketService = Provider.of<SocketService>(context, listen: false);
  socketService.joinWaiverRoom(
    widget.leagueId,
    userId: currentUserId,
    username: currentUsername,
  );
}

@override
void dispose() {
  // Leave the waiver room when leaving screen
  final socketService = Provider.of<SocketService>(context, listen: false);
  socketService.leaveWaiverRoom(widget.leagueId);
  super.dispose();
}
```

---

## Testing Real-Time Updates

### Manual Testing Steps

1. **Test Claim Submission:**
   - Have two devices/browsers join the same league's waiver room
   - Submit a waiver claim from one device
   - Verify the other device receives the `claim_submitted` event

2. **Test Claim Cancellation:**
   - Cancel a waiver claim from one device
   - Verify all devices in the room receive the `claim_cancelled` event

3. **Test Waiver Processing:**
   - Trigger waiver processing (manually or via scheduler)
   - Verify all users receive `waivers_processing` event
   - After completion, verify `waivers_processed` event with results

4. **Test Free Agent Pickup:**
   - Pick up a free agent from one device
   - Verify all devices see the `free_agent_added` event

5. **Test Reconnection:**
   - Disconnect a client
   - Make waiver changes
   - Reconnect and use `request_waiver_state` to sync

### Using Socket.io Client (for testing)

```javascript
// In browser console or Node.js
const socket = io('http://localhost:3000');

// Join room
socket.emit('join_waiver_room', { league_id: 1 });

// Listen for events
socket.on('claim_submitted', (data) => {
  console.log('Claim submitted:', data);
});

socket.on('waivers_processed', (data) => {
  console.log('Waivers processed:', data);
});
```

---

## Room Structure

Rooms are organized by league ID:
- Room name format: `waivers_{league_id}`
- Example: `waivers_1`, `waivers_2`, etc.

**Why?** This ensures that waiver updates are only sent to users in the same league, maintaining privacy and reducing unnecessary network traffic.

---

## Error Handling

All socket events include error handling:

```typescript
socket.emit("error", { message: "Error message here" });
```

Frontend should listen for errors:

```dart
_socket.on('error', (data) {
  final message = data['message'] as String;
  // Show error to user
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message)),
  );
});
```

---

## Performance Considerations

1. **Room-based Broadcasting:** Events are only sent to users in the specific league room, not to all connected clients.

2. **Minimal Payload:** Only essential data is sent. Frontend can fetch full details via API if needed.

3. **Reconnection:** Socket.io handles reconnection automatically. Use `request_waiver_state` to sync on reconnect.

4. **Throttling:** Consider throttling rapid updates (e.g., if processing many claims).

---

## Security Considerations

1. **Authentication:** Currently, no authentication is enforced at the socket level. Consider adding authentication middleware to verify users belong to the league they're joining.

2. **Rate Limiting:** Consider adding rate limiting to prevent spam on socket events.

3. **Privacy:** User join/leave notifications are commented out by default to maintain privacy. Enable if desired.

---

## Future Enhancements

1. **Trade Events:** Add socket events for trade proposals and acceptances
2. **Waiver Report:** Broadcast detailed waiver reports after processing
3. **Commissioner Actions:** Real-time updates for commissioner override actions
4. **Claim Bidding:** If implementing FAAB (Free Agent Acquisition Budget), add bid update events
5. **Notifications:** Push notifications for important waiver events

---

## Troubleshooting

### Events Not Received

1. Verify socket connection is established
2. Check that `join_waiver_room` was called with correct `league_id`
3. Verify the backend service is calling the emit function with the correct `io` instance
4. Check server logs for emit confirmations

### Multiple Events Received

1. Ensure listeners are only set up once (not in build methods)
2. Remove old listeners before adding new ones
3. Check for duplicate socket connections

### Performance Issues

1. Verify room-based broadcasting is working (not broadcasting to all)
2. Check payload sizes (minimize data sent)
3. Monitor server logs for excessive emissions

---

## Integration Checklist

### Backend
- [x] Create `waiverSocket.ts`
- [x] Export emit helper functions
- [x] Integrate into main server (`index.ts`)
- [ ] Call emit functions from waiver service (Agent 1's responsibility)
- [ ] Call emit functions from free agent service (Agent 1's responsibility)
- [ ] Call emit functions from waiver processing job (Agent 1's responsibility)

### Frontend (Agent 2's responsibility)
- [ ] Add waiver socket listeners to `socket_service.dart`
- [ ] Update `WaiverProvider` with socket handler methods
- [ ] Call `joinWaiverRoom` on screen entry
- [ ] Call `leaveWaiverRoom` on screen exit
- [ ] Test real-time updates

---

## Contact & Support

For questions about this implementation, refer to:
- Backend socket file: `backend/src/socket/waiverSocket.ts`
- Existing socket examples: `backend/src/socket/draftSocket.ts`
- Main server setup: `backend/src/index.ts`

---

**Implementation Date:** 2025-10-28
**Status:** Backend Complete - Ready for Service Integration
**Next Steps:** Agent 1 needs to integrate emit functions into waiver services
