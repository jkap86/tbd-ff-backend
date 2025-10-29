# Waiver Socket Flow Diagrams

Visual representation of how the waiver socket system works.

---

## 1. Initial Connection & Room Join

```
┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐
│   Client 1   │                 │    Server    │                 │   Client 2   │
│  (Browser)   │                 │  Socket.io   │                 │  (Mobile)    │
└──────┬───────┘                 └──────┬───────┘                 └──────┬───────┘
       │                                │                                │
       │  Connect to Socket.io          │                                │
       │ ────────────────────────────>  │                                │
       │                                │                                │
       │  Connection established        │                                │
       │ <────────────────────────────  │                                │
       │                                │                                │
       │  emit('join_waiver_room',      │                                │
       │       {league_id: 1})          │                                │
       │ ────────────────────────────>  │                                │
       │                                │                                │
       │         socket.join(           │                                │
       │         'waivers_1')           │  Connect & join                │
       │                                │ <──────────────────────────────│
       │  emit('joined_waiver_room')   │                                │
       │ <────────────────────────────  │                                │
       │                                │  emit('joined_waiver_room')   │
       │                                │ ────────────────────────────>  │
       │                                │                                │

       Both clients now in room 'waivers_1'
```

---

## 2. Waiver Claim Submission Flow

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Client    │    │     API      │    │   Service    │    │  Socket.io   │
│  (User A)   │    │  Controller  │    │    Layer     │    │   Room       │
└──────┬──────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                  │                    │                    │
       │  POST /api/      │                    │                    │
       │  waivers/claims  │                    │                    │
       │ ──────────────>  │                    │                    │
       │                  │                    │                    │
       │                  │ createWaiverClaim()│                    │
       │                  │ ─────────────────> │                    │
       │                  │                    │                    │
       │                  │                    │  Save to DB        │
       │                  │                    │  ┌───────────┐    │
       │                  │                    │  │ Database  │    │
       │                  │                    │  └───────────┘    │
       │                  │                    │                    │
       │                  │                    │ emitClaimSubmitted │
       │                  │                    │   (io, leagueId,   │
       │                  │                    │    claim)          │
       │                  │                    │ ─────────────────> │
       │                  │                    │                    │
       │                  │  Return claim      │                    │
       │                  │ <───────────────── │                    │
       │                  │                    │                    │
       │  201 Created     │                    │  Broadcast to      │
       │  {claim data}    │                    │  waivers_{id}      │
       │ <──────────────  │                    │                    │
       │                  │                    │                    │
       │  on('claim_submitted', callback)      │                    │
       │ <─────────────────────────────────────────────────────────│
       │                  │                    │                    │

   User A sees immediate API response
   All users in room see socket event
```

---

## 3. Multi-Client Real-Time Update

```
┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐
│   Client 1   │                 │  Socket.io   │                 │   Client 2   │
│  (User A)    │                 │  Server      │                 │  (User B)    │
└──────┬───────┘                 └──────┬───────┘                 └──────┬───────┘
       │                                │                                │
       │  Submits waiver claim          │                                │
       │  via API                       │                                │
       │ ────────────────────────────>  │                                │
       │                                │                                │
       │  API processes claim           │                                │
       │  and saves to DB               │                                │
       │                                │                                │
       │  io.to('waivers_1').emit(     │                                │
       │    'claim_submitted', data)    │                                │
       │ ────────────────────────────>  │                                │
       │                                │                                │
       │  on('claim_submitted')         │  on('claim_submitted')         │
       │ <──────────────────────────────┼───────────────────────────────>│
       │                                │                                │
       │  Updates UI                    │                  Updates UI    │
       │  Shows new claim               │        Shows User A's claim    │
       │                                │                                │

