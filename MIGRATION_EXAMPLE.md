# Migration Example: Converting Service to DI Pattern

This document shows a real-world example of migrating an existing service to use Dependency Injection.

## Example: League Standings Service

### Before Migration

The original service directly imports global dependencies:

```typescript
// src/services/standingsService.ts (BEFORE)
import pool from "../config/database";
import { logger } from "../config/logger";
import { Roster } from "../models/Roster";

export async function calculateStandings(leagueId: number): Promise<Roster[]> {
  try {
    // Direct database query
    const query = `
      SELECT r.id, r.roster_name, r.user_id, r.league_id,
             r.wins, r.losses, r.ties,
             r.points_for, r.points_against,
             r.waiver_position, r.faab_budget,
             u.username
      FROM rosters r
      JOIN users u ON r.user_id = u.id
      WHERE r.league_id = $1
      ORDER BY r.wins DESC, r.points_for DESC
    `;

    const result = await pool.query(query, [leagueId]);

    logger.info("Calculated standings", {
      leagueId,
      rosterCount: result.rows.length,
    });

    return result.rows;
  } catch (error) {
    logger.error("Failed to calculate standings", { error, leagueId });
    throw new Error("Failed to calculate standings");
  }
}

export async function updateStandings(leagueId: number): Promise<void> {
  try {
    // More direct database access
    await pool.query(
      "UPDATE rosters SET updated_at = NOW() WHERE league_id = $1",
      [leagueId]
    );

    logger.info("Updated standings", { leagueId });
  } catch (error) {
    logger.error("Failed to update standings", { error, leagueId });
    throw new Error("Failed to update standings");
  }
}
```

### Problems with Old Approach

1. ❌ **Not Testable**: Can't test without real database
2. ❌ **Tight Coupling**: Direct dependency on `pool` and `logger`
3. ❌ **Global State**: Uses imported singletons
4. ❌ **No Mocking**: Impossible to mock dependencies
5. ❌ **Poor Separation**: Database queries mixed with business logic
6. ❌ **Code Duplication**: Same queries repeated across codebase

---

## After Migration

### Step 1: Create Repository (if not exists)

First, ensure RosterRepository exists with the needed methods:

```typescript
// src/repositories/RosterRepository.ts
import { BaseRepository } from './BaseRepository';
import pool from '../config/database';
import { logger } from '../config/logger';

export interface Roster {
  id: number;
  roster_name: string;
  user_id: number;
  league_id: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  // ... other fields
}

export class RosterRepository extends BaseRepository<Roster> {
  constructor(dbPool = pool) {
    super('rosters', 'id', dbPool);
  }

  /**
   * Get standings data for a league
   * Includes user information to prevent N+1 queries
   */
  async getStandingsData(leagueId: number): Promise<Roster[]> {
    try {
      const query = `
        SELECT r.id, r.roster_name, r.user_id, r.league_id,
               r.wins, r.losses, r.ties,
               r.points_for, r.points_against,
               r.waiver_position, r.faab_budget,
               u.username
        FROM rosters r
        JOIN users u ON r.user_id = u.id
        WHERE r.league_id = $1
        ORDER BY r.wins DESC, r.points_for DESC
      `;

      const result = await this.pool.query(query, [leagueId]);

      logger.debug("Retrieved standings data", {
        leagueId,
        count: result.rows.length,
      });

      return result.rows;
    } catch (error: any) {
      logger.error("Failed to get standings data", {
        error: error.message,
        leagueId,
      });
      throw error;
    }
  }

  /**
   * Update timestamps for all rosters in league
   */
  async touchRostersInLeague(leagueId: number): Promise<void> {
    await this.pool.query(
      "UPDATE rosters SET updated_at = NOW() WHERE league_id = $1",
      [leagueId]
    );
  }
}

// Export singleton instance
export const rosterRepository = new RosterRepository();
```

### Step 2: Convert Service to Class with DI

