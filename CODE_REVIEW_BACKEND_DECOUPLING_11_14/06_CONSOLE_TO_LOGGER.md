# Task 06: Console to Logger Migration
## Priority: MEDIUM | Effort: 1 day | Impact: MEDIUM

## Problem Statement
- 405 `console.log` statements
- 81 `console.error` statements
- Additional `console.warn/debug/info` statements
- No structured logging
- Logs not suitable for production

## Detailed Subtasks

### 1. Update Utility Scripts (2 hours)
- [ ] Replace console statements in all .js scripts
- [ ] Add proper error logging
- [ ] Add log levels
- [ ] Scripts in root directory:
  - apply-migration.js
  - apply-migration-debug.js
  - check-*.js files

### 2. Update TypeScript Files (3 hours)
- [ ] Find all console.log instances
- [ ] Replace with logger.info or logger.debug
- [ ] Find all console.error instances
- [ ] Replace with logger.error
- [ ] Find all console.warn instances
- [ ] Replace with logger.warn

### 3. Add Structured Logging (1 hour)
- [ ] Add context objects to all logs
- [ ] Include request IDs
- [ ] Include user IDs where relevant
- [ ] Add performance metrics

### 4. Configure Log Levels (30 min)
- [ ] Set appropriate log levels per environment
- [ ] Configure log rotation
- [ ] Set up log aggregation
- [ ] Add log filtering

### 5. Create Migration Script (30 min)
```bash
# Script to automate replacement
grep -r "console\.log" --include="*.ts" --include="*.js" | grep -v node_modules
# Replace with sed/awk commands
```

## Files to Update
```
405 files with console.log
81 files with console.error
Estimated 50+ unique files
```

## Success Criteria
- [ ] Zero console statements in production code
- [ ] All logs use Winston logger
- [ ] Structured logging implemented
- [ ] Log levels properly configured