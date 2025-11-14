# Dependency Injection Pattern Guide

## Overview

This guide describes a lightweight dependency injection (DI) pattern for improving testability in the TBD Fantasy Football backend. The pattern is designed to be simple, gradual, and backward-compatible.

## Table of Contents

1. [Why Dependency Injection?](#why-dependency-injection)
2. [Design Principles](#design-principles)
3. [Pattern Overview](#pattern-overview)
4. [Implementation Guide](#implementation-guide)
5. [Testing with DI](#testing-with-di)
6. [Migration Strategy](#migration-strategy)
7. [Common Patterns](#common-patterns)
8. [Best Practices](#best-practices)

---

## Why Dependency Injection?

### Current Problem

Services currently import dependencies directly:

```typescript
// Current approach - hard to test
import pool from "../config/database";
import { logger } from "../config/logger";
import { sendEmail } from "./emailService";

export async function processWaivers(leagueId: number) {
  const result = await pool.query("SELECT ...", [leagueId]);
  await sendEmail(...);
  logger.info("Processed waivers");
}
```

**Testing Challenges:**
- Cannot easily mock database queries
- Cannot isolate service logic from external dependencies
- Tests require actual database connection or complex mocking
- Hard to test error scenarios

### With Dependency Injection

```typescript
// With DI - easy to test
export class WaiverService {
  constructor(
    private db: DatabaseClient,
    private emailService: EmailService,
    private logger: Logger
  ) {}

  async processWaivers(leagueId: number) {
    const result = await this.db.query("SELECT ...", [leagueId]);
    await this.emailService.send(...);
    this.logger.info("Processed waivers");
  }
}

// In tests: inject mocks
const service = new WaiverService(mockDb, mockEmail, mockLogger);
```

**Benefits:**
- Easy to mock dependencies in tests
- Clear visibility of service dependencies
- Easier to test edge cases and error scenarios
- Better separation of concerns

---

## Design Principles

### 1. Keep It Simple
- No heavy DI frameworks (no InversifyJS, no TypeDI)
- Use native TypeScript features (classes, constructors)
- Minimal boilerplate

### 2. Gradual Migration
- New services use DI from the start
- Existing services can be migrated incrementally
- Maintain backward compatibility where possible

### 3. Flexible Patterns
- Support both class-based and factory function approaches
- Allow optional dependencies with sensible defaults
- Support both constructor and factory injection

### 4. Production-Ready
- Default to production dependencies when not specified
- Make it easy to use in production code
- Clear separation between production and test setup

---

## Pattern Overview

### Three Main Patterns

#### 1. Constructor Injection (Recommended for New Services)

```typescript
export class RecordService {
  constructor(
    private db: DatabaseClient = pool,
    private logger: Logger = defaultLogger
  ) {}

  async finalizeWeekScores(...) {
    const result = await this.db.query(...);
    this.logger.info("Finalized scores");
  }
}

// Production usage (uses defaults)
const recordService = new RecordService();

// Test usage (inject mocks)
const recordService = new RecordService(mockDb, mockLogger);
```

#### 2. Factory Function (For Existing Services)

```typescript
export interface WaiverServiceDeps {
  db?: DatabaseClient;
  logger?: Logger;
  emailService?: EmailService;
}

export function createWaiverService(deps: WaiverServiceDeps = {}) {
  const db = deps.db || pool;
  const logger = deps.logger || defaultLogger;
  const emailService = deps.emailService || defaultEmailService;

  return {
    async processWaivers(leagueId: number) {
      const result = await db.query(...);
      await emailService.send(...);
      logger.info("Processed");
    }
  };
}

// Production
const waiverService = createWaiverService();

// Tests
const waiverService = createWaiverService({
  db: mockDb,
  logger: mockLogger
});
```

#### 3. Service Container (Optional - For Complex Cases)

```typescript
// services/container.ts
export class ServiceContainer {
  private static instance: ServiceContainer;

  constructor(
    public db: DatabaseClient = pool,
    public logger: Logger = defaultLogger,
    public emailService: EmailService = defaultEmailService
  ) {}

  static getInstance(): ServiceContainer {
    if (!this.instance) {
      this.instance = new ServiceContainer();
    }
    return this.instance;
  }

  static setTestInstance(container: ServiceContainer) {
    this.instance = container;
  }
}

// Usage in services
const container = ServiceContainer.getInstance();
await container.db.query(...);
```

---

## Implementation Guide

### Step 1: Define Interface Types

Create type definitions for your dependencies:

```typescript
// types/dependencies.ts

import { Pool, PoolClient } from 'pg';
import { Logger } from 'winston';

// Database client interface
export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

// Logger interface
export interface LoggerInterface {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

// Email service interface
export interface EmailServiceInterface {
  sendPasswordResetEmail(email: string, username: string, token: string): Promise<void>;
  sendLeagueInvite(email: string, leagueName: string, inviteCode: string): Promise<void>;
}

// Push notification interface
export interface PushNotificationInterface {
  sendNotification(userId: number, title: string, body: string, data?: any): Promise<void>;
  sendBulkNotifications(notifications: Array<{userId: number, title: string, body: string}>): Promise<void>;
}
```

### Step 2: Create Default Implementations

```typescript
// services/defaults.ts

import pool from '../config/database';
import { logger } from '../config/logger';
import * as emailService from './emailService';
import * as pushService from './pushNotificationService';
import {
  DatabaseClient,
  LoggerInterface,
  EmailServiceInterface,
  PushNotificationInterface
} from '../types/dependencies';

// Database client wrapper
export const defaultDbClient: DatabaseClient = {
  query: (sql: string, params?: any[]) => pool.query(sql, params)
};

// Logger wrapper
export const defaultLogger: LoggerInterface = {
  info: (message: string, meta?: any) => logger.info(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta)
};

// Email service wrapper
export const defaultEmailService: EmailServiceInterface = {
  sendPasswordResetEmail: emailService.sendPasswordResetEmail,
  sendLeagueInvite: emailService.sendLeagueInvite
};

// Push notification wrapper
export const defaultPushService: PushNotificationInterface = {
  sendNotification: pushService.sendNotification,
  sendBulkNotifications: pushService.sendBulkNotifications
};
```

### Step 3: Refactor Service (Class-Based)

```typescript
// services/recordService.ts

import { DatabaseClient, LoggerInterface } from '../types/dependencies';
import { defaultDbClient, defaultLogger } from './defaults';

export class RecordService {
  constructor(
    private db: DatabaseClient = defaultDbClient,
    private logger: LoggerInterface = defaultLogger
  ) {}

  async finalizeWeekScores(
    leagueId: number,
    week: number,
    season: string,
    seasonType: string = "regular"
  ): Promise<void> {
    try {
      this.logger.info(`[FinalizeScores] Checking if week ${week} is complete...`);

      // Use injected db instead of imported pool
      const matchupsResult = await this.db.query(
        `SELECT id, roster1_id, roster2_id, roster1_score, roster2_score
         FROM matchups
         WHERE league_id = $1 AND week = $2 AND season = $3
         AND (finalized IS NULL OR finalized = FALSE)`,
        [leagueId, week, season]
      );

      const matchups = matchupsResult.rows;

      if (matchups.length === 0) {
        this.logger.info(`[FinalizeScores] All matchups for week ${week} already finalized`);
        return;
      }

      // ... rest of implementation using this.db and this.logger
    } catch (error) {
      this.logger.error("Error finalizing week scores:", { error });
      throw error;
    }
  }

  async resetAllRosterRecords(leagueId: number): Promise<void> {
    // Implementation...
  }

  async recalculateAllRecords(leagueId: number, season: string): Promise<void> {
    // Implementation...
  }
}

// Export singleton instance for backward compatibility
export const recordService = new RecordService();

// Also export the class for custom instantiation
export default RecordService;
```

### Step 4: Refactor Service (Factory Function)

```typescript
// services/waiverService.ts

import { DatabaseClient, LoggerInterface, EmailServiceInterface } from '../types/dependencies';
import { defaultDbClient, defaultLogger, defaultEmailService } from './defaults';
import { withTransaction } from '../utils/transactionWrapper';

export interface WaiverServiceDeps {
  db?: DatabaseClient;
  logger?: LoggerInterface;
  emailService?: EmailServiceInterface;
}

export function createWaiverService(deps: WaiverServiceDeps = {}) {
  const db = deps.db || defaultDbClient;
  const logger = deps.logger || defaultLogger;
  const emailService = deps.emailService || defaultEmailService;

  return {
    async submitWaiverClaim(
      rosterId: number,
      playerId: number,
      dropPlayerId: number | null,
      bidAmount: number
    ) {
      try {
        // Validate bid amount
        const rosterResult = await db.query(
          'SELECT faab_budget FROM rosters WHERE id = $1',
          [rosterId]
        );

        if (bidAmount > rosterResult.rows[0].faab_budget) {
          throw new Error(`Bid amount exceeds FAAB budget`);
        }

        // Create claim...
        logger.info(`Created waiver claim for roster ${rosterId}`);
      } catch (error) {
        logger.error("Error submitting waiver claim:", error);
        throw error;
      }
    },

    async processWaivers(leagueId: number) {
      // Implementation...
    }
  };
}

// Export default instance for backward compatibility
export const waiverService = createWaiverService();

// Export individual functions for existing code
export const submitWaiverClaim = waiverService.submitWaiverClaim;
export const processWaivers = waiverService.processWaivers;
```

---

## Testing with DI

### Creating Mocks

```typescript
// __tests__/helpers/mocks.ts

import { DatabaseClient, LoggerInterface, EmailServiceInterface } from '../../types/dependencies';

export function createMockDb(): DatabaseClient {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] })
  };
}

export function createMockLogger(): LoggerInterface {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };
}

export function createMockEmailService(): EmailServiceInterface {
  return {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLeagueInvite: jest.fn().mockResolvedValue(undefined)
  };
}

// Advanced: Mock with spy tracking
export function createSpyDb(returnValue: any = { rows: [] }): DatabaseClient & { querySpy: jest.Mock } {
  const querySpy = jest.fn().mockResolvedValue(returnValue);
  return {
    query: querySpy,
    querySpy // Expose for assertions
  };
}
```

### Test Example (Class-Based Service)

```typescript
// __tests__/services/recordService.test.ts

import RecordService from '../../services/recordService';
import { createMockDb, createMockLogger } from '../helpers/mocks';

describe('RecordService', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let recordService: RecordService;

  beforeEach(() => {
    mockDb = createMockDb();
    mockLogger = createMockLogger();
    recordService = new RecordService(mockDb, mockLogger);
  });

  describe('finalizeWeekScores', () => {
    it('should skip finalization if no matchups found', async () => {
      // Setup: No matchups to finalize
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify query was called
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, roster1_id'),
        [1, 5, '2025']
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('All matchups for week 5 already finalized')
      );
    });

    it('should finalize matchups and update rosters', async () => {
      // Setup: Mock matchups
      const mockMatchups = [
        { id: 1, roster1_id: 10, roster2_id: 11, roster1_score: 120.5, roster2_score: 95.3 }
      ];

      const mockRosters = [
        { id: 10, settings: { wins: 3, losses: 2, ties: 0, points_for: 500, points_against: 450 } },
        { id: 11, settings: { wins: 2, losses: 3, ties: 0, points_for: 480, points_against: 520 } }
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockMatchups }) // First call: get matchups
        .mockResolvedValueOnce({ rows: mockRosters }) // Second call: get rosters
        .mockResolvedValueOnce({ rows: [] }) // Third call: batch update rosters
        .mockResolvedValueOnce({ rows: [] }); // Fourth call: batch update matchups

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify database calls
      expect(mockDb.query).toHaveBeenCalledTimes(4);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully finalized week 5 scores')
      );
    });

    it('should handle database errors gracefully', async () => {
      // Setup: Simulate database error
      const dbError = new Error('Database connection failed');
      (mockDb.query as jest.Mock).mockRejectedValue(dbError);

      await expect(
        recordService.finalizeWeekScores(1, 5, '2025', 'regular')
      ).rejects.toThrow('Database connection failed');

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error finalizing week scores:',
        { error: dbError }
      );
    });
  });
});
```

### Test Example (Factory Function Service)

```typescript
// __tests__/services/waiverService.test.ts

import { createWaiverService } from '../../services/waiverService';
import { createMockDb, createMockLogger, createMockEmailService } from '../helpers/mocks';

describe('WaiverService', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockEmailService: ReturnType<typeof createMockEmailService>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockLogger = createMockLogger();
    mockEmailService = createMockEmailService();
  });

  describe('submitWaiverClaim', () => {
    it('should reject claim exceeding FAAB budget', async () => {
      const waiverService = createWaiverService({
        db: mockDb,
        logger: mockLogger
      });

      // Setup: Roster has $50 budget
      (mockDb.query as jest.Mock).mockResolvedValue({
        rows: [{ faab_budget: 50 }]
      });

      await expect(
        waiverService.submitWaiverClaim(1, 100, null, 75) // Bid $75
      ).rejects.toThrow('exceeds FAAB budget');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should create valid waiver claim', async () => {
      const waiverService = createWaiverService({
        db: mockDb,
        logger: mockLogger
      });

      // Setup: Roster has $100 budget
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ faab_budget: 100 }] }) // Get budget
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert claim

      await waiverService.submitWaiverClaim(1, 100, null, 25);

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created waiver claim')
      );
    });
  });
});
```

### Integration Test Example

```typescript
// __tests__/integration/waiverService.integration.test.ts

import { createWaiverService } from '../../services/waiverService';
import pool from '../../config/database';
import { createMockLogger } from '../helpers/mocks';

describe('WaiverService Integration Tests', () => {
  let testLeagueId: number;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeAll(async () => {
    // Setup: Create test league in real database
    const result = await pool.query(
      'INSERT INTO leagues (name, season, ...) VALUES ($1, $2, ...) RETURNING id',
      ['Test League', '2025']
    );
    testLeagueId = result.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
  });

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  it('should process waivers with real database', async () => {
    // Use real database, but mock logger for test control
    const waiverService = createWaiverService({
      logger: mockLogger
      // db defaults to real pool
    });

    // Create test claims in database...
    await waiverService.processWaivers(testLeagueId);

    // Verify results in database...
    expect(mockLogger.info).toHaveBeenCalled();
  });
});
```

---

## Migration Strategy

### Phase 1: New Services (Immediate)
All new services should use DI from the start:
- Use class-based pattern for complex services
- Use factory function for simple services
- Always provide default dependencies

### Phase 2: High-Value Refactors (Next)
Migrate services with poor test coverage:
1. `recordService` - Complex business logic
2. `waiverService` - Complex transaction handling
3. `scoringService` - Pure calculation (easy to test)
4. `tradeService` - Complex validation

### Phase 3: Gradual Migration (Ongoing)
Migrate other services as needed:
- When adding new features
- When fixing bugs
- When improving tests

### Backward Compatibility

Maintain compatibility with existing code:

```typescript
// Old service (before DI)
export async function processWaivers(leagueId: number) {
  // Direct imports
}

// New service (with DI)
export class WaiverService {
  constructor(deps) { ... }
  async processWaivers(leagueId: number) { ... }
}

// Compatibility layer
export const waiverService = new WaiverService();
export const processWaivers = waiverService.processWaivers.bind(waiverService);

// Old code still works:
import { processWaivers } from './waiverService';
await processWaivers(leagueId);

// New code can use DI:
import WaiverService from './waiverService';
const service = new WaiverService(mockDeps);
await service.processWaivers(leagueId);
```

---

## Common Patterns

### Pattern 1: Database Transaction Injection

```typescript
export class TradeService {
  constructor(
    private db: DatabaseClient = defaultDbClient,
    private logger: LoggerInterface = defaultLogger
  ) {}

  async processTrade(tradeId: number) {
    // Use transaction wrapper with injected db
    return withTransaction(async (client) => {
      // client is transaction-scoped database client
      const trade = await client.query('SELECT * FROM trades WHERE id = $1', [tradeId]);

      // Update multiple tables atomically
      await client.query('UPDATE rosters ...');
      await client.query('UPDATE trades ...');

      this.logger.info('Trade processed');
    });
  }
}
```

### Pattern 2: Service-to-Service Dependencies

```typescript
export class DraftService {
  constructor(
    private db: DatabaseClient = defaultDbClient,
    private logger: LoggerInterface = defaultLogger,
    private emailService: EmailServiceInterface = defaultEmailService,
    private pushService: PushNotificationInterface = defaultPushService,
    private recordService?: RecordService // Optional dependency
  ) {
    // Initialize optional dependency
    this.recordService = recordService || new RecordService(db, logger);
  }

  async completeDraft(draftId: number) {
    // Use injected services
    await this.db.query('UPDATE drafts SET status = $1 WHERE id = $2', ['completed', draftId]);
    await this.emailService.sendDraftCompleteEmail(...);
    await this.pushService.sendNotification(...);

    // Use service dependency
    await this.recordService!.resetAllRosterRecords(leagueId);

    this.logger.info('Draft completed');
  }
}
```

### Pattern 3: External API Dependencies

```typescript
export interface SleeperApiClient {
  getPlayerStats(playerId: string, week: number): Promise<any>;
  getProjections(season: string): Promise<any>;
}

export class StatsService {
  constructor(
    private db: DatabaseClient = defaultDbClient,
    private sleeperApi: SleeperApiClient = defaultSleeperApi,
    private logger: LoggerInterface = defaultLogger
  ) {}

  async syncPlayerStats(playerId: string, week: number) {
    // Inject external API for easier mocking
    const stats = await this.sleeperApi.getPlayerStats(playerId, week);

    await this.db.query(
      'INSERT INTO player_stats (...) VALUES (...)',
      [...]
    );

    this.logger.info(`Synced stats for player ${playerId}`);
  }
}
```

### Pattern 4: Conditional Dependencies (Feature Flags)

```typescript
export class NotificationService {
  constructor(
    private emailService: EmailServiceInterface = defaultEmailService,
    private pushService?: PushNotificationInterface, // Optional
    private logger: LoggerInterface = defaultLogger
  ) {}

  async notifyUser(userId: number, message: string) {
    // Always send email
    await this.emailService.send(...);

    // Optionally send push notification (if service injected)
    if (this.pushService) {
      await this.pushService.sendNotification(userId, message);
    }

    this.logger.info(`Notified user ${userId}`);
  }
}
```

---

## Best Practices

### DO ✓

1. **Use default parameters for production dependencies**
   ```typescript
   constructor(private db: DatabaseClient = defaultDbClient) {}
   ```

2. **Define clear interfaces for dependencies**
   ```typescript
   export interface EmailServiceInterface {
     sendEmail(to: string, subject: string, body: string): Promise<void>;
   }
   ```

3. **Keep dependency interfaces focused and minimal**
   ```typescript
   // Good - minimal interface
   interface Logger {
     info(msg: string): void;
     error(msg: string): void;
   }

   // Bad - exposing too much
   interface Logger extends Winston.Logger {}
   ```

4. **Use readonly dependencies**
   ```typescript
   constructor(private readonly db: DatabaseClient) {}
   ```

5. **Maintain backward compatibility**
   ```typescript
   export const serviceInstance = new Service();
   export const legacyFunction = serviceInstance.method.bind(serviceInstance);
   ```

### DON'T ✗

1. **Don't use DI for everything**
   ```typescript
   // Bad - overkill for utilities
   constructor(private mathUtils: MathUtils) {}

   // Good - just import pure functions
   import { calculateAverage } from '../utils/math';
   ```

2. **Don't create circular dependencies**
   ```typescript
   // Bad
   class ServiceA {
     constructor(private serviceB: ServiceB) {}
   }
   class ServiceB {
     constructor(private serviceA: ServiceA) {}
   }
   ```

3. **Don't inject configuration values directly**
   ```typescript
   // Bad
   constructor(private apiKey: string, private apiUrl: string) {}

   // Good - inject configured service
   constructor(private apiClient: ApiClient) {}
   ```

4. **Don't make everything an interface**
   ```typescript
   // Bad - unnecessary abstraction
   interface NumberAdder {
     add(a: number, b: number): number;
   }

   // Good - use directly
   function add(a: number, b: number): number { return a + b; }
   ```

5. **Don't require DI for all tests**
   ```typescript
   // Some services don't need DI if they're already testable
   export function calculateFantasyPoints(stats: Stats, settings: Settings): number {
     // Pure function - no DI needed
     return stats.yards * settings.pointsPerYard;
   }
   ```

---

## Common Pitfalls

### Pitfall 1: Forgetting to bind methods

```typescript
// Problem
export const service = new Service();
export const method = service.method; // 'this' context lost

// Solution
export const method = service.method.bind(service);
```

### Pitfall 2: Mocking pool.query incorrectly

```typescript
// Wrong - doesn't work with TypeScript strict mode
const mockDb = { query: jest.fn() };

// Right - properly typed
const mockDb: DatabaseClient = {
  query: jest.fn().mockResolvedValue({ rows: [] })
};
```

### Pitfall 3: Forgetting async in tests

```typescript
// Wrong - test passes but doesn't wait for promise
it('should process waiver', () => {
  service.processWaivers(1); // No await!
  expect(mockDb.query).toHaveBeenCalled(); // Assertion runs before query
});

// Right
it('should process waiver', async () => {
  await service.processWaivers(1);
  expect(mockDb.query).toHaveBeenCalled();
});
```

---

## FAQ

**Q: Should every service use DI?**
A: No. Use DI for services that:
- Have external dependencies (database, APIs, email)
- Are hard to test currently
- Have complex business logic
- Would benefit from isolation in tests

**Q: Can I mix DI and non-DI patterns?**
A: Yes. It's fine to have a gradual migration. New code can use DI while old code remains unchanged.

**Q: What about performance?**
A: DI has negligible performance impact. Creating class instances is fast, and default parameters are evaluated once.

**Q: How do I handle transaction wrappers?**
A: Inject the pool, then use transaction wrappers inside methods. Or create a transaction-aware database client.

**Q: Should I use a DI container?**
A: Not necessary for most cases. Manual dependency injection with default parameters is simpler and more explicit.

**Q: How do I test services that call other services?**
A: Inject the dependent service as a dependency:
```typescript
constructor(
  private db: DatabaseClient,
  private recordService: RecordService = new RecordService()
) {}
```

---

## Examples Summary

### Before DI
```typescript
// recordService.ts
import pool from "../config/database";
import { logger } from "../config/logger";

export async function finalizeWeekScores(leagueId, week, season) {
  const result = await pool.query("SELECT ...", [leagueId]);
  logger.info("Finalized");
}

// Tests require actual database or complex mocking
```

### After DI (Class-Based)
```typescript
// recordService.ts
export class RecordService {
  constructor(
    private db: DatabaseClient = defaultDbClient,
    private logger: LoggerInterface = defaultLogger
  ) {}

  async finalizeWeekScores(leagueId, week, season) {
    const result = await this.db.query("SELECT ...", [leagueId]);
    this.logger.info("Finalized");
  }
}

export const recordService = new RecordService();

// Tests inject mocks easily
const service = new RecordService(mockDb, mockLogger);
```

### After DI (Factory Function)
```typescript
// waiverService.ts
export function createWaiverService(deps = {}) {
  const db = deps.db || defaultDbClient;
  const logger = deps.logger || defaultLogger;

  return {
    async processWaivers(leagueId) {
      const result = await db.query("SELECT ...", [leagueId]);
      logger.info("Processed");
    }
  };
}

export const waiverService = createWaiverService();

// Tests inject mocks easily
const service = createWaiverService({ db: mockDb, logger: mockLogger });
```

---

## Next Steps

1. Review this guide with the team
2. Start with one service as a pilot (recommend `recordService`)
3. Create shared mock helpers (`__tests__/helpers/mocks.ts`)
4. Update testing documentation
5. Gradually migrate other services

For questions or suggestions, reach out to the team in Slack or create a GitHub discussion.
