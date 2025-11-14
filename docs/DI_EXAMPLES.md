# Dependency Injection - Practical Examples

This document provides before/after comparisons and practical examples of refactoring services to use dependency injection.

## Table of Contents

1. [Simple Service Refactoring](#simple-service-refactoring)
2. [Service with External Dependencies](#service-with-external-dependencies)
3. [Service with Service Dependencies](#service-with-service-dependencies)
4. [Testing Examples](#testing-examples)

---

## Simple Service Refactoring

### Before: recordService.ts (Original)

```typescript
import pool from "../config/database";
import { logger } from "../config/logger";

export async function finalizeWeekScores(
  leagueId: number,
  week: number,
  season: string
): Promise<void> {
  try {
    logger.info(`Finalizing week ${week} scores...`);

    const matchupsResult = await pool.query(
      `SELECT * FROM matchups WHERE league_id = $1 AND week = $2`,
      [leagueId, week]
    );

    // ... business logic

    logger.info("Scores finalized");
  } catch (error) {
    logger.error("Error finalizing scores:", { error });
    throw error;
  }
}
```

**Problems:**
- Hard to test without database
- Cannot easily mock logger
- Tight coupling to global imports

### After: recordService.ts (With DI)

```typescript
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
    season: string
  ): Promise<void> {
    try {
      this.logger.info(`Finalizing week ${week} scores...`);

      const matchupsResult = await this.db.query(
        `SELECT * FROM matchups WHERE league_id = $1 AND week = $2`,
        [leagueId, week]
      );

      // ... business logic (same as before)

      this.logger.info("Scores finalized");
    } catch (error) {
      this.logger.error("Error finalizing scores:", { error });
      throw error;
    }
  }
}

// Backward compatibility
export const recordService = new RecordService();
export const finalizeWeekScores = recordService.finalizeWeekScores.bind(recordService);
export default RecordService;
```

**Benefits:**
- Easy to inject mocks in tests
- Business logic unchanged
- Backward compatible with existing code

### Testing the Refactored Service

```typescript
import RecordService from '../../services/recordService';
import { createMockDb, createMockLogger } from '../helpers/mocks';

describe('RecordService', () => {
  it('should finalize scores', async () => {
    const mockDb = createMockDb({ rows: [] });
    const mockLogger = createMockLogger();

    const service = new RecordService(mockDb, mockLogger);

    await service.finalizeWeekScores(1, 5, '2025');

    expect(mockDb.querySpy).toHaveBeenCalled();
    expect(mockLogger.infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Finalizing week 5')
    );
  });
});
```

---

## Service with External Dependencies

### Before: waiverService.ts (Original)

```typescript
import pool from "../config/database";
import { logger } from "../config/logger";
import * as emailService from "./emailService";
import * as pushService from "./pushNotificationService";

export async function processWaivers(leagueId: number): Promise<void> {
  const result = await pool.query("SELECT ...", [leagueId]);

  // Process claims...

  await emailService.sendWaiverResultEmail(userId, result);
  await pushService.sendNotification(userId, "Waiver processed", "...");

  logger.info("Waivers processed");
}
```

### After: waiverService.ts (With DI - Factory Pattern)

```typescript
import { DatabaseClient, LoggerInterface, EmailServiceInterface, PushNotificationInterface } from '../types/dependencies';
import { defaultDbClient, defaultLogger, defaultEmailService, defaultPushService } from './defaults';

export interface WaiverServiceDeps {
  db?: DatabaseClient;
  logger?: LoggerInterface;
  emailService?: EmailServiceInterface;
  pushService?: PushNotificationInterface;
}

export function createWaiverService(deps: WaiverServiceDeps = {}) {
  const db = deps.db || defaultDbClient;
  const logger = deps.logger || defaultLogger;
  const emailService = deps.emailService || defaultEmailService;
  const pushService = deps.pushService || defaultPushService;

  return {
    async processWaivers(leagueId: number): Promise<void> {
      const result = await db.query("SELECT ...", [leagueId]);

      // Process claims...

      await emailService.sendWaiverResultEmail?.(userId, result);
      await pushService.sendNotification(userId, "Waiver processed", "...");

      logger.info("Waivers processed");
    }
  };
}

// Backward compatibility
export const waiverService = createWaiverService();
export const processWaivers = waiverService.processWaivers;
```

### Testing with Factory Pattern

```typescript
import { createWaiverService } from '../../services/waiverService';
import { createMockDb, createMockLogger, createMockEmailService, createMockPushService } from '../helpers/mocks';

describe('WaiverService', () => {
  it('should process waivers and send notifications', async () => {
    const mockDb = createMockDb({ rows: [] });
    const mockLogger = createMockLogger();
    const mockEmail = createMockEmailService();
    const mockPush = createMockPushService();

    const service = createWaiverService({
      db: mockDb,
      logger: mockLogger,
      emailService: mockEmail,
      pushService: mockPush
    });

    await service.processWaivers(1);

    expect(mockDb.querySpy).toHaveBeenCalled();
    expect(mockEmail.sendPasswordResetEmailSpy).toHaveBeenCalled();
    expect(mockPush.sendNotificationSpy).toHaveBeenCalled();
  });

  it('should handle errors without sending notifications', async () => {
    const mockDb = createMockDb();
    mockDb.querySpy.mockRejectedValue(new Error('DB error'));

    const mockEmail = createMockEmailService();

    const service = createWaiverService({
      db: mockDb,
      emailService: mockEmail
    });

    await expect(service.processWaivers(1)).rejects.toThrow('DB error');

    // Email should not be sent if query fails
    expect(mockEmail.sendPasswordResetEmailSpy).not.toHaveBeenCalled();
  });
});
```

---

## Service with Service Dependencies

### Before: draftService.ts (Original)

```typescript
import pool from "../config/database";
import { logger } from "../config/logger";
import { sendEmail } from "./emailService";
import { resetAllRosterRecords } from "./recordService";

export async function completeDraft(draftId: number): Promise<void> {
  const result = await pool.query("UPDATE drafts SET status = 'completed' WHERE id = $1", [draftId]);

  // Get league ID
  const league = await pool.query("SELECT league_id FROM drafts WHERE id = $1", [draftId]);
  const leagueId = league.rows[0].league_id;

  // Reset records (using imported function)
  await resetAllRosterRecords(leagueId);

  // Send notifications
  await sendEmail(...);

  logger.info("Draft completed");
}
```

**Problem:** Hard to test service-to-service interactions

### After: draftService.ts (With Service DI)

```typescript
import { DatabaseClient, LoggerInterface, EmailServiceInterface } from '../types/dependencies';
import { defaultDbClient, defaultLogger, defaultEmailService } from './defaults';
import RecordService from './recordService';

export class DraftService {
  private recordService: RecordService;

  constructor(
    private db: DatabaseClient = defaultDbClient,
    private logger: LoggerInterface = defaultLogger,
    private emailService: EmailServiceInterface = defaultEmailService,
    recordService?: RecordService
  ) {
    // Allow injecting recordService, or create one with same dependencies
    this.recordService = recordService || new RecordService(db, logger);
  }

  async completeDraft(draftId: number): Promise<void> {
    const result = await this.db.query(
      "UPDATE drafts SET status = 'completed' WHERE id = $1",
      [draftId]
    );

    // Get league ID
    const league = await this.db.query(
      "SELECT league_id FROM drafts WHERE id = $1",
      [draftId]
    );
    const leagueId = league.rows[0].league_id;

    // Use injected service
    await this.recordService.resetAllRosterRecords(leagueId);

    // Send notifications
    await this.emailService.sendEmail?.(...);

    this.logger.info("Draft completed");
  }
}

// Backward compatibility
export const draftService = new DraftService();
export const completeDraft = draftService.completeDraft.bind(draftService);
export default DraftService;
```

### Testing Service Dependencies

```typescript
import DraftService from '../../services/draftService';
import RecordService from '../../services/recordService';
import { createMockDb, createMockLogger, createMockEmailService } from '../helpers/mocks';

describe('DraftService', () => {
  it('should complete draft and reset records', async () => {
    const mockDb = createMockDb();
    mockDb.querySpy
      .mockResolvedValueOnce({ rows: [] }) // UPDATE drafts
      .mockResolvedValueOnce({ rows: [{ league_id: 1 }] }); // SELECT league_id

    const mockLogger = createMockLogger();
    const mockEmail = createMockEmailService();

    // Mock the record service
    const mockRecordService = {
      resetAllRosterRecords: jest.fn().mockResolvedValue(undefined)
    } as any as RecordService;

    const draftService = new DraftService(
      mockDb,
      mockLogger,
      mockEmail,
      mockRecordService
    );

    await draftService.completeDraft(100);

    // Verify draft was updated
    expect(mockDb.querySpy).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts"),
      [100]
    );

    // Verify records were reset
    expect(mockRecordService.resetAllRosterRecords).toHaveBeenCalledWith(1);

    // Verify email was sent
    expect(mockEmail.sendPasswordResetEmailSpy).toHaveBeenCalled();
  });

  it('should rollback if record reset fails', async () => {
    const mockDb = createMockDb();
    mockDb.querySpy
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ league_id: 1 }] });

    const mockRecordService = {
      resetAllRosterRecords: jest.fn().mockRejectedValue(new Error('Reset failed'))
    } as any as RecordService;

    const draftService = new DraftService(
      mockDb,
      createMockLogger(),
      createMockEmailService(),
      mockRecordService
    );

    await expect(draftService.completeDraft(100)).rejects.toThrow('Reset failed');

    // Draft was updated, but error occurred after
    expect(mockDb.querySpy).toHaveBeenCalledTimes(2);
    expect(mockRecordService.resetAllRosterRecords).toHaveBeenCalled();
  });
});
```

---

## Testing Examples

### Example 1: Testing Error Handling

```typescript
import RecordService from '../../services/recordService';
import { createFailingDb, createMockLogger } from '../helpers/mocks';

it('should handle database errors gracefully', async () => {
  const dbError = new Error('Connection timeout');
  const failingDb = createFailingDb(dbError);
  const mockLogger = createMockLogger();

  const service = new RecordService(failingDb, mockLogger);

  await expect(
    service.finalizeWeekScores(1, 5, '2025')
  ).rejects.toThrow('Connection timeout');

  // Verify error was logged
  expect(mockLogger.errorSpy).toHaveBeenCalledWith(
    expect.stringContaining('Error finalizing'),
    { error: dbError }
  );
});
```

### Example 2: Testing with Sequential DB Calls

```typescript
import RecordService from '../../services/recordService';
import { createMockDbWithSequence, createMockLogger } from '../helpers/mocks';

it('should make multiple database queries in sequence', async () => {
  const mockDb = createMockDbWithSequence([
    { rows: [{ id: 1, roster1_id: 10 }] }, // First query
    { rows: [{ id: 10, settings: {} }] },   // Second query
    { rows: [] },                            // Third query
  ]);

  const service = new RecordService(mockDb, createMockLogger());

  await service.finalizeWeekScores(1, 5, '2025');

  expect(mockDb.querySpy).toHaveBeenCalledTimes(3);

  // Verify first query was for matchups
  expect(mockDb.querySpy.mock.calls[0][0]).toContain('matchups');

  // Verify second query was for rosters
  expect(mockDb.querySpy.mock.calls[1][0]).toContain('rosters');
});
```

### Example 3: Testing with Spy Pattern

```typescript
import RecordService from '../../services/recordService';
import { createSpyDb, createMockLogger } from '../helpers/mocks';

it('should query correct matchups', async () => {
  const mockDb = createSpyDb({ rows: [] });
  const service = new RecordService(mockDb, createMockLogger());

  await service.finalizeWeekScores(42, 7, '2025', 'regular');

  // Verify exact query parameters
  expect(mockDb.querySpy).toHaveBeenCalledWith(
    expect.any(String),
    [42, 7, '2025'] // league_id=42, week=7, season='2025'
  );
});
```

### Example 4: Integration Test (Mix of Real and Mock)

```typescript
import RecordService from '../../services/recordService';
import pool from '../../config/database';
import { createMockLogger } from '../helpers/mocks';

describe('RecordService Integration', () => {
  let testLeagueId: number;

  beforeAll(async () => {
    // Create real test data in database
    const result = await pool.query(
      'INSERT INTO leagues (name, season) VALUES ($1, $2) RETURNING id',
      ['Integration Test League', '2025']
    );
    testLeagueId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
  });

  it('should work with real database but mock logger', async () => {
    const mockLogger = createMockLogger();

    // Use real database, mock logger
    const service = new RecordService(
      { query: (sql, params) => pool.query(sql, params) },
      mockLogger
    );

    await service.finalizeWeekScores(testLeagueId, 1, '2025');

    // Verify real database was updated
    const result = await pool.query(
      'SELECT * FROM matchups WHERE league_id = $1',
      [testLeagueId]
    );

    // Verify logging happened
    expect(mockLogger.infoSpy).toHaveBeenCalled();
  });
});
```

---

## Migration Checklist

When refactoring a service to use DI:

- [ ] Create type interfaces in `types/dependencies.ts` (if needed)
- [ ] Add default implementations in `services/defaults.ts` (if needed)
- [ ] Refactor service to use constructor/factory injection
- [ ] Add default parameters for backward compatibility
- [ ] Export singleton instance for backward compatibility
- [ ] Update or create tests using DI pattern
- [ ] Create mock helpers if needed
- [ ] Update service documentation
- [ ] Verify existing code still works

---

## Common Patterns Summary

| Pattern | Use Case | Example |
|---------|----------|---------|
| Class with Constructor Injection | Complex services, multiple methods | `RecordService`, `DraftService` |
| Factory Function | Simpler services, stateless | `createWaiverService()` |
| Service Container | Shared dependencies across many services | `ServiceContainer.getInstance()` |
| Mixed DI | Integration tests (real DB, mock logger) | See Example 4 above |

---

## Questions?

If you have questions about dependency injection or need help refactoring a specific service:

1. Check the main [DEPENDENCY_INJECTION.md](./DEPENDENCY_INJECTION.md) guide
2. Look at the example refactored files:
   - `src/services/recordService.refactored.ts`
   - `src/__tests__/services/recordService.di.test.ts`
3. Review mock helpers: `src/__tests__/helpers/mocks.ts`
4. Ask in the team Slack channel

Happy testing!
