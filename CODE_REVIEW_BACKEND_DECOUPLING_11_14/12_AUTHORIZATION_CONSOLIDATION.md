# Task 12: Authorization Consolidation
## Priority: MEDIUM | Effort: 2 days | Impact: MEDIUM

## Problem Statement
Authorization logic is duplicated across multiple layers:
- `services/authorizationService.ts` - Core checks
- `utils/draftAuthorization.ts` - Thin wrappers
- `utils/leagueAuthorization.ts` - More wrappers
- `middleware/authorization.ts` - Middleware versions
- `controllers/BaseController.ts` - Controller methods

## Detailed Subtasks

### 1. Create Unified Authorization Service (3 hours)
- [ ] Consolidate all authorization logic
- [ ] Create single source of truth
- [ ] Remove duplicate functions
- [ ] Standardize authorization responses
- [ ] Add role-based access control

### 2. Implement Authorization Decorators (2 hours)
- [ ] Create @RequireAuth decorator
- [ ] Create @RequireRole decorator
- [ ] Create @RequireOwnership decorator
- [ ] Create @RequireLeagueMember decorator
- [ ] Add custom authorization decorators

### 3. Remove Duplicate Authorization Code (2 hours)
- [ ] Delete wrapper utilities
- [ ] Update all references
- [ ] Consolidate middleware
- [ ] Remove controller auth methods
- [ ] Update tests

### 4. Implement Policy-Based Authorization (3 hours)
- [ ] Create authorization policies
- [ ] Define resource-based rules
- [ ] Add context-aware checks
- [ ] Support complex permissions
- [ ] Add permission caching

### 5. Add Authorization Audit Trail (1 hour)
- [ ] Log all authorization attempts
- [ ] Track permission changes
- [ ] Add security monitoring
- [ ] Create audit reports
- [ ] Add alerting for violations

## Files to Update/Delete
```
DELETE:
- utils/draftAuthorization.ts
- utils/leagueAuthorization.ts

MODIFY:
- services/authorizationService.ts
- middleware/authorization.ts
- controllers/BaseController.ts
- All controllers using auth
```

## Authorization Hierarchy
```
1. Authentication (JWT validation)
2. Basic Authorization (user exists, active)
3. Role-Based (admin, commissioner, member)
4. Resource-Based (ownership, league membership)
5. Context-Based (draft participant, trade partner)
```

## Success Criteria
- [ ] Single authorization service
- [ ] No duplicate auth logic
- [ ] Decorator-based auth
- [ ] Policy-based rules
- [ ] Complete audit trail
- [ ] 100% test coverage

## Testing Strategy
1. Unit test all policies
2. Integration test middleware
3. E2E test authorization flows
4. Security penetration testing
5. Performance test auth checks

## Benefits
1. **Consistency**: Single source of truth
2. **Maintainability**: Easy to update rules
3. **Security**: Comprehensive audit trail
4. **Performance**: Cached permissions
5. **Flexibility**: Policy-based rules

## Estimated Timeline
- Day 1: Consolidation and decorators
- Day 2: Policy implementation and testing