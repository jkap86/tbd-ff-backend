# Task 2: Real-time Socket System for Auction Drafts

## Objective
Create WebSocket handlers for real-time auction draft updates, auto-winning logic, and timer management.

## Dependencies
- **REQUIRES Task 1 to be completed first** (needs Auction model and database tables)
- Existing socket infrastructure in `src/socket/`

## Sub-tasks

### 2.1 Create Auction Socket Module (src/socket/auctionSocket.ts)

#### Socket Events to Handle

**Client → Server:**
- `nominate_player` - User nominates a player
- `place_bid` - User places a bid with max_bid
- `join_auction` - Join auction room for updates
- `leave_auction` - Leave auction room

**Server → Client:**
- `player_nominated` - New player nominated
- `bid_placed` - New bid placed (shows current winning bid, not max)
- `player_won` - Player awarded to winning bidder
- `nomination_expired` - Timer ran out, no bids
- `budget_updated` - User's budget changed
- `error` - Validation error

### 2.2 Implement Socket Handlers

```typescript
import { Server, Socket } from "socket.io";
import {
  createNomination,
  placeBid,
  getActiveNominations,
  completeNomination,
  getRosterBudget,
} from "../models/Auction";
import { getDraftById } from "../models/Draft";

export function setupAuctionSocket(io: Server) {
  io.on("connection", (socket: Socket) => {

    // Join auction room
    socket.on("join_auction", async (data: { draftId: number }) => {
      const room = `auction_${data.draftId}`;
      socket.join(room);

      // Send current active nominations
      const nominations = await getActiveNominations(data.draftId);
      socket.emit("active_nominations", nominations);
    });

    // Nominate player
    socket.on("nominate_player", async (data: {
      draftId: number;
      playerId: number;
      nominatingRosterId: number;
    }) => {
      try {
        const draft = await getDraftById(data.draftId);
        if (!draft) throw new Error("Draft not found");

        // Calculate deadline based on draft type
        let deadline: Date | null = null;
        if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
          deadline = new Date(Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000);
        } else if (draft.draft_type === "auction") {
          deadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
        }

        const nomination = await createNomination({
          draft_id: data.draftId,
          player_id: data.playerId,
          nominating_roster_id: data.nominatingRosterId,
          deadline,
        });

        // Broadcast to all in auction room
        const room = `auction_${data.draftId}`;
        io.to(room).emit("player_nominated", nomination);

        // Start timer for this nomination
        if (deadline) {
          scheduleNominationExpiry(io, nomination.id, deadline);
        }
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    // Place bid
    socket.on("place_bid", async (data: {
      nominationId: number;
      rosterId: number;
      maxBid: number;
      draftId: number;
    }) => {
      try {
        // Validate and process bid with proxy logic
        const result = await placeBid({
          nomination_id: data.nominationId,
          roster_id: data.rosterId,
          max_bid: data.maxBid,
        });

        if (result.success) {
          const room = `auction_${data.draftId}`;

          // Broadcast bid update (only shows current winning bid, not max)
          io.to(room).emit("bid_placed", {
            nominationId: data.nominationId,
            currentBid: result.currentBid.bid_amount, // NOT max_bid
            winningRosterId: result.newWinner,
            previousWinner: result.previousWinner,
          });

          // Send budget updates to affected rosters
          const newWinnerBudget = await getRosterBudget(result.newWinner, data.draftId);
          io.to(`roster_${result.newWinner}`).emit("budget_updated", newWinnerBudget);

          if (result.previousWinner) {
            const prevWinnerBudget = await getRosterBudget(result.previousWinner, data.draftId);
            io.to(`roster_${result.previousWinner}`).emit("budget_updated", prevWinnerBudget);
          }
        }
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("leave_auction", (data: { draftId: number }) => {
      socket.leave(`auction_${data.draftId}`);
    });
  });
}
```

### 2.3 Implement Timer Management

Create timer scheduler for nominations:

