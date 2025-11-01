# Testing Documentation

This document provides comprehensive information about testing in the TBD Fantasy Football application.

## Table of Contents

1. [Backend Tests (Node.js/TypeScript)](#backend-tests)
2. [Flutter Tests (Dart)](#flutter-tests)
3. [Running Tests](#running-tests)
4. [Test Coverage](#test-coverage)
5. [Writing New Tests](#writing-new-tests)
6. [CI/CD Integration](#cicd-integration)

---

## Backend Tests

### Test Framework
- **Jest** - Testing framework
- **Supertest** - HTTP assertion library
- **ts-jest** - TypeScript support for Jest

### Test Structure

```
backend/src/__tests__/
├── setup.ts              # Global test setup and utilities
├── auth.test.ts          # Authentication tests
├── draft.test.ts         # Draft flow integration tests
├── league.test.ts        # League and roster tests
└── middleware.test.ts    # Middleware unit tests
```

### Test Categories

#### 1. Authentication Tests (`auth.test.ts`)
- User registration (valid/invalid)
- User login (valid/invalid credentials)
- Password validation
- Duplicate username/email handling
- Token generation

#### 2. Draft Flow Tests (`draft.test.ts`)
- Draft creation
- Draft order randomization
- Draft order persistence
- Starting a draft
- Making picks
- Pick validation (duplicates, out of turn)
- Snake draft order logic

#### 3. League Tests (`league.test.ts`)
- League creation
- League settings management
- Commissioner permissions
- Roster creation
- Roster limits enforcement
- League details retrieval

#### 4. Middleware Tests (`middleware.test.ts`)
- Authentication middleware
- Token validation
- Rate limiting configuration

### Running Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- auth.test.ts
```

### Test Database

Tests use the same database configuration as development. Ensure your `.env` file has:
```
DATABASE_URL=postgresql://user:password@localhost:5432/tbd_ff_test
```

**Important:** Tests will create and delete test data. Use a separate test database.

---

## Flutter Tests

### Test Framework
- **flutter_test** - Flutter's built-in testing framework
- **mockito** - Mocking library for dependencies

### Test Structure

```
flutter_app/test/
├── providers/
│   └── auth_provider_test.dart     # AuthProvider tests
├── services/
│   └── auth_service_test.dart      # AuthService tests
├── widgets/
│   └── draft_picks_list_test.dart  # Widget tests
└── widget_test.dart                 # Basic widget test
```

### Test Categories

#### 1. Provider Tests (`providers/`)
- State management
- Authentication flow
- Token management
- Logout functionality

#### 2. Service Tests (`services/`)
- API integration
- HTTP requests/responses
- Error handling
- Network failures

#### 3. Widget Tests (`widgets/`)
- UI rendering
- User interactions
- State changes
- Empty states
- List rendering

### Running Flutter Tests

```bash
cd flutter_app

# Run all tests
flutter test

# Run tests with coverage
flutter test --coverage

# Run specific test file
flutter test test/widgets/draft_picks_list_test.dart

# Run tests in watch mode
flutter test --watch
```

### Generating Mocks

To generate mocks for Flutter tests:

```bash
cd flutter_app
flutter pub run build_runner build
```

---

## Test Coverage

### Current Coverage

**Backend:**
- Authentication: ✅ Comprehensive
- Draft Flow: ✅ Integration tests
- League/Roster: ✅ Integration tests
- Middleware: ✅ Unit tests
- **Overall:** ~30% (targeting 70%+)

**Flutter:**
- AuthProvider: ⚠️  Basic structure (needs implementation)
- AuthService: ⚠️  Basic structure (needs implementation)
- Widgets: ✅ Draft picks list
- **Overall:** ~5% (targeting 60%+)

### Coverage Goals

| Module | Current | Target |
|--------|---------|--------|
| Backend Controllers | 30% | 80% |
| Backend Services | 10% | 70% |
| Backend Middleware | 40% | 90% |
| Flutter Providers | 5% | 70% |
| Flutter Services | 5% | 70% |
| Flutter Widgets | 10% | 50% |

---

## Writing New Tests

### Backend Test Template

```typescript
import { Request, Response } from 'express';
import { controllerFunction } from '../controllers/yourController';
import { mockRequest, mockResponse, mockAuthUser } from './setup';
import pool from '../config/database';

describe('Your Feature', () => {
  let testDataId: number;

  beforeEach(async () => {
    // Setup test data
  });

  afterEach(async () => {
    // Cleanup test data
    if (testDataId) {
      await pool.query('DELETE FROM table WHERE id = $1', [testDataId]);
    }
  });

  it('should do something', async () => {
    const req = mockRequest({
      body: { field: 'value' },
      user: mockAuthUser,
    });
    const res = mockResponse();

    await controllerFunction(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });
});
```

### Flutter Test Template

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/your_widget.dart';

void main() {
  group('YourWidget', () {
    testWidgets('should do something', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: YourWidget(),
        ),
      );

      expect(find.text('Expected Text'), findsOneWidget);
    });
  });
}
```

### Best Practices

1. **Test Organization**
   - Group related tests using `describe()` (Jest) or `group()` (Flutter)
   - Use descriptive test names starting with "should"
   - One assertion focus per test

2. **Test Data**
   - Always clean up test data in `afterEach()` or `afterAll()`
   - Use realistic test data
   - Avoid hard-coding IDs

3. **Mocking**
   - Mock external dependencies (APIs, databases)
   - Don't mock the code you're testing
   - Use dependency injection for easier testing

4. **Assertions**
   - Be specific with assertions
   - Test both success and failure cases
   - Test edge cases

5. **Coverage**
   - Aim for 70%+ coverage on critical paths
   - Don't aim for 100% - focus on important code
   - Test business logic thoroughly

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Every push to `dev` branch
- Every pull request to `main`
- Scheduled daily runs

### Backend CI

```yaml
- name: Run backend tests
  run: |
    cd backend
    npm test
```

### Flutter CI

```yaml
- name: Run Flutter tests
  run: |
    cd flutter_app
    flutter test
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
cd backend && npm test
cd ../flutter_app && flutter test
```

---

## Continuous Improvement

### Next Steps

1. **Backend:**
   - [ ] Add tests for scoring service
   - [ ] Add tests for waiver service
   - [ ] Add tests for trade service
   - [ ] Add WebSocket tests
   - [ ] Add end-to-end integration tests

2. **Flutter:**
   - [ ] Complete AuthProvider tests
   - [ ] Add DraftProvider tests
   - [ ] Add LeagueProvider tests
   - [ ] Add more widget tests
   - [ ] Add integration tests

3. **Infrastructure:**
   - [ ] Set up code coverage reporting
   - [ ] Add mutation testing
   - [ ] Set up performance testing
   - [ ] Add load testing

### Resources

- [Jest Documentation](https://jestjs.io/)
- [Flutter Testing](https://docs.flutter.dev/testing)
- [Mockito (Dart)](https://pub.dev/packages/mockito)
- [Testing Best Practices](https://testingjavascript.com/)

---

## Troubleshooting

### Common Issues

**Backend:**

1. **Database connection errors**
   - Ensure test database exists
   - Check DATABASE_URL in .env
   - Run migrations on test database

2. **Timeout errors**
   - Increase Jest timeout: `jest.setTimeout(10000)`
   - Check for hanging database connections

**Flutter:**

1. **Mock generation errors**
   - Run `flutter pub run build_runner build --delete-conflicting-outputs`
   - Ensure @GenerateMocks annotations are correct

2. **Widget not found**
   - Call `await tester.pump()` after interactions
   - Use `await tester.pumpAndSettle()` for animations

---

## Questions?

For questions about testing, please:
1. Check this documentation
2. Review existing test files
3. Open an issue on GitHub
