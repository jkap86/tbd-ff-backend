# Quick Reference: Console to Logger Migration

## Step-by-Step Process

### 1. Add Logger Import
At the top of the file, after other imports:
```typescript
import { logger } from "../config/logger";
```

### 2. Replacement Patterns

#### console.log → logger.info
```typescript
// Simple string
console.log("Message");
logger.info("Message");

// With variables
console.log(`User ${userId} performed action`);
logger.info("User performed action", { userId });

// With context tag
console.log(`[Auth] User ${userId} logged in`);
logger.info("User logged in", { userId, context: "Auth" });
```

#### console.error → logger.error
```typescript
// With error object
console.error("Error occurred:", error);
logger.error("Error occurred", { error });

// With context
console.error(`[Draft] Error in draft ${draftId}:`, error);
logger.error("Error in draft", { draftId, error, context: "Draft" });
```

#### console.warn → logger.warn
```typescript
// Warning message
console.warn(`Warning: ${message}`);
logger.warn("Warning message", { message });

// With context
console.warn(`[Socket] Connection issue for ${socketId}`);
logger.warn("Connection issue", { socketId, context: "Socket" });
```

#### console.debug → logger.debug
```typescript
// Debug info
console.debug("Debug:", data);
logger.debug("Debug info", { data });
```

### 3. Converting Template Literals

Break down template literals into structured data:

```typescript
// BEFORE
console.log(`[DraftSocket] User ${user.username} (ID: ${user.userId}) joined draft ${draft_id} at ${timestamp}`);

// AFTER
logger.info("User joined draft", {
  username: user.username,
  userId: user.userId,
  draftId: draft_id,
  timestamp,
  context: "DraftSocket"
});
```

### 4. Naming Conventions

Convert snake_case to camelCase in log data:
- `draft_id` → `draftId`
- `roster_id` → `rosterId`
- `player_id` → `playerId`
- `pick_number` → `pickNumber`
- `user_id` → `userId`

### 5. Context Tags

Extract and preserve context from brackets:
```typescript
// Pattern: [ContextName]
console.log(`[Auth] Message`);
// Becomes
logger.info("Message", { context: "Auth" });

// Common contexts:
// [Auth], [Draft], [Socket], [Auction], [Derby], [League], [Trade], [Waiver]
```

## File Type Specific Examples

### Socket Handlers

```typescript
// Connection
console.log(`[Socket] Socket connected: ${socket.id}`);
logger.info("Socket connected", { socketId: socket.id, context: "Socket" });

// Disconnection
console.log(`[Socket] Socket disconnected: ${socket.id}`);
logger.info("Socket disconnected", { socketId: socket.id, context: "Socket" });

// Errors
console.error(`[Socket] Error:`, error);
logger.error("Socket error", { error, context: "Socket" });

// Authorization failures
console.log(`[Socket] User ${userId} denied access`);
logger.warn("User denied access", { userId, context: "Socket" });
```

### Controllers

```typescript
// Success operations
console.log(`Created draft ${draftId}`);
logger.info("Draft created", { draftId });

// Errors with request context
console.error("Error creating draft:", error);
logger.error("Error creating draft", { error, userId: req.user?.userId });

// Validation failures
console.log(`Invalid request from user ${userId}`);
logger.warn("Invalid request", { userId, reason: "validation failed" });
```

### Services

```typescript
// Service operations
console.log(`Starting score calculation for week ${week}`);
logger.info("Starting score calculation", { week });

// Background jobs
console.log(`[Scheduler] Running job: ${jobName}`);
logger.info("Running scheduled job", { jobName, context: "Scheduler" });

// Completion
console.log(`Completed processing ${count} items`);
logger.info("Processing completed", { count });
```

### Models

```typescript
// Database operations
console.log(`Created ${modelName} with ID ${id}`);
logger.info(\`\${modelName} created\`, { id, modelName });

// Queries
console.log(`Fetching ${modelName} where ${condition}`);
logger.debug(\`Fetching \${modelName}\`, { condition });

// Updates
console.log(`Updated ${modelName} ${id}`);
logger.info(\`\${modelName} updated\`, { id, modelName });
```

## Common Mistakes to Avoid

### ❌ Don't
```typescript
// Don't use string concatenation in logger
logger.info(\`User \${userId} logged in\`);

// Don't lose error context
logger.error("Error", error.message); // Loses stack trace

// Don't use console methods
logger.info("Message", console.log(data)); // Still using console!

// Don't forget context
logger.info("Message"); // Hard to filter logs later
```

### ✅ Do
```typescript
// Use structured data
logger.info("User logged in", { userId });

// Pass full error object
logger.error("Error occurred", { error });

// Use proper log methods
logger.info("Message", { data });

// Include context
logger.info("Message", { context: "ModuleName" });
```

## Verification

After updating a file, verify:
```bash
# Check no console statements remain (should return 0)
grep -c "console\." src/path/to/file.ts

# Check logger is imported
grep "import { logger }" src/path/to/file.ts
```

## Batch Processing Template

For efficient batch processing:

1. Open file
2. Add logger import if missing
3. Find all console statements: `Ctrl+F` → `console.`
4. For each occurrence:
   - Identify log level (log→info, error, warn)
   - Extract message
   - Extract variables
   - Convert to structured format
5. Save and verify

## Files Already Using utils/logger

These files don't need the import changed, just fix any direct console calls:
```bash
# Find files using utils/logger
grep -l "from \"../utils/logger\"" src/**/*.ts
```

These files are already compliant since we updated `utils/logger.ts` to use winston.

## Quick Regex Patterns (for search/replace)

### Find console.log with string
```regex
console\.log\("([^"]+)"\);?
```
Replace with:
```typescript
logger.info("$1");
```

### Find console.error with variable
```regex
console\.error\("([^"]+)".*error\);?
```
Replace with:
```typescript
logger.error("$1", { error });
```

**Note:** Regex is good for simple cases, but manual review is recommended for complex statements.

## Testing After Changes

```bash
# Run TypeScript compiler
npm run build

# Run tests
npm test

# Start server and check logs
npm run dev

# Verify log files are being written
ls -la logs/
tail -f logs/combined.log
```

## Progress Tracking

Create a checklist:
```bash
# Get list of files with console statements
git grep -l "console\." src/ | grep -v "/scripts/" | grep -v "test.ts" > console-files.txt

# As you complete each file, mark it off
```

## Need Help?

Refer to these completed examples:
- `src/socket/draftSocket.ts` - Socket handler with 43 replacements
- `src/utils/logger.ts` - Logger wrapper implementation
- `src/controllers/authController.ts` - Controller with direct console calls
- `LOGGER_MIGRATION_STATUS.md` - Full status and context
