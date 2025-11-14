# Integration Tests Quick Start Guide

## Prerequisites

1. **Test Database Setup**

Create a test database:
```sql
CREATE DATABASE tbdff_test;
```

2. **Environment Variables**

Update `.env` or set in `jest.setup.ts`:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/tbdff_test
JWT_SECRET=test-jwt-secret-for-jest-tests-only
NODE_ENV=test
```

3. **Run Migrations**

Apply migrations to test database:
```bash
# Set DATABASE_URL to test database temporarily
DATABASE_URL=postgresql://user:pass@localhost:5432/tbdff_test npm run migrate:dev
```

## Running Tests

### All Integration Tests
```bash
npm test -- integration
```

### Specific Test File
```bash
# League tests
npm test -- league-api.integration.test.ts

# Draft tests
npm test -- draft-pick-api.integration.test.ts

# Matchup tests
npm test -- matchup-api.integration.test.ts
```

### With Coverage
```bash
npm run test:coverage -- integration
```

### Watch Mode (re-run on changes)
```bash
npm run test:watch -- integration
```

### Verbose Output
```bash
npm test -- integration --verbose
```

## Expected Output

### Successful Run
```
PASS  src/__tests__/integration/league-api.integration.test.ts
  League API Integration Tests
    POST /api/v1/leagues/create
      ✓ should create league with valid data (150ms)
      ✓ should return 400 with missing required fields (45ms)
      ✓ should return 401 without authentication (30ms)
    GET /api/v1/leagues/:leagueId
      ✓ should retrieve league details for member (60ms)
      ✓ should return 404 for non-existent league (35ms)
    ...

Test Suites: 3 passed, 3 total
Tests:       49 passed, 49 total
Time:        12.5s
```

### Failed Test
```
FAIL  src/__tests__/integration/league-api.integration.test.ts
  League API Integration Tests
    POST /api/v1/leagues/create
      ✕ should create league with valid data (150ms)

  ● League API Integration Tests › POST /api/v1/leagues/create › should create league with valid data

    expect(received).toBe(expected) // Object.is equality

    Expected: 201
    Received: 400

      82 |       .send(leagueData);
      83 |
    > 84 |     expect(response.status).toBe(201);
         |                             ^
      85 |     expect(response.body.success).toBe(true);
