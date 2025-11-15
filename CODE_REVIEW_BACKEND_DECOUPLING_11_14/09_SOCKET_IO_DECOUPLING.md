# Task 09: Socket.io Decoupling
## Priority: HIGH | Effort: 3 days | Impact: HIGH

## Problem Statement
- Global io export from index.ts
- Services directly importing socket functions
- Socket handlers tightly coupled to business logic
- Difficult to test socket functionality
- No abstraction for real-time communication

## Detailed Subtasks

### 1. Remove Global IO Export (2 hours)
- [ ] Remove `export { io }` from index.ts
- [ ] Update all files importing io
- [ ] Pass io through dependency injection
- [ ] Update socket handler setup

### 2. Create WebSocket Abstraction (4 hours)
- [ ] Create IRealtimeService interface
- [ ] Implement SocketIOService
- [ ] Add room management abstraction
- [ ] Add connection management
- [ ] Support multiple transports

### 3. Decouple Socket Handlers (1 day)
- [ ] Extract business logic from socket handlers
- [ ] Create socket controllers
- [ ] Use event bus for communication
- [ ] Separate authorization logic

### 4. Implement Socket Testing (4 hours)
- [ ] Create socket test client
- [ ] Mock socket connections
- [ ] Test event emissions
- [ ] Test room management

### 5. Add Socket Middleware (2 hours)
- [ ] Create reusable socket middleware
- [ ] Add authentication middleware
- [ ] Add rate limiting
- [ ] Add error handling

## Files to Update
- src/index.ts (remove export)
- src/services/* (7+ services)
- src/socket/* (all handlers)
- New abstraction files

## Success Criteria
- [ ] No global io export
- [ ] Socket logic abstracted
- [ ] Services don't import socket.io
- [ ] Socket handlers testable
- [ ] WebSocket transport agnostic