# Testing Strategy - Fantasy Football Application

## Executive Summary

**Current Status**: ~5-10% test coverage with critical gaps in core features
**Goal**: 60-80% coverage on critical paths within 3 months
**Immediate Risk**: Draft, waiver, and scoring systems have 0% coverage

This document provides a comprehensive testing strategy to prevent regressions and improve code quality.

---

## Table of Contents

1. [Current Test Status](#current-test-status)
2. [Testing Philosophy](#testing-philosophy)
3. [Test Types & When to Use Them](#test-types--when-to-use-them)
4. [Test Priority Matrix](#test-priority-matrix)
5. [Implementation Plan](#implementation-plan)
6. [Testing Workflow](#testing-workflow)
7. [Tools & Configuration](#tools--configuration)
8. [Test Templates](#test-templates)
9. [Regression Prevention Strategy](#regression-prevention-strategy)

---

## Current Test Status

### Backend (Node.js + Jest)
- **Tests**: 77 total (44 passing, 33 failing)
- **Pass Rate**: 57%
- **Coverage**: ~5-10%
- **Framework**: Jest 30.2.0 + Supertest

**Covered**:
- ✅ Authentication (registration, login)
- ✅ Scoring calculations (most cases)
- ✅ Basic roster transactions
- ✅ JWT middleware

**Not Covered** (0% coverage):
- ❌ Draft system (snake, linear, auction)
- ❌ Waiver processing
- ❌ Trade system
- ❌ Playoff bracket generation
- ❌ Weekly matchup scheduling
- ❌ All socket handlers
- ❌ 23/23 controllers (except auth)
- ❌ 27/29 services

### Frontend (Flutter)
- **Status**: All tests currently failing (compilation errors)
- **Tests**: 5 test files
- **Framework**: Flutter Test + Mockito

**Issues**:
- Missing generated mocks (need `build_runner`)
- Compilation errors in main app code
- API signature mismatches

### CI/CD
- ⚠️ Git hooks exist but enforcement DISABLED
- ⚠️ No automated test runs on PR/merge
- ⚠️ No coverage reporting

---

## Testing Philosophy

### The Testing Pyramid

```
        /\
       /E2E\         <- 5-10% (Critical user paths only)
      /------\
     / Inte-  \      <- 20-30% (API + DB interactions)
    / gration \
   /------------\
  /    Unit      \   <- 60-70% (Business logic, algorithms)
 /----------------\
```

### Our Specific Approach

**For Fantasy Football App:**

1. **Unit Tests (60-70%)**
   - Draft algorithms (snake, auction, auto-pick)
   - Scoring calculations
   - Waiver processing logic
   - Tiebreaker algorithms
   - Utility functions

2. **Integration Tests (20-30%)**
   - API endpoints with database
   - Socket handlers with state changes
   - Service layer interactions
   - External API calls (Sleeper, NFL)

3. **E2E Tests (5-10%)**
   - Complete draft flow (join → draft → see team)
   - League creation → settings → draft
   - Weekly lineup → scoring → standings
   - Waiver claim → processing → roster update

---

## Test Types & When to Use Them

### 1. Unit Tests

**What**: Test individual functions in isolation

**When to Write**:
- Pure functions (input → output, no side effects)
- Business logic calculations
- Algorithms (draft order, waiver priority)
- Data transformations

**Example Use Cases**:
```typescript
// Scoring calculations
calculateFantasyPoints(stats) → number
applyPPRScoring(receptions, pprValue) → number

// Draft algorithms
generateSnakeDraftOrder(teams, rounds) → DraftPick[]
calculateNextPick(currentPick, totalTeams) → DraftPick

// Waiver logic
determineWaiverPriority(claims) → ProcessedClaim[]
calculateFAABBid(budget, amount) → boolean
```

**Template**: See [Unit Test Template](#unit-test-template)

---

### 2. Integration Tests

**What**: Test multiple components working together

**When to Write**:
- API endpoints (controller + service + database)
- Socket handlers (socket + service + database)
- Service calling other services
- External API integrations

**Example Use Cases**:
```typescript
// API Integration
POST /leagues → creates league in DB → returns league object

// Service Integration
draftService.makePick() → updates roster → notifies via socket

// External API
sleeperService.getStats() → fetches from Sleeper → transforms to our format
```

**Template**: See [Integration Test Template](#integration-test-template)

---

### 3. End-to-End (E2E) Tests

**What**: Test complete user workflows from UI to database

**When to Write**:
- Critical user paths that MUST work
- Workflows that span multiple features
- Real-world scenarios users will experience

**Example Use Cases**:
```typescript
// Critical Flows
User creates league → invites players → starts draft → completes draft → sees team

User sets lineup → week processes → sees matchup result → checks standings

User submits waiver → waiver processes → sees updated roster
```

**Template**: See [E2E Test Template](#e2e-test-template)

---

### 4. Regression Tests

**What**: Re-running ALL existing tests on every change

**Purpose**: Catch unintended side effects

**How**:
- Run full test suite before every commit (git hooks)
- Run full test suite on every PR (GitHub Actions)
- Manual smoke test checklist for releases

**Template**: See [Regression Checklist](#regression-checklist)

---

## Test Priority Matrix

### Priority 1: CRITICAL (Week 1-2)

These features have **high complexity**, **high user impact**, and **0% coverage**:

| Feature | Complexity | Risk | Files to Test | Lines |
|---------|-----------|------|---------------|-------|
| **Snake Draft Algorithm** | High | Critical | `autoPickService.ts`, `draftSocket.ts` | 968 |
| **Waiver Processing** | High | Critical | `waiverService.ts`, `waiverSocket.ts` | 631 |
| **Scoring Calculations** | Medium | Critical | Fix existing failing tests | - |
| **League Creation** | Medium | High | `leagueController.ts`, `scheduleService.ts` | 427+ |

**Why These First?**
- Draft bugs ruin entire season for users
- Waiver bugs create unfair competitive advantage
- Scoring bugs affect game integrity
- These are the features you're likely modifying

---

### Priority 2: HIGH (Weeks 3-4)

| Feature | Complexity | Risk | Files to Test |
|---------|-----------|------|---------------|
| **Auction Draft** | High | High | `auctionSocket.ts` (711 lines) |
| **Trade System** | Medium | High | `tradeController.ts`, `tradeSocket.ts` |
| **Playoff Brackets** | High | Medium | `playoffService.ts` (808 lines) |
| **Weekly Matchups** | Medium | High | `matchupService.ts`, `liveScoreService.ts` |

---

### Priority 3: MEDIUM (Weeks 5-8)

| Feature | Complexity | Risk | Files to Test |
|---------|-----------|------|---------------|
| **Tiebreaker Logic** | High | Medium | `tiebreakerService.ts` (695 lines) |
| **Draft Pick Trading** | Medium | Medium | `draftPickService.ts` (281 lines) |
| **Keeper Selection** | Medium | Medium | `keeperService.ts` |
| **Roster Validation** | Medium | Medium | Various roster checks |

---

### Priority 4: LOW (Ongoing)

| Feature | Complexity | Risk | Notes |
|---------|-----------|------|-------|
| **Authentication** | Low | Low | Already tested ✅ |
| **Basic Roster CRUD** | Low | Low | Already tested ✅ |
| **UI Widget Tests** | Low | Low | Add incrementally |
| **Admin Features** | Low | Low | Less frequently used |

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

**Goal**: Fix existing tests, enable enforcement, establish workflow

#### Tasks:

1. **Fix Failing Tests**
   ```bash
   # Backend: Fix kicker scoring bugs
   cd backend
   npm test -- scoring.test.ts
   # Debug and fix scoring calculation in scoringService.ts

   # Frontend: Generate mocks and fix compilation
   cd flutter_app
   flutter pub run build_runner build --delete-conflicting-outputs
   flutter test
   ```

2. **Enable Test Enforcement**
   ```bash
   # Edit .git/hooks/pre-commit
   ENFORCE_TESTS="true"  # Change from "false"

   # Edit .git/hooks/pre-push
   ENFORCE_TESTS="true"  # Change from "false"
   ```

3. **Add GitHub Actions Workflow**
   - Create `.github/workflows/tests.yml`
   - Run on PR creation and merge
   - Report coverage
   - Block merge on failure

4. **Create Test Templates**
   - Unit test template
   - Integration test template
   - E2E test template
   - Document in this file

---

### Phase 2: Critical Path Testing (Weeks 2-3)

**Goal**: Cover the highest-risk features with 60%+ coverage

#### 2.1 Draft System Tests

**Files to Create**:
```
backend/src/__tests__/draft-algorithm.test.ts
backend/src/__tests__/draft-socket.test.ts
backend/src/__tests__/auto-pick.test.ts
backend/src/__tests__/draft-integration.test.ts
```

**Test Cases**:

**Unit Tests** (`draft-algorithm.test.ts`):
```typescript
describe('Snake Draft Algorithm', () => {
  test('generates correct pick order for 10 teams, 15 rounds')
  test('reverses order in even rounds')
  test('reverses 3rd round only when setting enabled')
  test('handles odd number of teams')
  test('calculates next pick correctly')
  test('determines if user is on the clock')
})

describe('Linear Draft Algorithm', () => {
  test('generates correct pick order (same order each round)')
  test('handles 12 teams, 16 rounds')
})

describe('Draft Timer', () => {
  test('calculates time remaining correctly')
  test('auto-pauses overnight when enabled')
  test('resumes at specified time')
  test('handles timezone differences')
})
```

**Unit Tests** (`auto-pick.test.ts`):
```typescript
describe('Auto-Pick Service', () => {
  test('selects highest ADP available player')
  test('respects position needs (QB-heavy roster)')
  test('skips injured players when setting enabled')
  test('handles no available players scenario')
  test('selects based on team scoring settings (PPR vs Standard)')
})
```

**Integration Tests** (`draft-integration.test.ts`):
```typescript
describe('Draft Flow Integration', () => {
  test('complete draft flow: start → pick → complete')
  test('player becomes unavailable after being drafted')
  test('roster updates correctly after pick')
  test('draft advances to next team')
  test('auto-pick triggers after timer expires')
  test('draft completes when all picks made')
  test('socket emits correct events to all participants')
})
```

---

#### 2.2 Waiver System Tests

**Files to Create**:
```
backend/src/__tests__/waiver-processing.test.ts
backend/src/__tests__/waiver-faab.test.ts
backend/src/__tests__/waiver-integration.test.ts
```

**Test Cases**:

**Unit Tests** (`waiver-processing.test.ts`):
```typescript
describe('Waiver Claim Processing', () => {
  test('processes claims in priority order')
  test('skips claim if player already rostered')
  test('skips claim if roster full and no drop')
  test('updates waiver priority after successful claim')
  test('handles multiple claims for same player')
  test('respects waiver budget (FAAB)')
  test('handles tie in FAAB bids (waiver priority tiebreaker)')
})
```

**Unit Tests** (`waiver-faab.test.ts`):
```typescript
describe('FAAB Budget System', () => {
  test('deducts correct amount from budget')
  test('prevents claim if insufficient budget')
  test('returns highest bid when multiple bids')
  test('handles $0 bids (uses waiver priority)')
  test('tracks budget throughout season')
})
```

**Integration Tests** (`waiver-integration.test.ts`):
```typescript
describe('Waiver Processing Integration', () => {
  test('complete waiver flow: submit → process → roster update')
  test('processes all claims at scheduled time')
  test('sends notifications to affected users')
  test('updates standings after waivers process')
  test('handles concurrent claims correctly')
})
```

---

#### 2.3 League Creation & Scheduling Tests

**Files to Create**:
```
backend/src/__tests__/league-creation.test.ts
backend/src/__tests__/schedule-generation.test.ts
```

**Test Cases**:

**Integration Tests** (`league-creation.test.ts`):
```typescript
describe('League Creation', () => {
  test('creates league with valid settings')
  test('generates correct number of roster slots')
  test('creates schedule for regular season')
  test('validates roster position requirements')
  test('prevents invalid scoring settings')
  test('sets up playoff bracket based on settings')
})
```

**Unit Tests** (`schedule-generation.test.ts`):
```typescript
describe('Schedule Generation', () => {
  test('generates balanced schedule for 10 teams, 14 weeks')
  test('ensures each team plays each other once (if possible)')
  test('handles odd number of teams (bye weeks)')
  test('respects playoff start week')
  test('generates playoff bracket (top 6 make playoffs)')
  test('seeds teams correctly (1st/2nd get bye week)')
})
```

---

### Phase 3: Core Features (Weeks 4-6)

**Goal**: Cover remaining critical features

#### 3.1 Auction Draft Tests
```
backend/src/__tests__/auction-algorithm.test.ts
backend/src/__tests__/auction-socket.test.ts
backend/src/__tests__/auction-integration.test.ts
```

#### 3.2 Trade System Tests
```
backend/src/__tests__/trade-processing.test.ts
backend/src/__tests__/trade-integration.test.ts
```

#### 3.3 Weekly Matchup Tests
```
backend/src/__tests__/matchup-generation.test.ts
backend/src/__tests__/live-scoring.test.ts
backend/src/__tests__/standings-calculation.test.ts
```

#### 3.4 Playoff System Tests
```
backend/src/__tests__/playoff-bracket.test.ts
backend/src/__tests__/tiebreaker-logic.test.ts
```

---

### Phase 4: E2E & Integration (Weeks 7-8)

**Goal**: Test complete user workflows

#### 4.1 Flutter E2E Tests

**Files to Create**:
```
flutter_app/integration_test/draft_flow_test.dart
flutter_app/integration_test/league_creation_test.dart
flutter_app/integration_test/waiver_flow_test.dart
flutter_app/integration_test/lineup_management_test.dart
```

**Test Cases**:
```dart
testWidgets('Complete Draft Flow', (tester) async {
  // 1. User logs in
  // 2. Navigates to league
  // 3. Joins draft
  // 4. Makes picks
  // 5. Sees team after draft completes
});

testWidgets('Weekly Lineup Management', (tester) async {
  // 1. User navigates to team
  // 2. Moves players from bench to starting lineup
  // 3. Saves lineup
  // 4. Sees updated lineup
  // 5. Views matchup with opponent
});
```

---

### Phase 5: Continuous Improvement (Ongoing)

**Goal**: Maintain coverage as features are added

#### Strategy:
1. **New Feature Checklist**:
   - [ ] Unit tests for business logic
   - [ ] Integration tests for API endpoints
   - [ ] Update E2E tests if critical path affected
   - [ ] All tests pass before PR merge

2. **Coverage Targets**:
   - Services: 60% minimum
   - Controllers: 50% minimum
   - Critical paths (draft, waiver, trade): 80% minimum

3. **Monthly Review**:
   - Review coverage reports
   - Identify gaps
   - Add tests for frequently buggy areas

---

## Testing Workflow

### Daily Development Workflow

```
1. Pull latest code
   ↓
2. Create feature branch
   ↓
3. Write failing test (TDD approach)
   ↓
4. Implement feature
   ↓
5. Run tests locally (npm test)
   ↓
6. Fix any failures
   ↓
7. Commit (pre-commit hook runs tests)
   ↓
8. Push (pre-push hook runs all tests)
   ↓
9. Create PR (GitHub Actions runs tests)
   ↓
10. Code review + test review
   ↓
11. Merge to dev (tests run again)
   ↓
12. Deploy to staging
   ↓
13. Manual smoke test (see checklist)
   ↓
14. Merge to main
   ↓
15. Deploy to production
```

### Git Hooks Behavior (After Enabling)

**Pre-Commit Hook**:
- Runs tests for **modified files only** (fast)
- Backend: If any `.ts` file in `backend/src/` modified → run `npm test`
- Frontend: If any `.dart` file modified → run `flutter test`
- **Blocks commit if tests fail**
- Show warning if no tests exist for modified code

**Pre-Push Hook**:
- Runs **all tests** (comprehensive)
- Backend: `npm test`
- Frontend: `flutter test`
- **Blocks push if any test fails**
- Ensures you're not pushing broken code to shared branches

---

## Tools & Configuration

### Backend (Jest + Supertest)

**Configuration**: `backend/jest.config.js`
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**'
  ],
  coverageThresholds: {
    global: {
      branches: 50,
      functions: 50,
      lines: 60,
      statements: 60
    }
  }
};
```

**Test Scripts**:
```bash
npm test                    # Run all tests
npm test -- draft          # Run tests matching "draft"
npm test:watch             # Watch mode
npm test:coverage          # Generate coverage report
```

**Dependencies**:
```json
{
  "jest": "^30.2.0",
  "ts-jest": "^29.1.2",
  "supertest": "^7.1.4",
  "@types/jest": "^29.5.12",
  "@types/supertest": "^6.0.2"
}
```

---

### Frontend (Flutter Test + Mockito)

**Configuration**: `flutter_app/pubspec.yaml`
```yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  mockito: ^5.4.4
  build_runner: ^2.4.13
  integration_test:
    sdk: flutter
```

**Test Scripts**:
```bash
flutter test                              # Run all tests
flutter test test/providers/             # Run provider tests
flutter test --coverage                   # Generate coverage
flutter test integration_test/           # Run E2E tests
flutter pub run build_runner build       # Generate mocks
```

**Generating Mocks**:
```dart
// In test file:
@GenerateMocks([AuthService, ApiClient])
import 'auth_service_test.mocks.dart';

// Then run:
flutter pub run build_runner build --delete-conflicting-outputs
```

---

### CI/CD (GitHub Actions)

**New File**: `.github/workflows/tests.yml`

```yaml
name: Tests

on:
  pull_request:
    branches: [dev, main]
  push:
    branches: [dev, main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: fantasy_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Run tests
        working-directory: ./backend
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/fantasy_test
          JWT_SECRET: test-secret
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/coverage-final.json
          flags: backend

  frontend-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Flutter
        uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.x'
          channel: 'stable'

      - name: Install dependencies
        working-directory: ./flutter_app
        run: flutter pub get

      - name: Generate mocks
        working-directory: ./flutter_app
        run: flutter pub run build_runner build --delete-conflicting-outputs

      - name: Run tests
        working-directory: ./flutter_app
        run: flutter test --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./flutter_app/coverage/lcov.info
          flags: frontend
```

---

## Test Templates

### Unit Test Template

**File**: `backend/src/__tests__/[feature].test.ts`

```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('[Feature Name] Unit Tests', () => {

  describe('[Function/Method Name]', () => {

    // Happy path
    test('should [expected behavior] when [condition]', () => {
      // Arrange: Set up test data
      const input = { /* test data */ };
      const expected = { /* expected output */ };

      // Act: Execute the function
      const result = functionUnderTest(input);

      // Assert: Verify the result
      expect(result).toEqual(expected);
    });

    // Edge cases
    test('should handle empty input', () => {
      const result = functionUnderTest([]);
      expect(result).toEqual([]);
    });

    test('should handle null input', () => {
      const result = functionUnderTest(null);
      expect(result).toBeNull();
    });

    // Error cases
    test('should throw error when [invalid condition]', () => {
      expect(() => {
        functionUnderTest(invalidInput);
      }).toThrow('Expected error message');
    });
  });

  describe('[Another Function]', () => {
    // More tests...
  });
});
```

**Example: Draft Algorithm**:
```typescript
import { generateSnakeDraftOrder } from '../services/draftService';

describe('Draft Algorithm Unit Tests', () => {

  describe('generateSnakeDraftOrder', () => {

    test('should generate correct snake order for 10 teams, 3 rounds', () => {
      const result = generateSnakeDraftOrder(10, 3);

      // Round 1: 1→10
      expect(result[0].pickNumber).toBe(1);
      expect(result[0].teamNumber).toBe(1);
      expect(result[9].pickNumber).toBe(10);
      expect(result[9].teamNumber).toBe(10);

      // Round 2: 10→1 (reversed)
      expect(result[10].pickNumber).toBe(11);
      expect(result[10].teamNumber).toBe(10);
      expect(result[19].pickNumber).toBe(20);
      expect(result[19].teamNumber).toBe(1);

      // Round 3: 1→10 (back to normal)
      expect(result[20].pickNumber).toBe(21);
      expect(result[20].teamNumber).toBe(1);
    });

    test('should handle 3rd round reversal setting', () => {
      const withReversal = generateSnakeDraftOrder(8, 3, { reverse3rdRound: true });
      const withoutReversal = generateSnakeDraftOrder(8, 3, { reverse3rdRound: false });

      // Round 3 should be different
      expect(withReversal[16].teamNumber).not.toBe(withoutReversal[16].teamNumber);
    });
  });
});
```

---

### Integration Test Template

**File**: `backend/src/__tests__/[feature]-integration.test.ts`

```typescript
import request from 'supertest';
import { app } from '../app';
import { pool } from '../db';

describe('[Feature] Integration Tests', () => {

  // Setup: Run before all tests
  beforeAll(async () => {
    // Set up test database
    await pool.query('BEGIN');
  });

  // Cleanup: Run after all tests
  afterAll(async () => {
    await pool.query('ROLLBACK');
    await pool.end();
  });

  // Reset data between tests
  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE [tables] CASCADE');
  });

  describe('POST /api/[endpoint]', () => {

    test('should [expected behavior] with valid data', async () => {
      // Arrange: Create test data
      const testData = { /* valid request body */ };

      // Act: Make API request
      const response = await request(app)
        .post('/api/[endpoint]')
        .set('Authorization', `Bearer ${validToken}`)
        .send(testData);

      // Assert: Check response
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(Number),
        // ... other expected fields
      });

      // Assert: Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM [table] WHERE id = $1',
        [response.body.id]
      );
      expect(dbResult.rows[0]).toMatchObject(testData);
    });

    test('should return 400 with invalid data', async () => {
      const invalidData = { /* missing required field */ };

      const response = await request(app)
        .post('/api/[endpoint]')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/[endpoint]')
        .send({ /* valid data */ });

      expect(response.status).toBe(401);
    });
  });
});
```

**Example: Draft Integration**:
```typescript
import request from 'supertest';
import { app } from '../app';
import { pool } from '../db';

describe('Draft Integration Tests', () => {
  let leagueId: number;
  let userId: number;
  let authToken: string;

  beforeAll(async () => {
    // Create test user and league
    const userResult = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
      ['testuser', 'test@test.com', 'hashedpassword']
    );
    userId = userResult.rows[0].id;
    authToken = generateTestToken(userId);

    const leagueResult = await pool.query(
      'INSERT INTO leagues (name, owner_id) VALUES ($1, $2) RETURNING id',
      ['Test League', userId]
    );
    leagueId = leagueResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM leagues WHERE id = $1', [leagueId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  describe('POST /api/draft/:leagueId/pick', () => {

    test('should successfully draft a player', async () => {
      const response = await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          playerId: 12345,
          pickNumber: 1
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        pick: {
          playerId: 12345,
          teamId: expect.any(Number),
          pickNumber: 1
        }
      });

      // Verify player added to roster
      const rosterResult = await pool.query(
        'SELECT * FROM rosters WHERE team_id = $1 AND player_id = $2',
        [response.body.pick.teamId, 12345]
      );
      expect(rosterResult.rows.length).toBe(1);

      // Verify draft advanced
      const draftResult = await pool.query(
        'SELECT current_pick FROM drafts WHERE league_id = $1',
        [leagueId]
      );
      expect(draftResult.rows[0].current_pick).toBe(2);
    });

    test('should reject drafting already-drafted player', async () => {
      // First pick
      await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ playerId: 99999, pickNumber: 1 });

      // Try to draft same player again
      const response = await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ playerId: 99999, pickNumber: 2 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already drafted');
    });
  });
});
```

---

### E2E Test Template

**File**: `flutter_app/integration_test/[feature]_flow_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:your_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('E2E: [Feature] Flow', () {

    testWidgets('should complete [user workflow]', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Step 1: [Action]
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();

      // Step 2: [Fill form]
      await tester.enterText(find.byKey(Key('email')), 'test@test.com');
      await tester.enterText(find.byKey(Key('password')), 'password123');
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();

      // Step 3: [Verify navigation]
      expect(find.text('Home'), findsOneWidget);

      // Step 4: [Continue workflow...]
      // ...

      // Final: [Verify expected outcome]
      expect(find.text('Success Message'), findsOneWidget);
    });

    testWidgets('should handle error case', (tester) async {
      // Test error scenarios
    });
  });
}
```

**Example: Draft Flow E2E**:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:tbd_ff/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('E2E: Complete Draft Flow', () {

    testWidgets('user can join draft, make picks, and see final team', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // 1. Login
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(Key('email')), 'test@test.com');
      await tester.enterText(find.byKey(Key('password')), 'password123');
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle(Duration(seconds: 2));

      // 2. Navigate to league
      await tester.tap(find.text('My Leagues'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Test League').first);
      await tester.pumpAndSettle();

      // 3. Join draft
      await tester.tap(find.text('Join Draft'));
      await tester.pumpAndSettle(Duration(seconds: 1));

      // 4. Verify draft lobby
      expect(find.text('Draft Lobby'), findsOneWidget);
      expect(find.text('Waiting for commissioner to start...'), findsOneWidget);

      // 5. Wait for draft to start (simulated)
      await tester.pumpAndSettle(Duration(seconds: 3));

      // 6. Make first pick (when on the clock)
      await tester.tap(find.text('Available Players'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Patrick Mahomes').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Draft Player'));
      await tester.pumpAndSettle(Duration(seconds: 1));

      // 7. Verify pick was made
      expect(find.text('Picked: Patrick Mahomes'), findsOneWidget);
      await tester.tap(find.text('My Team'));
      await tester.pumpAndSettle();
      expect(find.text('Patrick Mahomes'), findsOneWidget);

      // 8. Wait for draft to complete (simulated/fast-forwarded)
      // In real test, you'd simulate other teams picking

      // 9. Verify final team roster
      await tester.tap(find.text('View Team'));
      await tester.pumpAndSettle();
      expect(find.text('Draft Complete'), findsOneWidget);
      expect(find.byType(PlayerCard), findsNWidgets(16)); // 16 drafted players
    });
  });
}
```

