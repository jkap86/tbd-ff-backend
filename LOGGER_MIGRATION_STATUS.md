# Logger Migration Status

## Overview
Task: Replace all console.log, console.error, console.warn, and console.info statements in the backend with the winston logger.

**Initial Assessment:**
- Total console statements (excluding scripts/tests/migrations): ~1,102
- Files affected: 111

**Current Status:**
- Console statements remaining: ~950
- Files remaining: 95
- Files completed: 3 critical files + utils/logger.ts base infrastructure

## Completed Work

### 1. Core Infrastructure ✅
**File:** `src/utils/logger.ts`
- **Impact:** HIGH - This file is used throughout the codebase
- **Changes:** Updated the utils/logger wrapper to use winston logger instead of console statements
- **Benefit:** All files already using `import { logger } from "../utils/logger"` now automatically use winston
- **Console statements replaced:** 4

### 2. Socket Handlers ✅
**File:** `src/socket/draftSocket.ts`
- **Impact:** HIGH - Critical real-time communication file
- **Console statements replaced:** 43
- **Pattern established:**
  - Added: `import { logger } from "../config/logger";`
  - Replaced console.error → logger.error with structured data
  - Replaced console.log → logger.info with structured data
  - Replaced console.warn → logger.warn with structured data
  - Converted template literals to structured logging format

**Example transformation:**
```typescript
// BEFORE:
console.log(`[DraftSocket] User ${user.username} (${user.userId}) joined draft ${draft_id}`);

// AFTER:
logger.info('User joined draft', {
  username: user.username,
  userId: user.userId,
  draftId: draft_id,
  context: 'DraftSocket'
});
```

### 3. Controllers ✅
**File:** `src/controllers/authController.ts`
- **Impact:** HIGH - Authentication endpoints
- **Console statements replaced:** 2
- **Note:** This file already used utils/logger, only needed direct console.error replacements

### 4. Partial Progress 🔄
**File:** `src/socket/auctionSocket.ts`
- **Status:** Started (logger imported, ~5 replacements done)
- **Remaining:** ~35 console statements
- **Impact:** HIGH - Critical auction functionality

## Logging Patterns Established

### 1. Import Statement
```typescript
import { logger } from "../config/logger";
```

### 2. Structured Logging Format
```typescript
// For errors with context
logger.error('Error description', {
  error,
  additionalContext: value,
  context: 'ModuleName'
});

// For info logs
logger.info('Action completed', {
  key: value,
  context: 'ModuleName'
});

// For warnings
logger.warn('Warning message', {
  relevantData: value,
  context: 'ModuleName'
});
```

### 3. Context Tags
Preserve context tags like [Auth], [Draft], [Socket] as structured fields:
```typescript
// BEFORE:
console.log(`[Auth] User ${userId} logged in`);

// AFTER:
logger.info('User logged in', { userId, context: 'Auth' });
```

### 4. Template Literal Conversion
```typescript
// BEFORE:
console.error(`[Socket] Connection failed for user ${user.id}: ${error.message}`);

// AFTER:
logger.error('Connection failed', {
  userId: user.id,
  error: error.message,
  context: 'Socket'
});
```

## Files Verified Clean (No Console Statements)
1. ✅ `src/socket/draftSocket.ts` - 43 replacements
2. ✅ `src/utils/logger.ts` - 4 replacements
3. ✅ `src/controllers/authController.ts` - 2 replacements

## Remaining Work by Category

### High Priority (Critical Path)

#### Socket Handlers (~150 statements)
- [ ] `src/socket/auctionSocket.ts` - 35 remaining (started)
- [ ] `src/socket/derbySocket.ts` - 18 statements
- [ ] `src/socket/leagueSocket.ts` - 14 statements
- [ ] `src/socket/waiverSocket.ts` - 12 statements
- [ ] `src/socket/tradeSocket.ts` - 6 statements
- [ ] `src/socket/matchupSocket.ts` - 6 statements

#### Controllers (~150 statements)
- [ ] `src/controllers/draftController.ts` - 65 statements
- [ ] `src/controllers/auctionController.ts` - 28 statements
- [ ] `src/controllers/leagueController.ts` - 26 statements
- [ ] `src/controllers/playerStatsController.ts` - 24 statements
- [ ] `src/controllers/matchupController.ts` - 10 statements
- [ ] `src/controllers/derbyController.ts` - 10 statements
- [ ] `src/controllers/rosterController.ts` - 9 statements
- [ ] `src/controllers/playerStatsDatabaseController.ts` - 9 statements
- [ ] Others - ~40 statements across remaining controllers

### Medium Priority

#### Services (~250 statements)
- [ ] `src/services/tiebreakerService.ts` - 31 statements
- [ ] `src/services/autoPickService.ts` - 24 statements
- [ ] `src/services/statsPreloader.ts` - 24 statements
- [ ] `src/services/leagueMedianService.ts` - 21 statements
- [ ] `src/services/scoreScheduler.ts` - 20 statements
- [ ] `src/services/recordService.ts` - 19 statements
- [ ] `src/services/chessTimerService.ts` - 16 statements
- [ ] `src/services/playoffService.ts` - 15 statements
- [ ] `src/services/waiverService.ts` - 14 statements
- [ ] `src/services/statsScheduler.ts` - 13 statements
- [ ] `src/services/liveScoreService.ts` - 12 statements
- [ ] Others - ~100 statements across remaining services