```typescript
// src/services/standingsService.ts (AFTER)
import { RosterRepository } from '../repositories/RosterRepository';
import { LoggerInterface } from '../types/dependencies';
import { Roster } from '../models/Roster';

/**
 * Standings Service
 * Handles league standings calculations and updates
 */
export class StandingsService {
  constructor(
    private readonly rosterRepo: RosterRepository,
    private readonly logger: LoggerInterface
  ) {}

  /**
   * Calculate and return standings for a league
   */
  async calculateStandings(leagueId: number): Promise<Roster[]> {
    try {
      this.logger.info("Calculating standings", { leagueId });

      const rosters = await this.rosterRepo.getStandingsData(leagueId);

      this.logger.info("Calculated standings", {
        leagueId,
        rosterCount: rosters.length,
      });

      return rosters;
    } catch (error: any) {
      this.logger.error("Failed to calculate standings", {
        error: error.message,
        leagueId,
      });
      throw new Error("Failed to calculate standings");
    }
  }

  /**
   * Update standings timestamps
   */
  async updateStandings(leagueId: number): Promise<void> {
    try {
      this.logger.info("Updating standings", { leagueId });

      await this.rosterRepo.touchRostersInLeague(leagueId);

      this.logger.info("Updated standings", { leagueId });
    } catch (error: any) {
      this.logger.error("Failed to update standings", {
        error: error.message,
        leagueId,
      });
      throw new Error("Failed to update standings");
    }
  }

  /**
   * Get playoff-eligible rosters (top N teams)
   */
  async getPlayoffEligibleRosters(
    leagueId: number,
    playoffSpots: number
  ): Promise<Roster[]> {
    const standings = await this.calculateStandings(leagueId);
    return standings.slice(0, playoffSpots);
  }
}

// Factory function for DI Container
export function createStandingsService(
  rosterRepo: RosterRepository,
  logger: LoggerInterface
): StandingsService {
  return new StandingsService(rosterRepo, logger);
}

// Export singleton instance for backward compatibility
import { rosterRepository } from '../repositories/RosterRepository';
import { defaultLogger } from './defaults';

export const standingsService = new StandingsService(
  rosterRepository,
  defaultLogger
);
```

### Step 3: Register in DI Container

```typescript
// src/container/index.ts
container.registerSingleton('service.standings', (c) => {
  const rosterRepo = c.resolve<RosterRepository>('repository.roster');
  const logger = c.resolve<LoggerInterface>('logger');

  return createStandingsService(rosterRepo, logger);
});
```

### Step 4: Create Comprehensive Tests

```typescript
// src/__tests__/services/standingsService.test.ts
import { StandingsService } from '../../services/standingsService';
import { RosterRepository } from '../../repositories/RosterRepository';
import { LoggerInterface } from '../../types/dependencies';

describe('StandingsService', () => {
  let service: StandingsService;
  let mockRosterRepo: jest.Mocked<RosterRepository>;
  let mockLogger: jest.Mocked<LoggerInterface>;

  beforeEach(() => {
    mockRosterRepo = {
      getStandingsData: jest.fn(),
      touchRostersInLeague: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    service = new StandingsService(mockRosterRepo, mockLogger);
  });

  describe('calculateStandings', () => {
    it('should calculate standings successfully', async () => {
      const mockRosters = [
        {
          id: 1,
          roster_name: 'Team 1',
          wins: 5,
          losses: 2,
          points_for: 850.5,
        },
        {
          id: 2,
          roster_name: 'Team 2',
          wins: 4,
          losses: 3,
          points_for: 800.0,
        },
      ];

      mockRosterRepo.getStandingsData.mockResolvedValue(mockRosters as any);

      const result = await service.calculateStandings(1);

      expect(result).toEqual(mockRosters);
      expect(mockRosterRepo.getStandingsData).toHaveBeenCalledWith(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Calculating standings',
        { leagueId: 1 }
      );
    });

    it('should handle errors gracefully', async () => {
      mockRosterRepo.getStandingsData.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.calculateStandings(1)).rejects.toThrow(
        'Failed to calculate standings'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateStandings', () => {
    it('should update standings successfully', async () => {
      mockRosterRepo.touchRostersInLeague.mockResolvedValue();

      await service.updateStandings(1);

      expect(mockRosterRepo.touchRostersInLeague).toHaveBeenCalledWith(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Updated standings',
        { leagueId: 1 }
      );
    });
  });

  describe('getPlayoffEligibleRosters', () => {
    it('should return top N rosters', async () => {
      const mockRosters = [
        { id: 1, wins: 10 },
        { id: 2, wins: 9 },
        { id: 3, wins: 8 },
        { id: 4, wins: 7 },
        { id: 5, wins: 6 },
      ];

      mockRosterRepo.getStandingsData.mockResolvedValue(mockRosters as any);

      const result = await service.getPlayoffEligibleRosters(1, 4);

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe(1);
      expect(result[3].id).toBe(4);
    });
  });
});
```

