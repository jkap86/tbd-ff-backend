# Integration Tests Documentation

This directory contains end-to-end integration tests for the TBD Fantasy Football API. These tests verify the full HTTP request/response cycle, database operations, and business logic working together.

## Overview

Integration tests differ from unit tests in that they:

- **Test multiple components together**: API routes, controllers, services, and database
- **Use real database connections**: Tests run against a test database
- **Verify full HTTP cycles**: Make actual HTTP requests using supertest
- **Check database state**: Verify data is correctly persisted and updated
- **Test authorization**: Ensure proper authentication and permission checks

## Test Files

### 1. League API Integration Tests
**File**: `league-api.integration.test.ts`

Tests league creation, retrieval, and joining workflows.

**Endpoints tested**:
- `POST /api/v1/leagues/create` - Create a new league
- `GET /api/v1/leagues/:leagueId` - Get league details
- `POST /api/v1/leagues/:leagueId/join` - Join a league

**Key scenarios**:
- ✅ Valid league creation with all required fields
- ✅ Database verification (league, roster, settings)
- ✅ Commissioner roster auto-creation
- ✅ Member authorization checks
- ✅ Invite code validation
- ❌ Missing required fields (400)
- ❌ Invalid data formats (400)
- ❌ Unauthorized access (401, 403)
- ❌ Non-existent resources (404)

### 2. Draft Pick API Integration Tests
**File**: `draft-pick-api.integration.test.ts`

Tests the complete draft lifecycle from creation to pick execution.

**Endpoints tested**:
- `POST /api/v1/drafts/create` - Create a draft
- `POST /api/v1/drafts/:draftId/order` - Set draft order
- `POST /api/v1/drafts/:draftId/start` - Start draft
- `POST /api/v1/drafts/:draftId/pick` - Make a draft pick
- `GET /api/v1/drafts/:draftId/picks` - Get all draft picks

**Key scenarios**:
- ✅ Draft creation and configuration
- ✅ Draft order setup (commissioner only)
- ✅ Draft state transitions (not_started → in_progress)
- ✅ Valid pick execution with turn verification
- ✅ Snake draft order reversal
- ✅ Player ownership after pick
- ❌ Picking when not on the clock (400)
- ❌ Drafting already-picked players (400)
- ❌ Non-owner attempting picks (403)
- ❌ Invalid draft states (400)

### 3. Matchup API Integration Tests
**File**: `matchup-api.integration.test.ts`

Tests matchup generation, score updates, and finalization.

**Endpoints tested**:
- `POST /api/v1/matchups/league/:leagueId/week/:week/generate` - Generate matchups
- `GET /api/v1/matchups/league/:leagueId/week/:week` - Get matchups for week
- `POST /api/v1/matchups/league/:leagueId/week/:week/update-scores` - Update scores
- `GET /api/v1/matchups/:matchupId/details` - Get matchup details

**Key scenarios**:
- ✅ Matchup generation for a week
- ✅ Score calculation from player stats
- ✅ Score updates and persistence
- ✅ Concurrent update handling (idempotency)
- ✅ Matchup details with rosters
- ❌ Missing season parameter (400)
- ❌ Non-commissioner operations (403)
- ❌ Invalid week numbers (400)

## Test Structure

All integration tests follow this consistent structure:

```typescript
describe('Feature Integration Tests', () => {
  // Persistent test data
  let testUserId: number;
  let testToken: string;
  let testResourceId: number;

  // ========================================
  // SETUP & TEARDOWN
  // ========================================

  beforeAll(async () => {
    // Create test users
    // Generate JWT tokens
    // Create base test data
  });

  afterAll(async () => {
    // Clean up test data in reverse order
    // Close database connection
  });

  beforeEach(async () => {
    // Optional: Reset state between tests
  });

  afterEach(async () => {
    // Clean up test-specific data
  });

  // ========================================
  // ENDPOINT TESTS
  // ========================================

  describe('POST /api/endpoint', () => {
    test('should succeed with valid data', async () => {
      // Arrange: Prepare request data
      // Act: Make API request
      // Assert: Check response AND database state
    });

    test('should return 400 with invalid data', async () => {
      // Test validation errors
    });

    test('should return 401 without authentication', async () => {
      // Test auth requirement
    });

    test('should return 403 for unauthorized user', async () => {
      // Test authorization
    });
  });

  // ========================================
  // WORKFLOW TESTS
  // ========================================

  describe('Complete Feature Workflow', () => {
    test('should complete full workflow', async () => {
      // Step 1: Create resource
      // Step 2: Verify in database
      // Step 3: Update resource
      // Step 4: Verify final state
    });
  });
});
```