#### Models (~250 statements)
- [ ] `src/models/Matchup.ts` - 28 statements
- [ ] `src/models/Roster.ts` - 26 statements
- [ ] `src/models/Draft.ts` - 23 statements
- [ ] `src/models/DraftOrder.ts` - 19 statements
- [ ] `src/models/League.ts` - 14 statements
- [ ] `src/models/DraftDerby.ts` - 13 statements
- [ ] `src/models/Auction.ts` - 12 statements
- [ ] `src/models/Player.ts` - 12 statements
- [ ] `src/models/RosterPayment.ts` - 11 statements
- [ ] `src/models/Payout.ts` - 10 statements
- [ ] `src/models/WeeklyLineup.ts` - 10 statements
- [ ] Others - ~100 statements across remaining models

### Lower Priority

#### Middleware (~30 statements)
- [ ] `src/utils/cronHelper.ts` - 15 statements
- [ ] `src/middleware/authorization.ts` - 6 statements
- [ ] `src/middleware/dynastyGuards.ts` - 4 statements
- [ ] Others - ~15 statements

#### Other Files (~100 statements)
- [ ] `src/routes/payments.ts` - 11 statements
- [ ] `src/utils/draftAuthorization.ts` - 6 statements
- [ ] Various configuration and utility files

## Completion Strategy

### Recommended Approach

Given the scale (950+ statements across 95 files), here are three options:

#### Option 1: Automated with Manual Review (Fastest)
Create a Node.js script to:
1. Parse each TypeScript file
2. Identify console statements with regex
3. Convert them to structured logger calls
4. Add logger import if missing
5. Manual review of changes before committing

**Pros:** Fast, consistent
**Cons:** May miss edge cases, requires careful testing

#### Option 2: Batch Manual Processing (Balanced)
Process files in batches by priority:
1. Complete all socket handlers (2-3 hours)
2. Complete all controllers (3-4 hours)
3. Complete all services (4-5 hours)
4. Complete models and middleware (3-4 hours)

**Pros:** More control, safer
**Cons:** Time-intensive

#### Option 3: Gradual Migration (Safest)
Replace console statements as files are touched for other reasons:
1. Add ESLint rule to prevent new console statements
2. Replace in files being actively modified
3. Periodic cleanup sprints

**Pros:** Minimal disruption, safer
**Cons:** Long timeline

### Recommended: Option 2 (Batch Manual Processing)

## Testing Checklist

After completing migrations, verify:

- [ ] Backend starts without errors
- [ ] Logs appear in `logs/combined.log`
- [ ] Error logs appear in `logs/error.log`
- [ ] Log format is JSON (for parsing)
- [ ] Sensitive data is redacted (passwords, tokens)
- [ ] Socket connections log properly
- [ ] Draft operations log properly
- [ ] Auction operations log properly
- [ ] Auth operations log properly
- [ ] No console statements in production code (except scripts/tests)

## ESLint Rule (Recommended)

Add to `.eslintrc.json` to prevent new console statements:

```json
{
  "rules": {
    "no-console": ["error", {
      "allow": []
    }]
  },
  "overrides": [
    {
      "files": ["src/scripts/**/*", "src/**/*.test.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

## Migration Notes

### Key Insights
1. **Two Logger Systems:** The codebase had both `../config/logger` (winston) and `../utils/logger` (wrapper). We updated utils/logger to use winston, so files using it are now compliant.

2. **Context Preservation:** The existing console statements often used `[Tag]` prefixes. We preserve these as `context` fields in the structured logging.

3. **Template Literals:** Many console statements used template literals. These convert to structured logging with separate fields for better queryability.

### Common Patterns

**Pattern 1: Simple Messages**
```typescript
// Before: console.log("Draft started");
// After:  logger.info("Draft started");
```

**Pattern 2: Messages with Variables**
```typescript
// Before: console.log(`Draft ${draftId} started`);
// After:  logger.info("Draft started", { draftId });
```

**Pattern 3: Error Handling**
```typescript
// Before: console.error("Error:", error);
// After:  logger.error("Error description", { error });
```

**Pattern 4: Complex Messages**
```typescript
// Before: console.log(`[Auth] User ${user.username} (${user.userId}) logged in from ${ip}`);
// After:  logger.info("User logged in", {
//   username: user.username,
//   userId: user.userId,
//   ip,
//   context: "Auth"
// });
```

## Next Steps

1. **Decision Point:** Choose completion strategy (Automated, Batch Manual, or Gradual)
2. **If Batch Manual:** Start with remaining socket handlers
3. **Add ESLint Rule:** Prevent new console statements
4. **Testing:** Verify logs are working after each batch
5. **Documentation:** Update TRUTHS.md if logging is a system invariant

## Progress Tracking

**Started:** [Current Date]
**Target Completion:** [Based on chosen strategy]
**Completed:** 3 files (49 statements)
**Remaining:** 95 files (~950 statements)
**Completion Rate:** 5% (by statements), 3% (by files)