### Step 5: Update Callers

**Before:**
```typescript
import { calculateStandings } from '../services/standingsService';

// In controller
const standings = await calculateStandings(leagueId);
```

**After (Option 1 - Use singleton):**
```typescript
import { standingsService } from '../services/standingsService';

// In controller
const standings = await standingsService.calculateStandings(leagueId);
```

**After (Option 2 - Use container):**
```typescript
import { container } from '../container';
import { StandingsService } from '../services/standingsService';

// In controller setup
const standingsService = container.resolve<StandingsService>('service.standings');
const standings = await standingsService.calculateStandings(leagueId);
```

---

## Benefits After Migration

### ✅ Testability
- Can test without database
- Can mock all dependencies
- Fast unit tests

### ✅ Maintainability
- Clear dependencies
- Single responsibility
- Easy to understand

### ✅ Flexibility
- Can swap implementations
- Easy to add features
- Better code reuse

### ✅ Code Quality
- No global state
- Type-safe dependencies
- Better error handling

---

## Migration Checklist

Use this checklist when migrating a service:

- [ ] Identify all dependencies (imports of global state)
- [ ] Create or update repositories for database access
- [ ] Convert function to class
- [ ] Add constructor with dependency injection
- [ ] Replace global imports with injected dependencies
- [ ] Create factory function
- [ ] Register in DI container
- [ ] Export singleton for backward compatibility
- [ ] Create comprehensive unit tests
- [ ] Update all callers
- [ ] Verify tests pass
- [ ] Update documentation

---

## Common Migration Patterns

### Pattern 1: Service with Database Access

**Before:**
```typescript
import pool from '../config/database';

export async function getData(id: number) {
  const result = await pool.query('SELECT * FROM table WHERE id = $1', [id]);
  return result.rows[0];
}
```

**After:**
```typescript
class MyService {
  constructor(private repo: MyRepository) {}

  async getData(id: number) {
    return await this.repo.findById(id);
  }
}
```

### Pattern 2: Service with Socket.io

**Before:**
```typescript
import { io } from '../index';

export async function doAction(data: any) {
  // ... logic
  io.emit('action:complete', { data });
}
```

**After:**
```typescript
import { IEventBus } from '../interfaces/IEventBus';

class MyService {
  constructor(private eventBus: IEventBus) {}

  async doAction(data: any) {
    // ... logic
    this.eventBus.emit('action:complete', { data });
  }
}
```

### Pattern 3: Service with Multiple Dependencies

**Before:**
```typescript
import pool from '../config/database';
import { io } from '../index';
import { logger } from '../config/logger';

export async function complexAction(data: any) {
  const result = await pool.query('...');
  io.emit('event', result);
  logger.info('Done');
  return result;
}
```

**After:**
```typescript
class MyService {
  constructor(
    private repo: MyRepository,
    private eventBus: IEventBus,
    private logger: LoggerInterface
  ) {}

  async complexAction(data: any) {
    const result = await this.repo.doSomething(data);
    this.eventBus.emit('event', result);
    this.logger.info('Done');
    return result;
  }
}
```

---

## Summary

**Key Takeaways:**

1. **Move database queries to repositories**
2. **Convert functions to classes**
3. **Inject all dependencies**
4. **Register in container**
5. **Write comprehensive tests**

**Result:**
- 100% testable code
- Clear dependencies
- Maintainable architecture
- Better code reuse

**Next Steps:**
- Pick a service to migrate
- Follow the checklist
- Write tests first
- Get code review
