# Service Test Patterns Documentation

This document explains the testing patterns established for service-layer tests in the TBD Fantasy Football backend.

## Overview

Three comprehensive service test files have been created to establish testing patterns:

1. **adpService.test.ts** - Database-driven service with complex queries
2. **chessTimerService.test.ts** - State management service with timers
3. **autoPickService.test.ts** - Complex business logic with retries and transactions

## Test Structure

### Standard Test Organization

```typescript
describe('Service Name Tests', () => {
  // Test data setup
  let testIds: number[] = [];

  beforeAll(async () => {
    // One-time setup: create test data
  });

  afterAll(async () => {
    // One-time cleanup: remove test data
  });

  beforeEach(async () => {
    // Per-test setup: reset state
  });

  afterEach(async () => {
    // Per-test cleanup
  });

  describe('Feature Group', () => {
    it('should test specific behavior', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Test Patterns

### 1. Database Integration Tests (adpService.test.ts)

**Pattern:** Real database queries with test data isolation

**Key Features:**
- Uses real PostgreSQL database via pool
- Creates test data in `beforeAll`
- Cleans up with pattern matching (e.g., `username LIKE 'adptest%'`)
- Tests actual SQL query logic
- Validates aggregations and calculations

**Example:**
```typescript
beforeAll(async () => {
  // Create unique test data
  const uniqueCode = `ADP${Date.now().toString().slice(-6)}`;

  // Cleanup existing data
  await pool.query(`DELETE FROM users WHERE username LIKE 'adptest%'`);

  // Create test data
  const userResult = await pool.query(
    `INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id`,
    [`adptest1`, `adp1@test.com`, 'hashedpassword']
  );
});
```

**Best For:**
- Services with complex SQL queries
- Aggregation logic
- Database-specific features (JSONB, arrays, etc.)

### 2. Mock-Based Unit Tests (chessTimerService.test.ts)

**Pattern:** Complete mocking of external dependencies

**Key Features:**
- Mocks all external modules (`jest.mock()`)
- Tests logic in isolation
- Focuses on state management
- Verifies function calls and timing

**Example:**
```typescript
jest.mock('../../models/Draft');
jest.mock('../../models/DraftOrder');

beforeEach(() => {
  jest.clearAllMocks();
  (DraftModel.getDraftById as jest.Mock).mockResolvedValue(mockDraft);
});

it('should update database with elapsed time', async () => {
  startChessTimer(mockDraftId);
  await pauseChessTimer(mockDraftId, mockRosterId);

  expect(DraftOrderModel.updateRosterTimeRemaining).toHaveBeenCalledWith(
    mockDraftId,
    mockRosterId,
    expect.any(Number)
  );
});
```

**Best For:**
- Services with external API calls
- Timer-based logic
- Services that emit events
- Complex state management

### 3. Transaction Testing (autoPickService.test.ts)

**Pattern:** Mock database client for transaction testing

**Key Features:**
- Mocks `pool.connect()` to return mock client
- Simulates transaction flow (BEGIN/COMMIT/ROLLBACK)
- Tests query execution order
- Validates error handling and rollback

**Example:**
```typescript
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

(pool.connect as jest.Mock) = jest.fn().mockResolvedValue(mockClient);

mockClient.query.mockImplementation((query: string, params?: any[]) => {
  if (query === 'BEGIN') return Promise.resolve();
  if (query === 'COMMIT') return Promise.resolve();
  if (query.includes('INSERT INTO draft_picks')) {
    return Promise.resolve({ rows: [mockPick] });
  }
  return Promise.resolve({ rows: [] });
});
```

**Best For:**
- Services using transactions
- Retry logic
- Complex error handling
- Concurrent operation prevention

## Test Coverage Goals

### Happy Path Tests
- Primary functionality works correctly
- Data is created/updated as expected
- Return values are correct

### Error Cases
- Handle null/undefined inputs
- Database errors
- Network timeouts
- Transaction rollbacks
- Missing required data

### Edge Cases
- Empty arrays
- Boundary values (0, max int, etc.)
- Concurrent operations
- Race conditions
- State transitions

### Integration Scenarios
- Multi-step workflows
- Cross-service interactions
- Event emissions
- State persistence

## Common Patterns

### 1. Test Data Isolation

```typescript
// Use unique identifiers
const uniqueCode = `TEST${Date.now().toString().slice(-8)}`;

// Pattern-based cleanup
await pool.query(`DELETE FROM users WHERE username LIKE 'testuser%'`);
```

### 2. Async Testing

```typescript
// Always await async operations
it('should complete async operation', async () => {
  const result = await serviceFunction();
  expect(result).toBeDefined();
});

