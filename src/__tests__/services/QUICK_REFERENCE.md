# Testing Quick Reference Guide

## Test File Locations

```
src/__tests__/services/
├── adpService.test.ts          # Database integration tests
├── chessTimerService.test.ts   # Mock-based unit tests
├── autoPickService.test.ts     # Transaction & retry logic tests
├── TEST_PATTERNS.md            # Comprehensive patterns documentation
└── QUICK_REFERENCE.md          # This file
```

## Quick Start Commands

```bash
# Run all service tests
npm test -- services/

# Run specific test file
npm test -- adpService.test.ts

# Run with coverage
npm test -- adpService.test.ts --coverage

# Watch mode for development
npm test -- --watch adpService.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should calculate ADP"
```

## Test Template

### Database Integration Test
```typescript
describe('Service Name Tests', () => {
  let testIds: number[] = [];

  beforeAll(async () => {
    // One-time setup: create test data
    const uniqueCode = `TEST${Date.now().toString().slice(-8)}`;
    await pool.query(`DELETE FROM table WHERE field LIKE 'test%'`);
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM table WHERE field LIKE 'test%'`);
  });

  it('should perform database operation', async () => {
    const result = await serviceFunction();

    const dbResult = await pool.query('SELECT * FROM table WHERE id = $1', [result.id]);
    expect(dbResult.rows).toHaveLength(1);
  });
});
```

### Mock-Based Unit Test
```typescript
jest.mock('../../models/SomeModel');

describe('Service Name Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SomeModel.someFunction as jest.Mock).mockResolvedValue(mockData);
  });

  it('should call dependencies correctly', async () => {
    await serviceFunction(input);

    expect(SomeModel.someFunction).toHaveBeenCalledWith(expectedArgs);
    expect(SomeModel.someFunction).toHaveBeenCalledTimes(1);
  });
});
```

### Transaction Test
```typescript
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

(pool.connect as jest.Mock) = jest.fn().mockResolvedValue(mockClient);

mockClient.query.mockImplementation((query: string) => {
  if (query === 'BEGIN') return Promise.resolve();
  if (query === 'COMMIT') return Promise.resolve();
  if (query === 'ROLLBACK') return Promise.resolve();
  if (query.includes('INSERT INTO')) return Promise.resolve({ rows: [mockData] });
  return Promise.resolve({ rows: [] });
});
```

## Common Assertions

### Basic Assertions
```typescript
// Exact equality
expect(value).toBe(expected);

// Deep equality
expect(object).toEqual(expectedObject);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Null/Undefined
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();
```

### Numeric Assertions
```typescript
// Exact numbers
expect(value).toBe(5);

// Approximate (for floats)
expect(value).toBeCloseTo(5.5, 1); // Within 0.1

// Comparisons
expect(value).toBeGreaterThan(5);
expect(value).toBeGreaterThanOrEqual(5);
expect(value).toBeLessThan(10);
expect(value).toBeLessThanOrEqual(10);
```

### Array/Object Assertions
```typescript
// Array length
expect(array).toHaveLength(5);

// Array contains
expect(array).toContain(item);
expect(array).toContainEqual({ id: 1 });

// Object properties
expect(object).toHaveProperty('field');
expect(object).toHaveProperty('field', value);

// Object matching
expect(object).toMatchObject({ id: 1, name: 'test' });
```

### Function Call Assertions
```typescript
// Called
expect(mockFn).toHaveBeenCalled();
expect(mockFn).not.toHaveBeenCalled();

// Called with arguments
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledWith(expect.any(Number));
expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

// Call count
expect(mockFn).toHaveBeenCalledTimes(3);

// Call order
expect(mockFn).toHaveBeenNthCalledWith(1, firstArgs);
expect(mockFn).toHaveBeenLastCalledWith(lastArgs);
```

### Promise/Async Assertions
```typescript
// Resolves
await expect(promise).resolves.toBe(value);
await expect(promise).resolves.toMatchObject({ id: 1 });

// Rejects
await expect(promise).rejects.toThrow();
await expect(promise).rejects.toThrow('Error message');
await expect(promise).rejects.toThrow(ErrorClass);
```

## Mock Setup Patterns

### Mock Module
```typescript
jest.mock('../../models/SomeModel', () => ({
  functionName: jest.fn(),
  anotherFunction: jest.fn(),
}));
```

### Mock Return Values
```typescript
// Single return value
mockFn.mockReturnValue(value);
mockFn.mockResolvedValue(value); // For promises

// Multiple return values
mockFn.mockReturnValueOnce(value1).mockReturnValueOnce(value2);

// Conditional returns
mockFn.mockImplementation((arg) => {
  if (arg === 'foo') return 'bar';
  return 'default';
});
```

### Mock Reset
```typescript
// Clear call history
mockFn.mockClear();

