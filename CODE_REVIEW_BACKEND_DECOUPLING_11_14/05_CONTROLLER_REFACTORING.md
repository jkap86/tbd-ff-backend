# Task 05: Controller Refactoring
## Priority: MEDIUM | Effort: 3 days | Impact: MEDIUM

## Problem Statement
Controllers have multiple issues:
- Fat controllers handling too many responsibilities
- Business logic mixed with HTTP handling
- Direct socket emission from controllers
- Inconsistent error handling
- Duplicated authorization logic

## Detailed Subtasks

### 1. Split Fat Controllers (2 hours per controller)
- [ ] Split DraftController into DraftCreationController, DraftManagementController, DraftPickController
- [ ] Split LeagueController into LeagueCreationController, LeagueSettingsController, LeagueStatsController
- [ ] Split RosterController into RosterManagementController, RosterLineupController
- [ ] Split TradeController into TradeProposalController, TradeProcessingController

### 2. Extract Business Logic to Services (3 hours)
- [ ] Move all business logic from controllers to services
- [ ] Controllers should only handle HTTP request/response
- [ ] Create command/query objects for complex operations
- [ ] Implement proper validation layers

### 3. Remove Socket Dependencies from Controllers (2 hours)
- [ ] Controllers should not import socket functions
- [ ] Use event bus or service layer for real-time updates
- [ ] Decouple HTTP layer from WebSocket layer

### 4. Standardize Response Handling (1 hour)
- [ ] Create consistent response format
- [ ] Implement response interceptors
- [ ] Add request ID tracking
- [ ] Standardize error responses

### 5. Consolidate Authorization (2 hours)
- [ ] Create authorization decorators
- [ ] Move all auth checks to middleware
- [ ] Remove auth logic from controllers
- [ ] Create role-based access control

## Files Affected
- All controller files (35+ files)
- Route files need updates
- New controller files created

## Success Criteria
- [ ] No business logic in controllers
- [ ] Controllers < 100 lines each
- [ ] No socket imports in controllers
- [ ] Consistent response format
- [ ] All auth in middleware