---

## Regression Prevention Strategy

### Regression Checklist

**Manual Smoke Test** (before production deploy):

- [ ] **Authentication**
  - [ ] User can register new account
  - [ ] User can login
  - [ ] User can reset password

- [ ] **League Management**
  - [ ] Commissioner can create league
  - [ ] Users can join league via invite
  - [ ] League settings display correctly

- [ ] **Draft System**
  - [ ] Draft lobby shows all teams
  - [ ] Draft timer counts down correctly
  - [ ] User can make pick when on the clock
  - [ ] Auto-pick triggers after timer expires
  - [ ] Draft completes successfully
  - [ ] All teams have full rosters after draft

- [ ] **Weekly Lineup**
  - [ ] User can move players between bench and starting lineup
  - [ ] Lineup saves correctly
  - [ ] Lineup locks at game time
  - [ ] Invalid lineups show validation errors

- [ ] **Waiver System**
  - [ ] User can submit waiver claim
  - [ ] Waiver claims process at scheduled time
  - [ ] Roster updates after successful claim
  - [ ] FAAB budget deducts correctly

- [ ] **Matchups & Scoring**
  - [ ] Weekly matchups display correctly
  - [ ] Live scores update during games
  - [ ] Final scores calculate correctly
  - [ ] Standings update after week completes

