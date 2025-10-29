# Waiver Socket - Quick Reference Card

## For Backend Developers (Agent 1)

### Import
```typescript
import { io } from "../index";
import { emitClaimSubmitted, emitClaimCancelled, emitWaiversProcessing, emitWaiversProcessed, emitFreeAgentAdded } from "../socket/waiverSocket";
```

### After Creating Claim
```typescript
const claim = await createWaiverClaim({ ... });
emitClaimSubmitted(io, league_id, claim);
```

### After Cancelling Claim
```typescript
await deleteWaiverClaim(claim_id);
emitClaimCancelled(io, league_id, claim_id, roster_id);
```

### During Waiver Processing
```typescript
emitWaiversProcessing(io, league_id);
// ... process claims ...
emitWaiversProcessed(io, league_id, { successful, failed });
```

### After Free Agent Pickup
```typescript
const transaction = await createTransaction({ ... });
emitFreeAgentAdded(io, league_id, transaction);
```

---

## For Frontend Developers (Agent 2)

### Setup Listeners
```dart
void setupWaiverListeners() {
  _socket.on('claim_submitted', (data) {
    final claim = WaiverClaim.fromJson(data['claim']);
    Provider.of<WaiverProvider>(context, listen: false).addClaim(claim);
  });

  _socket.on('claim_cancelled', (data) {
    Provider.of<WaiverProvider>(context, listen: false).removeClaim(data['claim_id']);
  });

  _socket.on('waivers_processed', (data) {
    Provider.of<WaiverProvider>(context, listen: false).refresh();
  });
}
```

### Join/Leave Room
```dart
// On screen entry
socketService.joinWaiverRoom(leagueId);

// On screen exit
socketService.leaveWaiverRoom(leagueId);
```

### Provider Methods
```dart
void addClaim(WaiverClaim claim) {
  _myClaims.add(claim);
  notifyListeners();
}

void removeClaim(int claimId) {
  _myClaims.removeWhere((c) => c.id == claimId);
  notifyListeners();
}

Future<void> refresh() async {
  await loadClaims();
  notifyListeners();
}
```

---

## Events Cheat Sheet

| Event | Direction | When | Data |
|-------|-----------|------|------|
| `join_waiver_room` | Client → Server | On screen entry | `{league_id}` |
| `claim_submitted` | Server → Client | After claim creation | `{league_id, claim}` |
| `claim_cancelled` | Server → Client | After claim deletion | `{league_id, claim_id}` |
| `waivers_processing` | Server → Client | Processing starts | `{league_id, status}` |
| `waivers_processed` | Server → Client | Processing ends | `{league_id, results}` |
| `free_agent_added` | Server → Client | After FA pickup | `{league_id, transaction}` |

---

## Testing

### Browser Console
```javascript
const socket = io('http://localhost:3000');
socket.emit('join_waiver_room', { league_id: 1 });
socket.onAny((event, data) => console.log(event, data));
```

### cURL
```bash
curl -X POST http://localhost:3000/api/waivers/claims \
  -H "Content-Type: application/json" \
  -d '{"league_id":1,"roster_id":1,"player_id":101}'
```

---

## File Locations

- `backend/src/socket/waiverSocket.ts` - Socket implementation
- `backend/src/index.ts` - Server integration
- `backend/WAIVER_SOCKET_HANDOFF.md` - Full documentation
- `backend/WAIVER_SOCKET_USAGE_EXAMPLES.md` - Code examples
- `backend/WAIVER_SOCKET_FLOW_DIAGRAM.md` - Visual diagrams

---

## Troubleshooting

**Events not received?**
- Check socket connected: `socket.connected`
- Verify joined room: `socket.emit('join_waiver_room', {league_id: 1})`
- Check server logs for emit confirmations

**Multiple duplicates?**
- Ensure listeners set up once (not in build/render)
- Remove old listeners before adding new

**Need help?**
See full docs in WAIVER_SOCKET_HANDOFF.md