Both users see the update in real-time!
Client 1 gets API response + socket event
Client 2 only gets socket event (but that's all they need)
```

---

## 4. Waiver Processing Flow (Scheduled Job)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Scheduler   │    │   Waiver     │    │  Socket.io   │    │   Clients    │
│  (Cron 3AM)  │    │  Processor   │    │   Server     │    │ (All Users)  │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                    │                    │
       │  Trigger          │                    │                    │
       │  processWaivers() │                    │                    │
       │ ────────────────> │                    │                    │
       │                   │                    │                    │
       │                   │ emitWaiversProcessing                   │
       │                   │ ─────────────────> │                    │
       │                   │                    │                    │
       │                   │                    │ 'waivers_processing'│
       │                   │                    │ ─────────────────> │
       │                   │                    │                    │
       │                   │                    │  UI: "Processing   │
       │                   │                    │       waivers..."  │
       │                   │                    │                    │
       │                   │  For each claim:   │                    │
       │                   │  ┌──────────────┐  │                    │
       │                   │  │ Check player │  │                    │
       │                   │  │ availability │  │                    │
       │                   │  └──────────────┘  │                    │
       │                   │  ┌──────────────┐  │                    │
       │                   │  │ Process add/ │  │                    │
       │                   │  │ drop         │  │                    │
       │                   │  └──────────────┘  │                    │
       │                   │  ┌──────────────┐  │                    │
       │                   │  │ Update DB    │  │                    │
       │                   │  └──────────────┘  │                    │
       │                   │                    │                    │
       │                   │ emitWaiversProcessed                    │
       │                   │   (results)        │                    │
       │                   │ ─────────────────> │                    │
       │                   │                    │                    │
       │                   │                    │ 'waivers_processed'│
       │                   │                    │    {successful,    │
       │                   │                    │     failed}        │
       │                   │                    │ ─────────────────> │
       │                   │                    │                    │
       │                   │                    │  UI: Show results  │
       │                   │                    │  Refresh rosters   │
       │                   │                    │  Update claims     │
       │                   │                    │                    │

All connected users get instant notification when processing completes!
```

---

## 5. Room-Based Broadcasting (Privacy & Performance)

```
League 1 Users:                    League 2 Users:
┌──────────┐  ┌──────────┐        ┌──────────┐  ┌──────────┐
│ Client A │  │ Client B │        │ Client X │  │ Client Y │
└────┬─────┘  └────┬─────┘        └────┬─────┘  └────┬─────┘
     │             │                    │             │
     │             │                    │             │
     │   join('waivers_1')              │   join('waivers_2')
     │             │                    │             │
     └──────┬──────┘                    └──────┬──────┘
            │                                  │
            ▼                                  ▼
     ┌────────────┐                    ┌────────────┐
     │   Room:    │                    │   Room:    │
     │ waivers_1  │                    │ waivers_2  │
     └────────────┘                    └────────────┘

When event emitted to waivers_1:
  ✓ Client A receives it
  ✓ Client B receives it
  ✗ Client X does NOT receive it (different league)
  ✗ Client Y does NOT receive it (different league)

Benefits:
- Privacy: League 2 users don't see League 1 events
- Performance: Only relevant clients receive updates
- Scalability: Can handle many leagues simultaneously
```

---

## 6. Free Agent Pickup Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Client     │    │     API      │    │  All Clients │
│              │    │  & Socket    │    │  in League   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                    │
       │  POST /api/       │                    │
       │  free-agents      │                    │
       │ ────────────────> │                    │
       │                   │                    │
       │                   │  1. Validate FA    │
       │                   │  2. Add to roster  │
       │                   │  3. Save to DB     │
       │                   │                    │
       │  200 OK           │                    │
       │  {transaction}    │                    │
       │ <──────────────── │                    │
       │                   │                    │
       │  Update local UI  │ emitFreeAgentAdded │
       │                   │ ─────────────────> │
       │                   │                    │
       │  on('free_agent_added')                │
       │ <──────────────────────────────────────│
       │                   │                    │
       │  ✓ UI already     │         Update UI  │
       │    updated        │     Show new player│
       │                   │                    │

Requesting client: Fast (API response)
Other clients: Real-time (socket event)
```

---

## 7. Error Handling & Reconnection

```
┌──────────────┐                 ┌──────────────┐
│   Client     │                 │    Server    │
└──────┬───────┘                 └──────┬───────┘
       │                                │
       │  Connected to socket           │
       │  Joined waiver room            │
       │                                │
       │                                │
       │  ❌ Connection lost            │
       │  (Network issue)               │
       │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ X │
       │                                │
       │                                │
       │  Socket.io auto-reconnect      │
       │ ══════════════════════════════>│
       │                                │
       │  emit('join_waiver_room',      │
       │       {league_id: 1})          │
       │ ────────────────────────────>  │
       │                                │
       │  emit('request_waiver_state')  │
       │ ────────────────────────────>  │
       │                                │
       │  on('waiver_state')            │
       │  {current claims, etc}         │
       │ <────────────────────────────  │
       │                                │
       │  ✓ Client synced & ready       │
       │                                │

Socket.io handles reconnection automatically!
Client just needs to re-join room and sync state.
```

---

## 8. Event Types Summary

```
CLIENT → SERVER:
┌──────────────────────┐
│ join_waiver_room     │ ──> Join league's waiver room
├──────────────────────┤
│ leave_waiver_room    │ ──> Leave waiver room
├──────────────────────┤
│ request_waiver_state │ ──> Request current state (sync)
└──────────────────────┘

SERVER → CLIENT:
┌──────────────────────┐
│ claim_submitted      │ ──> New waiver claim
├──────────────────────┤
│ claim_cancelled      │ ──> Claim cancelled
├──────────────────────┤
│ waivers_processing   │ ──> Processing started
├──────────────────────┤
│ waivers_processed    │ ──> Processing complete
├──────────────────────┤
│ free_agent_added     │ ──> FA pickup
├──────────────────────┤
│ player_dropped       │ ──> Player dropped
├──────────────────────┤
│ waiver_priority_     │ ──> Waiver order changed
│ changed              │
└──────────────────────┘
```

---

## 9. Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Flutter)                      │
│                                                                 │
│  ┌───────────────┐     ┌───────────────┐     ┌──────────────┐ │
│  │ WaiverScreen  │     │SocketService  │     │WaiverProvider│ │
│  │               │────>│               │────>│              │ │
│  │ - Submit claim│     │ - Join room   │     │ - addClaim() │ │
│  │ - Cancel claim│     │ - Listeners   │     │ - refresh()  │ │
│  └───────────────┘     └───────┬───────┘     └──────────────┘ │
│                                │                               │
└────────────────────────────────┼───────────────────────────────┘
                                 │
                                 │ Socket.io
                                 │ WebSocket Connection
                                 │
┌────────────────────────────────┼───────────────────────────────┐
│                         BACKEND (Node.js)                       │
│                                │                                │
│  ┌─────────────────────────────▼─────────────────────────────┐ │
│  │              Socket.io Server (index.ts)                  │ │
│  │                                                            │ │
│  │  setupWaiverSocket(io)                                    │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                        │
│  ┌──────────────────────▼──────────────────────┐                │
│  │         waiverSocket.ts                     │                │
│  │                                              │                │
│  │  - setupWaiverSocket()                      │                │
│  │  - emitClaimSubmitted()                     │                │
│  │  - emitClaimCancelled()                     │                │
│  │  - emitWaiversProcessing()                  │                │
│  │  - emitWaiversProcessed()                   │                │
│  └─────────────────────────┬────────────────────┘                │
│                            │                                     │
│                            │ Called by                           │
│                            │                                     │
│  ┌─────────────────────────▼──────────────────────────────────┐ │
│  │               Service Layer                                 │ │
│  │                                                              │ │
│  │  waiverService.ts:                                          │ │
│  │  - createWaiverClaim() ──> emitClaimSubmitted()            │ │
│  │  - cancelWaiverClaim() ──> emitClaimCancelled()            │ │
│  │                                                              │ │
│  │  waiverProcessingService.ts:                                │ │
│  │  - processWaivers() ──> emitWaiversProcessing()            │ │
│  │                    ──> emitWaiversProcessed()              │ │
│  │                                                              │ │
│  │  freeAgentService.ts:                                       │ │
│  │  - pickupFreeAgent() ──> emitFreeAgentAdded()              │ │
│  └─────────────────────────┬────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Database (PostgreSQL)                 │   │
│  │                                                           │   │
│  │  - waiver_claims                                         │   │
│  │  - transactions                                          │   │
│  │  - rosters                                               │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

Flow:
1. User action → API call
2. Service layer → Database update
3. Service layer → Socket emit
4. Socket.io → Broadcast to room
5. All clients → Receive & update UI
```

---

## Legend

```
───>  Direct call / request
═══>  Auto-reconnection
- - > Disconnection
┌──┐  Component / Module
│  │
└──┘
```

---

This visual guide should help both Agent 1 (backend) and Agent 2 (frontend) understand exactly how the socket system works and where to integrate their code!