## Database Setup

### Test Database Configuration

Integration tests use a separate test database configured in `jest.setup.ts`:

```typescript
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/tbdff_test';
```

### Data Isolation

Each test suite:
1. Creates its own test data in `beforeAll()`
2. Cleans up in `afterAll()` in **reverse order** (respecting foreign keys)
3. Uses unique identifiers (timestamps) to avoid conflicts

### Foreign Key Cleanup Order

Always delete in this order:
1. Draft picks, matchups, weekly lineups (child tables)
2. Drafts, rosters (depends on leagues/users)
3. Leagues, users (parent tables)
4. Players (if test-created)

## Authentication Patterns

### JWT Token Generation

```typescript
const testToken = jwt.sign(
  { userId: testUserId, username: 'testuser', isAdmin: false },
  process.env.JWT_SECRET || 'test-secret',
  { expiresIn: '1h' }
);
```

### Making Authenticated Requests

```typescript
const response = await request(app)
  .post('/api/v1/endpoint')
  .set('Authorization', `Bearer ${testToken}`)
  .send(requestData);
```

## Assertion Patterns

### Response Assertions

```typescript
expect(response.status).toBe(201);
expect(response.body.success).toBe(true);
expect(response.body.data.resource).toMatchObject({
  id: expect.any(Number),
  name: 'Expected Name',
});
```

### Database Verification

```typescript
const dbResult = await pool.query(
  'SELECT * FROM table WHERE id = $1',
  [resourceId]
);
expect(dbResult.rows.length).toBe(1);
expect(dbResult.rows[0].status).toBe('expected_status');
```

### Error Response Assertions

```typescript
expect(response.status).toBe(400);
expect(response.body.success).toBe(false);
expect(response.body.message).toContain('required');
```

## Running Integration Tests

### Run all integration tests
```bash
npm test -- integration
```

### Run specific test file
```bash
npm test -- league-api.integration.test.ts
```

### Run with coverage
```bash
npm run test:coverage -- integration
```

### Run in watch mode
```bash
npm run test:watch -- integration
```

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Clean up test-specific data in `afterEach()`
- Don't rely on test execution order

### 2. Database State Verification
- Always verify both HTTP response AND database state
- Check that relationships are created correctly
- Verify cascade deletes work as expected

### 3. Error Scenarios
- Test all error codes (400, 401, 403, 404, 500)
- Verify error messages are descriptive
- Test edge cases (negative numbers, empty arrays, etc.)

### 4. Authorization Testing
- Test unauthenticated requests (401)
- Test unauthorized users (403)
- Test role-based permissions (commissioner vs. member)

### 5. Multi-Step Workflows
- Include at least one complete workflow test per suite
- Verify state transitions between steps
- Clean up workflow-specific data

### 6. Unique Identifiers
- Use timestamps for unique codes: `` `T${Date.now().toString().slice(-8)}` ``
- Prevents conflicts between test runs
- Makes debugging easier

### 7. Concurrency Testing
- Test concurrent operations when relevant
- Verify idempotency where expected
- Check for race conditions

## Common Patterns

### Creating Test Users

```typescript
const userResult = await pool.query(
  `INSERT INTO users (username, email, password)
   VALUES ($1, $2, $3) RETURNING id`,
  ['testuser', 'test@test.com', 'hashedpassword']
);
const userId = userResult.rows[0].id;
```