// Use proper timeouts for timing-sensitive tests
it('should timeout after delay', async () => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  expect(condition).toBe(true);
}, 10000); // 10 second timeout
```

### 3. Mock Cleanup

```typescript
beforeEach(() => {
  jest.clearAllMocks(); // Clear call counts and instances
});

afterEach(() => {
  stopAllMonitoring(); // Clean up service state
});
```

### 4. Assertion Patterns

```typescript
// Exact matches
expect(value).toBe(expected);

// Approximate for floats
expect(value).toBeCloseTo(expected, 1);

// Array/object matching
expect(array).toHaveLength(5);
expect(array).toContain(item);
expect(object).toHaveProperty('field', value);

// Function calls
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(3);

// Async matchers
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow('Error message');
```

## Coverage Requirements

Target **80%+ coverage** for:
- Statement coverage
- Branch coverage
- Function coverage

### Coverage Exceptions
- Logger calls (mocked in tests)
- Socket emissions (tested via integration)
- Exact error messages (may change)

## Running Tests

```bash
# Run all service tests
npm test -- services/

# Run specific test file
npm test -- adpService.test.ts

# Run with coverage
npm test -- adpService.test.ts --coverage

# Watch mode for development
npm test -- --watch adpService.test.ts

# Debug mode
node --inspect-brk node_modules/.bin/jest adpService.test.ts
```

## Debugging Tips

### 1. Console Logging in Tests

```typescript
it('should debug value', async () => {
  const result = await service();
  console.log('Result:', result);
  expect(result).toBeDefined();
});
```

### 2. Test Isolation

If tests fail when run together but pass individually:
- Check for shared state in service modules
- Ensure proper cleanup in `afterEach`
- Use `jest.clearAllMocks()`

### 3. Timing Issues

For tests that fail intermittently:
- Increase timeout values
- Add explicit waits with `setTimeout`
- Mock time-based functions

### 4. Database Issues

For database test failures:
- Check connection pool limits
- Verify cleanup queries
- Use unique identifiers per test run
- Check for foreign key constraints

## Anti-Patterns to Avoid

### 1. Don't Test Implementation Details

```typescript
// Bad: Testing private functions
expect(service.privateMethod()).toBe(value);

// Good: Test public API behavior
expect(service.publicMethod()).toMatchObject(expected);
```

### 2. Don't Use Arbitrary Timeouts

```typescript
// Bad: Random wait
await new Promise(resolve => setTimeout(resolve, 5000));

// Good: Wait for specific condition
await waitForCondition(() => draft.status === 'completed');
```

### 3. Don't Share Test Data

```typescript
// Bad: Shared mutable state
const sharedData = { value: 1 };

// Good: Fresh data per test
beforeEach(() => {
  testData = { value: 1 };
});
```

### 4. Don't Skip Cleanup

```typescript
// Bad: No cleanup
afterAll(async () => {
  // Nothing
});

// Good: Always cleanup
afterAll(async () => {
  await pool.query(`DELETE FROM test_data`);
});
```

## TypeScript Best Practices

### 1. Type Mock Returns

```typescript
(DraftModel.getDraftById as jest.Mock).mockResolvedValue(mockDraft);
```

### 2. Avoid Type Assertions

```typescript
// Avoid: as any
const result = await service() as any;

// Better: Proper typing
const result: DraftResult = await service();
```

### 3. Use Proper Async Types

```typescript
// Return Promise for async tests
async function testHelper(): Promise<void> {
  await doSomething();
}
```

## Service-Specific Patterns

### ADP Service (Database Aggregations)
- Test minimum draft requirements (3 drafts)
- Validate ADP calculations (averages, min/max)
- Test filtering by draft type and league size
- Verify upsert behavior (ON CONFLICT DO UPDATE)

### Chess Timer Service (State Management)
- Test timer start/pause/resume cycles
- Validate time calculations
- Test concurrent timer handling
- Verify event emissions

### Auto-Pick Service (Complex Workflows)
- Test retry mechanisms with backoff
- Validate transaction rollback on errors
- Test concurrent pick prevention (locks)
- Verify draft completion logic

## Future Enhancements

Potential areas to expand:
1. **Performance Testing:** Add benchmarks for slow queries
2. **Load Testing:** Test service behavior under concurrent load
3. **Snapshot Testing:** For complex object structures
4. **Contract Testing:** For API integrations
5. **E2E Testing:** Full workflow tests across services

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [TRUTHS.md](../../docs/TRUTHS.md) - System invariants to verify in tests
