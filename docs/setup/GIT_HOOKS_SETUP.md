# Git Hooks Setup

This repository uses Git hooks to automatically run tests before commits and pushes.

## ⚙️ Current Mode: **WARNING MODE** (ENFORCE_TESTS=false)

Tests will run but **will NOT block** commits/pushes if they fail. You'll see warnings instead.

**To enable strict mode** (block commits on test failures):
1. Edit `.git/hooks/pre-commit` and change `ENFORCE_TESTS="false"` to `ENFORCE_TESTS="true"`
2. Edit `.git/hooks/pre-push` and change `ENFORCE_TESTS="false"` to `ENFORCE_TESTS="true"`

## Hooks Installed

### Pre-commit Hook (`.git/hooks/pre-commit`)
- **Runs**: Before every `git commit`
- **What it does**:
  - Detects which files were modified (backend or flutter_app)
  - Runs tests only for the modified project
  - **Warning mode**: Shows test results but allows commit even if tests fail
  - **Strict mode**: Blocks the commit if tests fail

### Pre-push Hook (`.git/hooks/pre-push`)
- **Runs**: Before every `git push`
- **What it does**:
  - Runs ALL tests (both backend and flutter)
  - **Warning mode**: Shows test results but allows push even if tests fail
  - **Strict mode**: Blocks the push if any tests fail

## How It Works

### Pre-commit
```bash
# If you modify backend files:
git add backend/src/somefile.js
git commit -m "fix: something"
# → Runs backend tests only

# If you modify flutter files:
git add flutter_app/lib/somefile.dart
git commit -m "feat: new feature"
# → Runs flutter tests only

# If you modify other files (docs, configs):
git add README.md
git commit -m "docs: update readme"
# → Skips tests
```

### Pre-push
```bash
git push origin main
# → Runs ALL tests (backend + flutter)
# → Only pushes if all tests pass
```

## Bypassing Hooks (Not Recommended)

If you absolutely need to bypass the hooks:

```bash
# Skip pre-commit hook
git commit --no-verify -m "your message"

# Skip pre-push hook
git push --no-verify
```

⚠️ **Warning**: Only use `--no-verify` in emergencies. Running tests before committing/pushing helps catch bugs early!

## Current Test Status

### Backend
- **Test Framework**: Jest
- **Tests Location**: `backend/__tests__/` (to be created)
- **Run manually**: `cd backend && npm test`

### Flutter
- **Test Framework**: Flutter Test
- **Tests Location**: `flutter_app/test/`
- **Run manually**: `cd flutter_app && flutter test`

## Troubleshooting

### Hook not running
```bash
# Make sure hooks are executable
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/pre-push
```

### Tests failing
```bash
# Run tests manually to see full output
cd backend && npm test
cd flutter_app && flutter test
```

### Hook errors
If you see hook errors, check:
1. You're in the repository root when committing
2. Node.js and Flutter are installed and in PATH
3. Dependencies are installed (`npm install` in backend, `flutter pub get` in flutter_app)

## Sharing Hooks with Team

**Important**: Git hooks in `.git/hooks/` are NOT tracked by Git. To share with your team, they need to:

1. Copy the hooks from this documentation or another team member
2. Place them in `.git/hooks/`
3. Make them executable: `chmod +x .git/hooks/pre-commit .git/hooks/pre-push`

**Better alternative**: Use a tool like [Husky](https://typicode.github.io/husky/) to version control hooks (can be set up later).