### Creating Test League

```typescript
const leagueResult = await pool.query(
  `INSERT INTO leagues (name, status, season, ...)
   VALUES ($1, $2, $3, ...) RETURNING id`,
  ['Test League', 'pre_draft', '2025', ...]
);
const leagueId = leagueResult.rows[0].id;
```

### Testing Sequential Operations

```typescript
// Step 1: Create
const createRes = await request(app).post('/api/resource').send(data);
const resourceId = createRes.body.data.id;

// Step 2: Read
const getRes = await request(app).get(`/api/resource/${resourceId}`);
expect(getRes.status).toBe(200);

// Step 3: Update
const updateRes = await request(app).put(`/api/resource/${resourceId}`).send(updates);
expect(updateRes.status).toBe(200);

// Step 4: Verify in DB
const dbCheck = await pool.query('SELECT * FROM table WHERE id = $1', [resourceId]);
expect(dbCheck.rows[0].field).toBe(expectedValue);
```

## Debugging Integration Tests

### Enable Verbose Logging

Set environment variable:
```bash
DEBUG=true npm test -- integration
```

### Inspect Database State

Add this to your test:
```typescript
const debug = await pool.query('SELECT * FROM table');
console.log('Debug:', debug.rows);
```

### Check Transaction Rollbacks

If tests are failing due to incomplete transactions:
```typescript
// Add to afterEach
await pool.query('ROLLBACK'); // Force rollback
```

### Verify Foreign Key Constraints

```typescript
try {
  await pool.query('DELETE FROM parent WHERE id = $1', [id]);
} catch (error) {
  console.log('FK Error:', error.message); // Helps identify dependencies
}
```

## Adding New Integration Tests

To add a new integration test:

1. **Create new file**: `src/__tests__/integration/[feature]-api.integration.test.ts`

2. **Copy structure** from existing test (league or draft)

3. **Define test data** in `beforeAll()`:
   - Create users and tokens
   - Create base resources (leagues, rosters, etc.)
   - Create test-specific data

4. **Write endpoint tests**:
   - Success scenarios (200, 201)
   - Validation errors (400)
   - Auth errors (401, 403)
   - Not found errors (404)

5. **Add workflow test**: Complete multi-step scenario

6. **Add cleanup**: Delete data in `afterAll()` in reverse order

7. **Run and verify**:
   ```bash
   npm test -- your-new-test.integration.test.ts
   ```

## Truths & Constraints

Integration tests must respect all system truths from `docs/TRUTHS.md`:

- **One roster per user per league** (UNIQUE constraint)
- **One draft per league** (UNIQUE constraint)
- **Commissioner stored in league.settings.commissioner_id**
- **Draft status state machine** (not_started → in_progress → completed)
- **Foreign key cascade rules** (delete league cascades to rosters, drafts, etc.)
- **Authorization patterns** (commissioner vs. member vs. owner)

## Coverage Goals

Integration tests should cover:
- ✅ Critical user paths (create league → join → draft → score)
- ✅ Authorization boundaries (who can do what)
- ✅ Data integrity (foreign keys, constraints)
- ✅ State transitions (draft status, matchup finalization)
- ✅ Error handling (validation, not found, unauthorized)
- ✅ Edge cases (empty data, concurrent operations)

## Maintenance

### Updating Tests

When API changes:
1. Update test data to match new schema
2. Update assertions for new response structure
3. Add tests for new validation rules
4. Update cleanup to handle new relationships

### Database Migrations

After migrations:
1. Verify test database has new schema
2. Update test data creation if columns added/changed
3. Update cleanup if foreign keys changed
4. Run all integration tests to verify

## References

- **Supertest docs**: https://github.com/visionmedia/supertest
- **Jest docs**: https://jestjs.io/docs/getting-started
- **TRUTHS.md**: System invariants and constraints
- **Template**: `TEMPLATE_integration.test.ts` for reference

---

**Last Updated**: January 2025

For questions or issues with integration tests, consult existing test files or refer to the TRUTHS.md document for system constraints.
