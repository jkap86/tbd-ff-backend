# Dependency Injection - Quick Reference

One-page reference for using DI in the TBD Fantasy Football backend.

## Basic Pattern

```typescript
// 1. Import types and defaults
import { DatabaseClient, LoggerInterface } from '../types/dependencies';
import { defaultDbClient, defaultLogger } from './defaults';

// 2. Create service class with constructor injection
export class MyService {
  constructor(
    private db: DatabaseClient = defaultDbClient,
    private logger: LoggerInterface = defaultLogger
  ) {}

  async myMethod() {
    const result = await this.db.query('SELECT ...', [param]);
    this.logger.info('Success');
    return result;
  }
}

// 3. Export singleton for production use
export const myService = new MyService();
export default MyService;
```

## Testing Pattern

```typescript
// 1. Import service and mocks
import MyService from '../../services/myService';
import { createMockDb, createMockLogger } from '../helpers/mocks';

describe('MyService', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let service: MyService;

  beforeEach(() => {
    mockDb = createMockDb();
    mockLogger = createMockLogger();
    service = new MyService(mockDb, mockLogger);
  });

  it('should do something', async () => {
    // Setup mock response
    mockDb.querySpy.mockResolvedValue({ rows: [{ id: 1 }] });

    // Execute
    await service.myMethod();

    // Assert
    expect(mockDb.querySpy).toHaveBeenCalledWith('SELECT ...', [param]);
    expect(mockLogger.infoSpy).toHaveBeenCalledWith('Success');
  });
});
```

## Available Mock Helpers

```typescript
// Basic mocks
createMockDb()                    // Mock database
createMockLogger()                // Mock logger
createMockEmailService()          // Mock email
createMockPushService()           // Mock push notifications

// Advanced mocks
createSpyDb(returnValue)          // DB with exposed spy
createMockDbWithSequence([...])   // Sequential responses
createFailingDb(error)            // Always fails
createSilentLogger()              // No-op logger

// Mock data factories
mockData.roster({ id: 1 })        // Mock roster
mockData.matchup({ week: 5 })     // Mock matchup
mockData.league({ name: 'Test' }) // Mock league
```

## Common Test Scenarios

### Test with Mock Database

```typescript
it('should query database', async () => {
  const mockDb = createMockDb({ rows: [{ id: 1 }] });
  const service = new MyService(mockDb, createMockLogger());

  await service.myMethod();

  expect(mockDb.querySpy).toHaveBeenCalled();
});
```

### Test Error Handling

```typescript
it('should handle errors', async () => {
  const error = new Error('DB error');
  const failingDb = createFailingDb(error);
  const mockLogger = createMockLogger();

  const service = new MyService(failingDb, mockLogger);

  await expect(service.myMethod()).rejects.toThrow('DB error');
  expect(mockLogger.errorSpy).toHaveBeenCalled();
});
```

### Test Multiple DB Calls

```typescript
it('should make sequential queries', async () => {
  const mockDb = createMockDbWithSequence([
    { rows: [{ id: 1 }] },  // First call
    { rows: [{ id: 2 }] },  // Second call
  ]);

  const service = new MyService(mockDb, createMockLogger());

  await service.myMethod();

  expect(mockDb.querySpy).toHaveBeenCalledTimes(2);
});
```

### Verify Specific Query

```typescript
it('should query with correct params', async () => {
  const mockDb = createMockDb();
  const service = new MyService(mockDb, createMockLogger());

  await service.myMethod(42);

  expect(mockDb.querySpy).toHaveBeenCalledWith(
    expect.stringContaining('SELECT'),
    [42]
  );
});
```

## Factory Function Pattern (Alternative)

```typescript
// Service with factory function
export interface MyServiceDeps {
  db?: DatabaseClient;
  logger?: LoggerInterface;
}

export function createMyService(deps: MyServiceDeps = {}) {
  const db = deps.db || defaultDbClient;
  const logger = deps.logger || defaultLogger;

  return {
    async myMethod() {
      const result = await db.query('SELECT ...', []);
      logger.info('Success');
      return result;
    }
  };
}

// Production use
export const myService = createMyService();

// Test use
const service = createMyService({
  db: mockDb,
  logger: mockLogger
});
```

## When to Use DI

### ✓ Use DI for:
- Services with database dependencies
- Services with external API calls
- Services with email/notifications
- Services with complex logic to test
- Services with service-to-service calls

### ✗ Don't use DI for:
- Pure calculation functions
- Simple utility functions
- Constants and configurations
- Type definitions

## Migration Checklist

```
□ Read DEPENDENCY_INJECTION.md
□ Review DI_EXAMPLES.md
□ Import types from types/dependencies.ts
□ Import defaults from services/defaults.ts
□ Refactor service (class or factory)
□ Add default parameters
□ Export singleton for backward compatibility
□ Write/update tests with mocks
□ Verify existing code still works
□ Submit PR
```

## Key Files

| File | Purpose |
|------|---------|
| `docs/DEPENDENCY_INJECTION.md` | Complete guide |
| `docs/DI_EXAMPLES.md` | Practical examples |
| `types/dependencies.ts` | Type interfaces |
| `services/defaults.ts` | Default implementations |
| `__tests__/helpers/mocks.ts` | Mock factories |
| `services/recordService.refactored.ts` | Example refactoring |
| `__tests__/services/recordService.di.test.ts` | Example tests |

## Common Issues

### Issue: `this` context lost

```typescript
// Wrong
export const method = service.method;

// Right
export const method = service.method.bind(service);
```

### Issue: Mock not typed correctly

```typescript
// Wrong
const mockDb = { query: jest.fn() };

// Right
const mockDb: DatabaseClient = {
  query: jest.fn().mockResolvedValue({ rows: [] })
};
```

### Issue: Forgot to await in tests

```typescript
// Wrong - test passes but doesn't wait
it('should work', () => {
  service.myMethod(); // Missing await!
  expect(mockDb.querySpy).toHaveBeenCalled();
});

// Right
it('should work', async () => {
  await service.myMethod();
  expect(mockDb.querySpy).toHaveBeenCalled();
});
```

## Support

- Questions? Check `DEPENDENCY_INJECTION.md`
- Examples? Check `DI_EXAMPLES.md`
- Ask in team Slack channel

---

**Quick Reference v1.0** | [Full Guide](./DEPENDENCY_INJECTION.md) | [Examples](./DI_EXAMPLES.md)
