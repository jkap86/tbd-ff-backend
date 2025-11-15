# Quick Start Implementation Guide
## Immediate Actions You Can Take Today

Based on the comprehensive decoupling analysis, here are the **Quick Wins** you can implement immediately:

## Priority 1: Remove Global Socket.io Export (30 minutes)

### Step 1: Create Event Bus Interface
```bash
# Create the interface file
mkdir -p src/interfaces
```

Create `src/interfaces/IEventBus.ts`:
```typescript
export interface IEventBus {
  emit<T = any>(event: string, data: T): void;
  emitToRoom<T = any>(room: string, event: string, data: T): void;
  emitToUser<T = any>(userId: number, event: string, data: T): void;
}
```

### Step 2: Create Event Bus Implementation
```bash
mkdir -p src/services/eventBus
```

Create `src/services/eventBus/SocketEventBus.ts` (use code from Task 01 doc)

### Step 3: Remove Global Export
In `src/index.ts`:
- Line 196: Remove `export { io };`
- Create event bus instance after io creation:
```typescript
const eventBus = new SocketEventBus(io);
```

**Impact**: Immediately unblocks service testing

---

## Priority 2: Replace 10 Most Critical Console Statements (15 minutes)

### Files to update first:
1. `src/services/autoPickService.ts`
2. `src/services/recordService.ts`
3. `src/services/draftScheduler.ts`
4. `src/services/scoreScheduler.ts`
5. `src/services/waiverScheduler.ts`

### Search and replace pattern:
```bash
# Find console.log
grep -n "console\.log" src/services/autoPickService.ts

# Replace with logger.info or logger.debug
# Use your IDE's find/replace:
# Find: console.log
# Replace: logger.info
```

**Impact**: Better production logging immediately

---

## Priority 3: Create First Repository (1 hour)

### Start with RosterRepository
Create `src/repositories/RosterRepository.ts`:

```typescript
import { BaseRepository } from '../models/BaseRepository';
import { Pool } from 'pg';

export class RosterRepository extends BaseRepository<any> {
  constructor(pool: Pool) {
    super('rosters', 'id', pool);
  }

  async getByLeague(leagueId: number): Promise<any[]> {
    return this.findBy({ league_id: leagueId });
  }

  async getStandings(leagueId: number): Promise<any[]> {
    const query = `
      SELECT
        r.id,
        r.team_name,
        COALESCE((r.settings->>'wins')::int, 0) as wins,
        COALESCE((r.settings->>'losses')::int, 0) as losses,
        COALESCE((r.settings->>'points_for')::numeric, 0) as points_for
      FROM rosters r
      WHERE r.league_id = $1
      ORDER BY wins DESC, points_for DESC
    `;
    const result = await this.query(query, [leagueId]);
    return result.rows;
  }
}
```

Then update `src/services/standingsService.ts` to use it.

**Impact**: Demonstrates repository pattern benefits

---

## Priority 4: Create Test Container (30 minutes)

Create `src/__tests__/helpers/TestContainer.ts`:

```typescript
import { DIContainer } from '../../container/DIContainer';

export class TestContainer {
  private container: DIContainer;

  constructor() {
    this.container = new DIContainer();
    this.registerMocks();
  }

  private registerMocks(): void {
    // Mock logger
    this.container.registerSingleton('infrastructure.logger', () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }));

    // Mock event bus
    this.container.registerSingleton('infrastructure.eventBus', () => ({
      emit: jest.fn(),
      emitToRoom: jest.fn(),
      emitToUser: jest.fn()
    }));
  }

  getContainer(): DIContainer {
    return this.container;
  }
}
```

**Impact**: Makes services immediately testable

---

## Today's Implementation Plan

### Morning (2-3 hours):
1. ✅ Create IEventBus interface (5 min)
2. ✅ Create SocketEventBus implementation (15 min)
3. ✅ Remove `export { io }` from index.ts (5 min)
4. ✅ Update 1-2 services to use event bus (30 min)
5. ✅ Test the changes (30 min)

### Afternoon (2-3 hours):
1. ✅ Create RosterRepository (30 min)
2. ✅ Update standingsService to use repository (30 min)
3. ✅ Replace console statements in 5 files (45 min)
4. ✅ Create TestContainer (30 min)
5. ✅ Write tests for refactored service (45 min)

---

## Testing Your Changes

### After Event Bus Implementation:
```bash
# Test that services still work
npm test -- autoPickService.test.ts
```

### After Repository Implementation:
```bash
# Test standings endpoint
npm test -- standingsService.test.ts
```

### After Console Replacement:
```bash
# Check no console statements remain
grep -r "console\." src/services/autoPickService.ts
# Should return nothing
```

---

## Rollback Strategy

### If Event Bus Breaks:
```typescript
// In index.ts, temporarily re-add:
export { io };
```

### If Repository Breaks:
```typescript
// Keep old query functions until verified:
export async function getStandingsOld(leagueId: number) {
  // old implementation
}
```

---

## Measuring Success

After today's work, you should have:
- [ ] Event bus abstraction in place
- [ ] At least 1 repository created and tested
- [ ] 10+ console statements replaced with logger
- [ ] Test container for mocking dependencies
- [ ] All tests passing
- [ ] No breaking changes to existing functionality

---

## Tomorrow's Plan

After completing today's quick wins, continue with:

### Phase 1, Day 2:
1. Create MatchupRepository
2. Update recordService to use repositories
3. Replace remaining console statements in services
4. Create DIContainer core implementation

### Phase 1, Day 3-4:
1. Complete Event Bus migration for all services
2. Create remaining critical repositories
3. Implement full DI container
4. Write comprehensive tests

---

## Getting Help

If you encounter issues:

1. **Event Bus Issues**: Check `01_EVENT_BUS_ABSTRACTION.md` for detailed examples
2. **Repository Issues**: Check `02_REPOSITORY_PATTERN.md` for patterns
3. **Testing Issues**: Check `11_TESTING_INFRASTRUCTURE.md` for test patterns

---

## Branch Strategy

```bash
# Create feature branch for Phase 1
git checkout -b decoupling/phase-1-foundation

# Make small commits for each change
git add src/interfaces/IEventBus.ts
git commit -m "feat: add event bus interface"

git add src/services/eventBus/SocketEventBus.ts
git commit -m "feat: implement socket event bus"

# Continue with incremental commits
```

---

## Expected Results After Day 1

### Code Quality Metrics:
- Global exports: 1 → 0 (removed io export)
- Console statements: 486 → 476 (10 replaced)
- Direct DB queries: 878 → 850 (28 moved to repository)
- Testable services: 0 → 2-3 (using DI)

### Technical Benefits:
- Services can be unit tested without Socket.io
- Database queries centralized in repositories
- Structured logging for production
- Foundation for complete decoupling

### Risk Mitigation:
- All changes are backward compatible
- Original code preserved during migration
- Feature flags can toggle new vs old code
- Easy to rollback if needed

---

## Next Steps After Quick Wins

Once you've completed these quick wins successfully:

1. **Week 1**: Complete Phase 1 tasks (Event Bus, Repositories, DI)
2. **Week 2**: Begin Phase 2 tasks (External APIs, Controllers)
3. **Week 3-4**: Continue with remaining phases
4. **Week 5+**: Testing, optimization, documentation

The foundation you build today will make all subsequent refactoring much easier!