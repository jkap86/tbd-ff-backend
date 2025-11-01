# Feature Development Checklist

Use this checklist for EVERY new feature or significant change to ensure quality and prevent regressions.

---

## Pre-Development

- [ ] **Understand the requirement**
  - [ ] Read user story/requirement carefully
  - [ ] Identify dependencies (what existing features does this affect?)
  - [ ] Clarify any ambiguities with stakeholders

- [ ] **Plan the implementation**
  - [ ] Identify files that need to be modified
  - [ ] Determine if new database migrations are needed
  - [ ] Plan API changes (new endpoints, modified schemas)
  - [ ] Consider edge cases and error scenarios

- [ ] **Create feature branch**
  ```bash
  git checkout dev
  git pull origin dev
  git checkout -b feature/[feature-name]
  ```

---

## During Development

### Code Implementation

- [ ] **Write tests FIRST (TDD approach)**
  - [ ] Write failing unit tests for new business logic
  - [ ] Write failing integration tests for new API endpoints
  - [ ] Run tests to confirm they fail (proving they work)

- [ ] **Implement the feature**
  - [ ] Write clean, readable code
  - [ ] Follow existing code patterns and conventions
  - [ ] Add comments for complex logic
  - [ ] Handle error cases gracefully

- [ ] **Make tests pass**
  - [ ] Implement code until all new tests pass
  - [ ] Refactor for clarity and efficiency
  - [ ] Ensure no test is skipped or disabled

### Testing Coverage

- [ ] **Unit tests written**
  - [ ] Pure functions tested in isolation
  - [ ] Business logic calculations tested
  - [ ] Edge cases covered (empty, null, undefined)
  - [ ] Error cases tested (invalid input, exceptions)

- [ ] **Integration tests written**
  - [ ] API endpoints tested with database
  - [ ] Service interactions tested
  - [ ] Authentication/authorization tested
  - [ ] Database state verified after operations

- [ ] **E2E tests updated (if needed)**
  - [ ] Critical user paths updated if feature affects them
  - [ ] New E2E test added if feature introduces new critical path

### Code Quality

- [ ] **Security review**
  - [ ] No SQL injection vulnerabilities
  - [ ] No XSS vulnerabilities
  - [ ] No command injection risks
  - [ ] Sensitive data properly sanitized
  - [ ] Authentication/authorization properly enforced
  - [ ] Rate limiting considered for new endpoints

- [ ] **Performance considerations**
  - [ ] No N+1 query problems
  - [ ] Database indexes added if needed
  - [ ] Large datasets handled efficiently
  - [ ] No memory leaks (event listeners cleaned up)

- [ ] **Error handling**
  - [ ] All async operations have try/catch or .catch()
  - [ ] Errors return appropriate HTTP status codes
  - [ ] Error messages are user-friendly (not exposing internals)
  - [ ] Errors are logged for debugging

---

## Before Committing

### Local Testing

- [ ] **Run all backend tests**
  ```bash
  cd backend
  npm test
  ```
  - [ ] All tests pass (no failures or skipped tests)
  - [ ] No console errors or warnings

- [ ] **Run all frontend tests**
  ```bash
  cd flutter_app
  flutter test
  ```
  - [ ] All tests pass
  - [ ] No compilation errors

- [ ] **Check test coverage**
  ```bash
  cd backend
  npm run test:coverage
  ```
  - [ ] New code has >60% coverage (services)
  - [ ] New code has >50% coverage (controllers)
  - [ ] Critical paths have >80% coverage

### Manual Testing

- [ ] **Test the new feature manually**
  - [ ] Feature works in happy path
  - [ ] Feature handles errors gracefully
  - [ ] UI displays correctly (if frontend change)
  - [ ] Mobile responsiveness (if frontend change)