```typescript
const nominationTimers = new Map<number, NodeJS.Timeout>();

function scheduleNominationExpiry(
  io: Server,
  nominationId: number,
  deadline: Date
) {
  const delay = deadline.getTime() - Date.now();

  const timer = setTimeout(async () => {
    try {
      // Get nomination and check if still active
      const nomination = await getNominationById(nominationId);
      if (!nomination || nomination.status !== 'active') {
        nominationTimers.delete(nominationId);
        return;
      }

      // Get highest bidder
      const bids = await getBidsForNomination(nominationId);
      if (bids.length > 0) {
        // Award to highest bidder
        const winningBid = bids.find(b => b.is_winning);
        if (winningBid) {
          await completeNomination(
            nominationId,
            winningBid.roster_id,
            winningBid.bid_amount
          );

          const room = `auction_${nomination.draft_id}`;
          io.to(room).emit("player_won", {
            nominationId,
            playerId: nomination.player_id,
            winningRosterId: winningBid.roster_id,
            winningBid: winningBid.bid_amount,
          });
        }
      } else {
        // No bids - passed
        await updateNominationStatus(nominationId, 'passed');

        const room = `auction_${nomination.draft_id}`;
        io.to(room).emit("nomination_expired", {
          nominationId,
          playerId: nomination.player_id,
        });
      }

      nominationTimers.delete(nominationId);
    } catch (error) {
      console.error("Error processing nomination expiry:", error);
    }
  }, delay);

  nominationTimers.set(nominationId, timer);
}

// Cancel timer if bid placed (for slow auction - restart timer)
export function resetNominationTimer(
  io: Server,
  nominationId: number,
  newDeadline: Date
) {
  const existingTimer = nominationTimers.get(nominationId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  scheduleNominationExpiry(io, nominationId, newDeadline);
}
```

### 2.4 Handle Multiple Simultaneous Nominations (Slow Auction)

For slow auction, need to track:
- Multiple active nominations at once
- Each with independent timers
- Max simultaneous nominations limit from draft settings

```typescript
async function canNominateMore(draftId: number): Promise<boolean> {
  const draft = await getDraftById(draftId);
  const activeNominations = await getActiveNominations(draftId);
  return activeNominations.length < (draft.max_simultaneous_nominations || 1);
}
```

### 2.5 Emit Helper Functions

```typescript
export function emitPlayerNominated(
  io: Server,
  draftId: number,
  nomination: AuctionNomination
) {
  io.to(`auction_${draftId}`).emit("player_nominated", nomination);
}

export function emitBidPlaced(
  io: Server,
  draftId: number,
  data: {
    nominationId: number;
    currentBid: number;
    winningRosterId: number;
  }
) {
  io.to(`auction_${draftId}`).emit("bid_placed", data);
}

export function emitPlayerWon(
  io: Server,
  draftId: number,
  data: {
    nominationId: number;
    playerId: number;
    winningRosterId: number;
    winningBid: number;
  }
) {
  io.to(`auction_${draftId}`).emit("player_won", data);
}
```

## Integration Points

1. **In src/index.ts:**
```typescript
import { setupAuctionSocket } from "./socket/auctionSocket";
setupAuctionSocket(io);
```

2. **When nomination timer expires in slow auction:**
   - If someone bid → award player
   - If no bids → mark as passed, free up nomination slot

3. **When player won:**
   - Update roster's players array
   - Update roster's spent budget
   - Free up nomination slot for next player

## Testing Checklist
- [ ] Can join auction room and receive active nominations
- [ ] Nominate player broadcasts to all clients
- [ ] Place bid updates winning bid in real-time
- [ ] Proxy bidding triggers automatic outbid
- [ ] Timer expires and awards player to winner
- [ ] Multiple simultaneous nominations work (slow auction)
- [ ] Budget updates sent to affected rosters only

## Files to Create/Modify
- `src/socket/auctionSocket.ts` (new)
- `src/index.ts` (add setupAuctionSocket)

## Estimated Complexity
**Medium** - Building on existing socket patterns, but timer management adds complexity.