- [ ] **Trade System**
  - [ ] User can propose trade
  - [ ] Trade partner receives notification
  - [ ] Trade can be accepted/rejected
  - [ ] Rosters update after trade acceptance

- [ ] **Playoff System**
  - [ ] Playoff bracket generates correctly
  - [ ] Playoff matchups display
  - [ ] Playoff scores calculate correctly

---

### Automated Regression Strategy

**1. Git Hooks (Pre-Commit & Pre-Push)**

Already implemented! Just enable:
```bash
# .git/hooks/pre-commit
ENFORCE_TESTS="true"  # Currently "false"

# .git/hooks/pre-push
ENFORCE_TESTS="true"  # Currently "false"
```

**2. GitHub Actions (PR & Merge)**

See [CI/CD section](#cicd-github-actions) for workflow file.

**3. Coverage Monitoring**

```bash
# Generate coverage reports
cd backend
npm run test:coverage

cd flutter_app
flutter test --coverage

# Review coverage/index.html
# Ensure critical files have >60% coverage
```

**4. Feature Development Checklist**

When adding a new feature, **before creating PR**:

- [ ] Unit tests written for new business logic
- [ ] Integration tests written for new API endpoints
- [ ] E2E tests updated if critical path affected
- [ ] All tests passing locally (`npm test` and `flutter test`)
- [ ] Coverage meets minimum thresholds (>60% for services)
- [ ] Manual smoke test of feature completed
- [ ] Manual smoke test of potentially affected features
- [ ] Pre-commit hook passes
- [ ] Pre-push hook passes

---

## Measuring Success

### Coverage Targets (3-Month Goal)

| Component | Current | Target | Status |
|-----------|---------|--------|--------|
| **Backend Services** | ~5% | 60% | 🔴 |
| **Backend Controllers** | ~1% | 50% | 🔴 |
| **Draft System** | 0% | 80% | 🔴 |
| **Waiver System** | 0% | 80% | 🔴 |
| **Scoring System** | 61% | 80% | 🟡 |
| **Frontend Providers** | ~10% | 50% | 🔴 |
| **Frontend Widgets** | ~5% | 30% | 🔴 |

### Quality Metrics

**Test Pass Rate**:
- Current: 57% (44/77)
- Target: 100%

**Test Execution Time**:
- Backend: Currently ~5 seconds
- Target: <30 seconds (even with 5x more tests)

**Deployment Confidence**:
- Current: Low (manual testing only)
- Target: High (automated test suite gives confidence)

**Regression Rate**:
- Current: Unknown (no tracking)
- Target: <5% (95% of releases have no regressions)

---

## Quick Reference

### Running Tests

```bash
# Backend
cd backend
npm test                    # All tests
npm test -- draft          # Tests matching "draft"
npm test:watch             # Watch mode
npm test:coverage          # With coverage

# Frontend
cd flutter_app
flutter test                           # All tests
flutter test test/providers/          # Specific directory
flutter test --coverage                # With coverage
flutter test integration_test/        # E2E tests

# Generate mocks (when adding new @GenerateMocks)
flutter pub run build_runner build --delete-conflicting-outputs
```

### Test File Locations

```
Backend:
  backend/src/__tests__/*.test.ts

Frontend:
  flutter_app/test/**/*_test.dart
  flutter_app/integration_test/*_test.dart
```

### Common Commands

```bash
# Fix Flutter compilation errors
cd flutter_app
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs

# Check test coverage
cd backend && npm test:coverage
cd flutter_app && flutter test --coverage

# Enable test enforcement
# Edit: .git/hooks/pre-commit and .git/hooks/pre-push
ENFORCE_TESTS="true"
```

---

## Next Steps

1. **Fix Existing Failures** (Day 1)
   - Backend: Fix kicker scoring tests
   - Frontend: Generate mocks, fix compilation errors

2. **Enable Enforcement** (Day 1)
   - Change `ENFORCE_TESTS="true"` in git hooks

3. **Add GitHub Actions** (Day 2)
   - Create `.github/workflows/tests.yml`

4. **Start Draft Tests** (Week 2)
   - Create `draft-algorithm.test.ts`
   - Create `draft-integration.test.ts`

5. **Continue with Priority Matrix** (Weeks 3+)
   - Waiver system tests
   - League creation tests
   - Etc.

---

## Resources

- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **Supertest Documentation**: https://github.com/ladjs/supertest
- **Flutter Testing**: https://docs.flutter.dev/testing
- **Integration Testing Flutter**: https://docs.flutter.dev/testing/integration-tests
- **Test-Driven Development**: https://www.youtube.com/watch?v=Jv2uxzhPFl4

---

*Last Updated: 2025-10-31*
*Document Version: 1.0*