// Reset implementation
mockFn.mockReset();

// Restore original
mockFn.mockRestore();

// Clear all mocks
jest.clearAllMocks();
```

## Timing & Delays

### Wait for Condition
```typescript
// Simple delay
await new Promise(resolve => setTimeout(resolve, 1000));

// Wait for condition
const waitFor = async (condition: () => boolean, timeout = 5000) => {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

await waitFor(() => draft.status === 'completed');
```

### Test Timeout
```typescript
// Per-test timeout
it('should complete slowly', async () => {
  // test code
}, 10000); // 10 second timeout

// Global timeout in jest.config.js
module.exports = {
  testTimeout: 30000, // 30 seconds
};
```

## Database Test Patterns

### Unique Test Data
```typescript
const uniqueCode = `TEST${Date.now().toString().slice(-8)}`;
const uniqueEmail = `test${Date.now()}@example.com`;
```

### Cleanup Pattern
```typescript
beforeAll(async () => {
  await pool.query(`DELETE FROM users WHERE username LIKE 'testuser%'`);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE username LIKE 'testuser%'`);
});
```

### Transaction Testing
```typescript
// Begin transaction
const client = await pool.connect();
await client.query('BEGIN');

try {
  // Test operations
  await client.query('INSERT ...');
  await client.query('UPDATE ...');

  // Rollback to avoid affecting DB
  await client.query('ROLLBACK');
} finally {
  client.release();
}
```

## Error Testing

### Expect Errors
```typescript
// Synchronous
expect(() => functionThatThrows()).toThrow();
expect(() => functionThatThrows()).toThrow('Error message');
expect(() => functionThatThrows()).toThrow(ErrorClass);

// Asynchronous
await expect(asyncFunction()).rejects.toThrow();
await expect(asyncFunction()).rejects.toThrow('Error message');
```

### Test Error Handling
```typescript
it('should handle errors gracefully', async () => {
  mockFn.mockRejectedValue(new Error('Database error'));

  await expect(serviceFunction()).rejects.toThrow('Database error');

  // Verify error was logged
  expect(logger.error).toHaveBeenCalled();
});
```

## Coverage Tips

### Run Coverage
```bash
# All files
npm test -- --coverage

# Specific file
npm test -- adpService.test.ts --coverage --collectCoverageFrom="src/services/adpService.ts"

# Coverage report
npm test -- --coverage --coverageReporters=html
```

### Coverage Thresholds
```javascript
// jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
```

### Ignore from Coverage
```typescript
/* istanbul ignore next */
function debugOnly() {
  // Code not covered by tests
}
```

## Debugging Tests

### Console Logging
```typescript
it('should debug output', async () => {
  const result = await serviceFunction();
  console.log('Result:', result);
  expect(result).toBeDefined();
});
```

### Run Single Test
```bash
# Use .only
it.only('should run only this test', async () => {
  // test code
});

# Or via CLI
npm test -- --testNamePattern="should run only this"
```

### Debug with Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest adpService.test.ts
```

### Skip Tests
```typescript
it.skip('should skip this test', async () => {
  // Won't run
});

// Or
xit('should skip this test', async () => {
  // Won't run
});
```

## Common Patterns by Service Type

### Database Service
```typescript
✓ Test CRUD operations
✓ Test unique constraints
✓ Test foreign key constraints
✓ Test complex queries
✓ Test aggregations
✓ Test transactions
```

### Timer/Scheduler Service
```typescript
✓ Test start/stop
✓ Test timing accuracy
✓ Test cleanup
✓ Test concurrent timers
✓ Test edge cases (0 time, negative)
```

### Business Logic Service
```typescript
✓ Test happy path
✓ Test validation errors
✓ Test state transitions
✓ Test error handling
✓ Test edge cases
✓ Test retries
```

### Integration Service
```typescript
✓ Test API calls (mocked)
✓ Test data transformation
✓ Test error handling
✓ Test rate limiting
✓ Test caching
```

## Test Organization

### Good Structure
```typescript
describe('ServiceName', () => {
  describe('functionName', () => {
    it('should handle happy path', async () => {});
    it('should handle error case', async () => {});
    it('should validate input', async () => {});
  });

  describe('anotherFunction', () => {
    it('should ...', async () => {});
  });
});
```

### Test Naming
```typescript
// Good: Descriptive
it('should calculate ADP from completed drafts')
it('should throw error when player not found')
it('should return empty array when no data exists')

// Bad: Vague
it('should work')
it('test ADP')
it('handles errors')
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [TypeScript with Jest](https://jestjs.io/docs/getting-started#using-typescript)
- Project TRUTHS.md: `docs/TRUTHS.md`
- Test Patterns: `src/__tests__/services/TEST_PATTERNS.md`
