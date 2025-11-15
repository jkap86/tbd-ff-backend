# Task 01: Event Bus Abstraction
## Priority: CRITICAL | Effort: 3 days | Impact: HIGH

## Problem Statement
The Socket.io instance (`io`) is globally exported from `index.ts:196` and imported directly in 7+ services:
- `src/services/autoPickService.ts`
- `src/services/liveScoreService.ts`
- `src/services/draftScheduler.ts`
- `src/services/scoreScheduler.ts`
- `src/services/waiverScheduler.ts`
- `src/services/pushNotificationService.ts`
- `src/services/tokenCleanupService.ts`

This creates tight coupling, prevents unit testing, and makes services dependent on Socket.io implementation.

## Solution Architecture
Create an abstraction layer that decouples business logic from real-time communication implementation.

## Detailed Subtasks

### 1. Create Event Bus Interface (30 min)
- [ ] Create `src/interfaces/IEventBus.ts`
- [ ] Define core methods: `emit`, `emitToRoom`, `on`, `off`
- [ ] Add TypeScript generics for type-safe events
- [ ] Document all interface methods

**Code to create:**
```typescript
// src/interfaces/IEventBus.ts
export interface IEventBus {
  emit<T = any>(event: string, data: T): void;
  emitToRoom<T = any>(room: string, event: string, data: T): void;
  emitToUser<T = any>(userId: number, event: string, data: T): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  joinRoom(socketId: string, room: string): void;
  leaveRoom(socketId: string, room: string): void;
}

export interface IEventEmitter {
  emit<T = any>(event: string, data: T): void;
}
```

### 2. Implement Socket Event Bus (1 hour)
- [ ] Create `src/services/eventBus/SocketEventBus.ts`
- [ ] Implement IEventBus interface
- [ ] Add error handling and logging
- [ ] Add connection state management
- [ ] Create unit tests

**Code to create:**
```typescript
// src/services/eventBus/SocketEventBus.ts
import { Server } from "socket.io";
import { IEventBus } from "../../interfaces/IEventBus";
import { logger } from "../../utils/logger";

export class SocketEventBus implements IEventBus {
  constructor(private io: Server) {}

  emit<T = any>(event: string, data: T): void {
    try {
      this.io.emit(event, data);
      logger.debug(`Event emitted: ${event}`, { data });
    } catch (error) {
      logger.error(`Failed to emit event: ${event}`, error);
    }
  }

  emitToRoom<T = any>(room: string, event: string, data: T): void {
    try {
      this.io.to(room).emit(event, data);
      logger.debug(`Event emitted to room ${room}: ${event}`, { data });
    } catch (error) {
      logger.error(`Failed to emit to room ${room}: ${event}`, error);
    }
  }

  emitToUser<T = any>(userId: number, event: string, data: T): void {
    try {
      this.io.to(`user_${userId}`).emit(event, data);
      logger.debug(`Event emitted to user ${userId}: ${event}`, { data });
    } catch (error) {
      logger.error(`Failed to emit to user ${userId}: ${event}`, error);
    }
  }

  on(event: string, handler: Function): void {
    // Implementation for server-side event listening if needed
  }

  off(event: string, handler: Function): void {
    // Implementation for removing listeners
  }

  joinRoom(socketId: string, room: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(room);
      logger.debug(`Socket ${socketId} joined room ${room}`);
    }
  }

  leaveRoom(socketId: string, room: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(room);
      logger.debug(`Socket ${socketId} left room ${room}`);
    }
  }
}
```

### 3. Create Mock Event Bus for Testing (45 min)
- [ ] Create `src/services/eventBus/MockEventBus.ts`
- [ ] Track all emitted events for assertions
- [ ] Add spy functionality
- [ ] Create helper methods for testing

**Code to create:**
```typescript
// src/services/eventBus/MockEventBus.ts
export class MockEventBus implements IEventBus {
  private events: Array<{event: string; data: any; room?: string}> = [];

  emit<T = any>(event: string, data: T): void {
    this.events.push({ event, data });
  }

  emitToRoom<T = any>(room: string, event: string, data: T): void {
    this.events.push({ event, data, room });
  }

  getEmittedEvents() {
    return this.events;
  }

  wasEventEmitted(event: string): boolean {
    return this.events.some(e => e.event === event);
  }

  getEventData(event: string) {
    const found = this.events.find(e => e.event === event);
    return found?.data;
  }

  clear() {
    this.events = [];
  }
}
```

### 4. Refactor Services to Use Event Bus (2 hours)

#### 4a. AutoPickService Refactoring
- [ ] Update constructor to accept IEventBus
- [ ] Replace `import { io }` with event bus injection
- [ ] Update all socket emission calls
- [ ] Update tests

**Files to modify:**
- `src/services/autoPickService.ts`

**Before:**
```typescript
import { io } from "../index";
import { emitDraftPick, emitDraftStatusChange } from "../socket/draftSocket";

// In function
io.to(`draft_${draftId}`).emit("draftPick", pick);
```

**After:**
```typescript
export class AutoPickService {
  constructor(private eventBus: IEventBus) {}

  async performAutoPick(draftId: number) {
    // ... logic
    this.eventBus.emitToRoom(`draft_${draftId}`, "draftPick", pick);
  }
}
```

#### 4b. LiveScoreService Refactoring
- [ ] Update constructor
- [ ] Replace direct io usage
- [ ] Test score update emissions