```

## Common Issues

### Issue: Database Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**:
- Check PostgreSQL is running: `pg_ctl status`
- Verify DATABASE_URL is correct
- Ensure test database exists

### Issue: Unique Constraint Violation
```
Error: duplicate key value violates unique constraint "users_username_key"
```

**Solution**:
- Test cleanup failed in previous run
- Manually clean test database:
```sql
DELETE FROM leagues WHERE name LIKE '%Test%';
DELETE FROM users WHERE username LIKE '%test%';
```

### Issue: Foreign Key Violation
```
Error: update or delete on table "leagues" violates foreign key constraint
```

**Solution**:
- Cleanup order is wrong
- Delete child tables first (rosters, drafts) before parent (leagues)
- Check `afterAll()` cleanup order

### Issue: Tests Timeout
```
Timeout - Async callback was not invoked within the 5000 ms timeout
```

**Solution**:
- Increase Jest timeout: `jest.setTimeout(10000)` in test file
- Check for unclosed database connections
- Ensure `await` on all async operations

### Issue: JWT Secret Missing
```
Error: secretOrPrivateKey must have a value
```

**Solution**:
- Check `jest.setup.ts` sets `process.env.JWT_SECRET`
- Verify jest setup file is loaded in `jest.config.js`

## Test Data Cleanup

### Manual Cleanup (if needed)
```sql
-- Clean all test data
DELETE FROM draft_picks WHERE draft_id IN (SELECT id FROM drafts WHERE league_id IN (SELECT id FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%'));
DELETE FROM draft_order WHERE draft_id IN (SELECT id FROM drafts WHERE league_id IN (SELECT id FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%'));
DELETE FROM matchups WHERE league_id IN (SELECT id FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%');
DELETE FROM weekly_lineups WHERE roster_id IN (SELECT id FROM rosters WHERE league_id IN (SELECT id FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%'));
DELETE FROM drafts WHERE league_id IN (SELECT id FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%');
DELETE FROM rosters WHERE league_id IN (SELECT id FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%');
DELETE FROM leagues WHERE invite_code LIKE 'D%' OR invite_code LIKE 'M%';
DELETE FROM users WHERE username LIKE '%test%';
DELETE FROM players WHERE player_id LIKE 'DTEST%' OR player_id LIKE 'MTEST%';
```

### Reset Test Database (nuclear option)
```bash
# Drop and recreate
dropdb tbdff_test
createdb tbdff_test

# Re-run migrations
DATABASE_URL=postgresql://user:pass@localhost:5432/tbdff_test npm run migrate:dev
```

## Debugging Tests

### 1. Enable Verbose Logging
```typescript
// Add to test file
beforeAll(() => {
  process.env.DEBUG = 'true';
});
```

### 2. Inspect Database State
```typescript
test('debug test', async () => {
  const debug = await pool.query('SELECT * FROM leagues');
  console.log('Current leagues:', debug.rows);
});
```

### 3. Check Response Body
```typescript
const response = await request(app).post('/api/endpoint');
console.log('Response:', response.body);
expect(response.status).toBe(201);
```

### 4. Run Single Test
```bash
# Run only tests matching pattern
npm test -- -t "should create league with valid data"
```

### 5. Skip Tests
```typescript
// Temporarily skip a test
test.skip('should do something', async () => {
  // Test code
});

// Only run this test
test.only('should do something', async () => {
  // Test code
});
```

## Performance Tips

### 1. Parallel Test Execution
Jest runs test files in parallel by default. To run serially:
```bash
npm test -- --runInBand integration
```

### 2. Reduce Test Data
- Use minimum required data for each test
- Don't create unnecessary resources
- Clean up immediately after test

### 3. Database Indexes
Ensure test database has same indexes as production:
```sql
-- Check indexes
\d+ leagues
\d+ rosters
```

### 4. Connection Pooling
Test database pool configured in `database.ts`:
```typescript
max: 20,  // Maximum connections
min: 2,   // Minimum connections
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: tbdff_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run migrate:dev
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/tbdff_test

      - run: npm test -- integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/tbdff_test
          JWT_SECRET: test-secret
```

## Test File Structure

```
src/__tests__/
├── integration/
│   ├── README.md                          # Full documentation
│   ├── QUICK_START.md                     # This file
│   ├── league-api.integration.test.ts     # League tests
│   ├── draft-pick-api.integration.test.ts # Draft tests
│   └── matchup-api.integration.test.ts    # Matchup tests
├── jest.setup.ts                          # Test environment setup
└── TEMPLATE_integration.test.ts           # Template for new tests
```

## Quick Reference

### Test Lifecycle
```typescript
beforeAll()   // Run once before all tests (create test data)
beforeEach()  // Run before each test (optional)
test()        // Individual test case
afterEach()   // Run after each test (cleanup test-specific data)
afterAll()    // Run once after all tests (cleanup all test data)
```

### Common Assertions
```typescript
expect(response.status).toBe(201);
expect(response.body.success).toBe(true);
expect(response.body.data).toMatchObject({ id: expect.any(Number) });
expect(dbResult.rows.length).toBe(1);
expect(response.body.message).toContain('required');
```

### Making Requests
```typescript
// GET
await request(app).get('/api/endpoint').set('Authorization', `Bearer ${token}`);

// POST
await request(app).post('/api/endpoint').set('Authorization', `Bearer ${token}`).send(data);

// PUT
await request(app).put('/api/endpoint').set('Authorization', `Bearer ${token}`).send(data);

// DELETE
await request(app).delete('/api/endpoint').set('Authorization', `Bearer ${token}`);
```

## Getting Help

1. **Check README.md**: Full documentation with examples
2. **Check existing tests**: Look at similar test cases
3. **Check TRUTHS.md**: System constraints and business rules
4. **Check jest.config.js**: Test configuration
5. **Check package.json**: Test scripts and dependencies

## Next Steps

After running tests successfully:

1. ✅ Review test output and coverage
2. ✅ Add new test cases for uncovered scenarios
3. ✅ Update tests when API changes
4. ✅ Run tests before committing changes
5. ✅ Include tests in PR reviews

---

**For detailed documentation, see**: `README.md` in this directory

**For system constraints, see**: `docs/TRUTHS.md`

**For test templates, see**: `TEMPLATE_integration.test.ts`