- [ ] **Smoke test potentially affected features**
  - [ ] Identify features that share code with this change
  - [ ] Manually test those features still work
  - [ ] Use [Regression Checklist](TESTING_STRATEGY.md#regression-checklist)

### Code Review Preparation

- [ ] **Review your own code**
  - [ ] Read through all changes as if you're reviewing someone else's PR
  - [ ] Remove debug statements, console.logs, commented code
  - [ ] Ensure code follows project style guide
  - [ ] Check for hardcoded values that should be configurable

- [ ] **Update documentation**
  - [ ] Add/update code comments for complex logic
  - [ ] Update API documentation if endpoints changed
  - [ ] Update README if setup steps changed
  - [ ] Update PROJECT_NOTES.md with significant changes

---

## Committing & Pushing

### Git Workflow

- [ ] **Stage changes**
  ```bash
  git add [files]
  git status  # Review what's being committed
  ```

- [ ] **Commit with descriptive message**
  ```bash
  git commit -m "feat: add auction draft timer functionality

  - Implement chess clock timer for auction drafts
  - Add auto-pause overnight feature
  - Include timer display in draft UI
  - Add tests for timer calculations"
  ```
  - [ ] Message follows conventional commits format
  - [ ] Message describes WHAT and WHY (not just HOW)

- [ ] **Pre-commit hook passes**
  - [ ] Tests run automatically
  - [ ] All tests pass
  - [ ] No errors prevent commit

- [ ] **Push to remote**
  ```bash
  git push origin feature/[feature-name]
  ```

- [ ] **Pre-push hook passes**
  - [ ] All tests run
  - [ ] All tests pass
  - [ ] Push succeeds

---

## Pull Request

### Create PR

- [ ] **Create pull request**
  - [ ] Target branch: `dev` (not `main`)
  - [ ] Title clearly describes the feature
  - [ ] Description includes:
    - [ ] What was changed
    - [ ] Why it was changed
    - [ ] How to test it
    - [ ] Screenshots (if UI change)
    - [ ] Related issues/tickets

### PR Checklist

- [ ] **GitHub Actions tests pass**
  - [ ] Backend tests pass in CI
  - [ ] Frontend tests pass in CI
  - [ ] No build errors

- [ ] **Code review**
  - [ ] At least one approval from reviewer
  - [ ] All comments addressed
  - [ ] No unresolved conversations

- [ ] **Final checks**
  - [ ] Branch is up-to-date with dev
  - [ ] No merge conflicts
  - [ ] All tests still pass after rebase/merge

---

## After Merge

### Deployment

- [ ] **Merge to dev**
  ```bash
  git checkout dev
  git pull origin dev
  ```

- [ ] **Deploy to staging**
  - [ ] Deployment succeeds
  - [ ] Smoke test in staging environment
  - [ ] Monitor logs for errors

- [ ] **Manual testing in staging**
  - [ ] Test new feature works
  - [ ] Run regression checklist
  - [ ] Check for any console errors

### Production Deployment

- [ ] **Create PR from dev to main**
  - [ ] Include release notes
  - [ ] List all features/fixes in this release

- [ ] **Deploy to production**
  - [ ] Deployment succeeds
  - [ ] Monitor error logs immediately after deploy
  - [ ] Check critical metrics (error rate, response time)

- [ ] **Post-deployment verification**
  - [ ] Test new feature in production
  - [ ] Quick smoke test of critical paths
  - [ ] Monitor user reports/feedback

---

## Cleanup

- [ ] **Update project documentation**
  - [ ] Update PROJECT_NOTES.md if significant change
  - [ ] Update feature roadmap if applicable

- [ ] **Delete feature branch**
  ```bash
  git branch -d feature/[feature-name]
  git push origin --delete feature/[feature-name]
  ```

- [ ] **Close related issues/tickets**
  - [ ] Mark as complete
  - [ ] Add reference to PR/commit

---

## Quick Reference

### Test Commands
```bash
# Backend
cd backend
npm test                    # All tests
npm test -- [keyword]       # Specific tests
npm run test:coverage       # With coverage

# Frontend
cd flutter_app
flutter test                # All tests
flutter test test/[path]    # Specific tests
flutter test --coverage     # With coverage
```

### Common Issues

**Tests failing locally but not sure why?**
1. Check if database is running
2. Check if environment variables are set
3. Run tests with `--verbose` flag
4. Clear test database and retry

**Pre-commit hook failing?**
1. Run `npm test` or `flutter test` manually
2. Fix failing tests
3. Try commit again

**Merge conflicts?**
1. `git checkout dev && git pull origin dev`
2. `git checkout feature/[branch]`
3. `git rebase dev` (or `git merge dev`)
4. Resolve conflicts
5. Re-run tests
6. `git push --force-with-lease`

---

## Pro Tips

1. **Commit often**: Small, atomic commits are easier to review and revert if needed

2. **Test as you go**: Don't wait until the end to run tests

3. **Ask for help**: If stuck on testing approach, ask teammates

4. **Use feature flags**: For large features, consider feature flags to deploy incrementally

5. **Document assumptions**: If you made assumptions about requirements, document them

6. **Keep PRs small**: Aim for <500 lines of code changed per PR

7. **Screenshot everything**: Before/after screenshots help reviewers understand UI changes

8. **Test error cases**: Don't just test the happy path

9. **Think about scale**: Will this work with 1000 users? 10,000?

10. **Clean up as you go**: Don't leave TODOs or commented code

---

*Last Updated: 2025-10-31*