**Files to modify:**
- `src/services/liveScoreService.ts`

#### 4c. DraftScheduler Refactoring
- [ ] Update initialization
- [ ] Replace io imports
- [ ] Test scheduled draft events

**Files to modify:**
- `src/services/draftScheduler.ts`

#### 4d. Other Services (1 hour each)
- [ ] `scoreScheduler.ts`
- [ ] `waiverScheduler.ts`
- [ ] `pushNotificationService.ts`
- [ ] `tokenCleanupService.ts`

### 5. Update Socket Handlers (1 hour)
- [ ] Modify socket setup functions to use event bus
- [ ] Update `setupDraftSocket` to inject event bus
- [ ] Update `setupLeagueSocket` to inject event bus
- [ ] Update `setupMatchupSocket` to inject event bus
- [ ] Update `setupWaiverSocket` to inject event bus
- [ ] Update `setupTradeSocket` to inject event bus
- [ ] Update `setupAuctionSocket` to inject event bus

**Files to modify:**
- `src/socket/draftSocket.ts`
- `src/socket/leagueSocket.ts`
- `src/socket/matchupSocket.ts`
- `src/socket/waiverSocket.ts`
- `src/socket/tradeSocket.ts`
- `src/socket/auctionSocket.ts`

### 6. Update Main Application File (30 min)
- [ ] Remove `export { io }` from `index.ts`
- [ ] Create event bus instance
- [ ] Pass event bus to services
- [ ] Update socket setup calls

**Modify `src/index.ts`:**
```typescript
// Remove this line:
// export { io };

// Add:
import { SocketEventBus } from "./services/eventBus/SocketEventBus";

const eventBus = new SocketEventBus(io);

// Pass to socket setups:
setupDraftSocket(io, eventBus);
setupLeagueSocket(io, eventBus);
// etc.

// Pass to services that need it:
const autoPickService = new AutoPickService(eventBus);
```

### 7. Create Factory Pattern for Services (1 hour)
- [ ] Create `src/factories/ServiceFactory.ts`
- [ ] Initialize all services with dependencies
- [ ] Export service instances

**Code to create:**
```typescript
// src/factories/ServiceFactory.ts
export class ServiceFactory {
  private static instance: ServiceFactory;
  private services: Map<string, any> = new Map();

  constructor(private eventBus: IEventBus, private pool: Pool) {
    this.initializeServices();
  }

  private initializeServices() {
    this.services.set('autoPickService', new AutoPickService(this.eventBus));
    this.services.set('liveScoreService', new LiveScoreService(this.eventBus));
    // ... other services
  }

  getService<T>(name: string): T {
    return this.services.get(name);
  }

  static initialize(eventBus: IEventBus, pool: Pool) {
    this.instance = new ServiceFactory(eventBus, pool);
  }

  static getInstance(): ServiceFactory {
    if (!this.instance) {
      throw new Error('ServiceFactory not initialized');
    }
    return this.instance;
  }
}
```

### 8. Write Unit Tests (2 hours)
- [ ] Test SocketEventBus implementation
- [ ] Test MockEventBus functionality
- [ ] Test refactored services with mock event bus
- [ ] Test event emission in various scenarios
- [ ] Test error handling

**Create test files:**
- `src/__tests__/services/eventBus/SocketEventBus.test.ts`
- `src/__tests__/services/eventBus/MockEventBus.test.ts`
- `src/__tests__/services/autoPickService.test.ts` (update)

### 9. Update Documentation (30 min)
- [ ] Document event bus pattern in README
- [ ] Add migration guide for other services
- [ ] Document testing approach
- [ ] Add troubleshooting section

### 10. Migration Checklist
- [ ] All imports of `io` from index removed
- [ ] All services using event bus interface
- [ ] All tests passing
- [ ] No direct socket.io dependencies in business logic
- [ ] Documentation updated

## Testing Strategy
1. **Unit Tests**: Use MockEventBus for all service tests
2. **Integration Tests**: Use real SocketEventBus with test server
3. **E2E Tests**: Verify events reach clients correctly

## Rollback Plan
1. Keep old code in feature branch
2. Use feature flag to toggle between patterns
3. Can revert by re-exporting io if needed

## Success Criteria
- [ ] Zero imports of `io` from index.ts
- [ ] All services testable without Socket.io
- [ ] Event emissions working correctly
- [ ] No performance degradation
- [ ] Tests coverage > 80%

## Files Affected
```
MODIFIED:
- src/index.ts (remove export)
- src/services/autoPickService.ts
- src/services/liveScoreService.ts
- src/services/draftScheduler.ts
- src/services/scoreScheduler.ts
- src/services/waiverScheduler.ts
- src/services/pushNotificationService.ts
- src/services/tokenCleanupService.ts
- src/socket/*.ts (all socket handlers)

NEW:
- src/interfaces/IEventBus.ts
- src/services/eventBus/SocketEventBus.ts
- src/services/eventBus/MockEventBus.ts
- src/factories/ServiceFactory.ts
- src/__tests__/services/eventBus/*.test.ts
```

## Estimated Timeline
- Day 1: Create interfaces and implementations (Tasks 1-3)
- Day 2: Refactor services (Tasks 4-7)
- Day 3: Testing and documentation (Tasks 8-10)

## Dependencies
- Must be completed before Task 03 (Dependency Injection)
- Blocks testing improvements (Task 11)