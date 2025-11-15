# Task 07: Service Layer Decoupling
## Priority: HIGH | Effort: 4 days | Impact: HIGH

## Problem Statement
Services have multiple coupling issues:
- Direct dependencies between services
- Services calling other services directly
- No clear service boundaries
- Mixed responsibilities within services
- Circular dependency risks

## Detailed Subtasks

### 1. Define Service Interfaces (2 hours)
- [ ] Create interface for each service
- [ ] Define clear contracts
- [ ] Document service responsibilities
- [ ] Establish service boundaries

### 2. Break Up Large Services (1 day)
- [ ] Split leagueBusinessService into smaller services
- [ ] Split recordService into record and statistics services
- [ ] Split waiverService into claim and processing services
- [ ] Create domain-specific services

### 3. Implement Service Facades (4 hours)
- [ ] Create facades for complex operations
- [ ] Hide internal service complexity
- [ ] Provide simple APIs for controllers
- [ ] Reduce service-to-service dependencies

### 4. Extract Shared Logic (4 hours)
- [ ] Create domain services for shared logic
- [ ] Extract calculation utilities
- [ ] Create validation services
- [ ] Centralize business rules

### 5. Implement Event-Driven Communication (6 hours)
- [ ] Replace direct service calls with events
- [ ] Implement domain events
- [ ] Create event handlers
- [ ] Decouple service interactions

## Service Dependency Map
```
Current Problems:
- recordService → sleeperScheduleService
- standingsService → multiple services
- waiverService → 5+ other services

Target:
- Services → Repositories only
- Controllers → Services
- Services → Event Bus (for cross-domain)
```

## Success Criteria
- [ ] No service imports other services
- [ ] All services < 500 lines
- [ ] Clear service boundaries
- [ ] Event-driven communication
- [ ] No circular dependencies