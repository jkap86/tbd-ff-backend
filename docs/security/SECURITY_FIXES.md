# Security & Quality Fixes - Task Breakdown

This document provides detailed, step-by-step instructions for fixing all issues identified in the code review. Tasks are organized by priority and can be assigned to multiple developers in parallel.

## Quick Reference

- **Total Tasks:** 30+ grouped into 8 parallel tracks
- **Estimated Total Time:** 3-4 weeks
- **Critical Path:** Track 1 (Security Core) - 3-5 days
- **Parallel Tracks:** Can run tracks 1-8 simultaneously with different developers

---

## Test Environment Deployment Assessment

### ✅ SAFE TO DEPLOY TO TEST IF:
1. Test environment is **isolated** (not accessible from public internet)
2. Test database contains **no real user data**
3. Test environment uses **different credentials** than production
4. You set **strong JWT_SECRET** environment variable (not default)
5. CORS is configured to **only allow test frontend domain**
6. Rate limiting is enabled
7. Test environment is monitored for security scanning attempts

### ⚠️ ADDITIONAL TEST ENVIRONMENT PROTECTIONS:
```bash
# Set these environment variables for test:
JWT_SECRET=<generate-strong-random-string-min-32-chars>
ALLOWED_ORIGINS=http://localhost:3000,http://test-domain.com
NODE_ENV=test
DB_SSL=false  # Only for test, never production
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 🚨 DO NOT DEPLOY TO TEST IF:
- Test environment is publicly accessible without authentication
- Test environment shares database with production data
- You cannot set environment variables independently
- Test environment URLs are discoverable/indexable

### Recommendation:
**YES, you can deploy to test** with the precautions above. Use test deployment to validate fixes before production.

---

# TRACK 1: Critical Security Fixes (Priority: CRITICAL)
**Estimated Time:** 3-5 days
**Blocking:** Must complete before production
**Dependencies:** None - can start immediately

## Task 1.1: Fix JWT Secret Configuration

**File:** `backend/src/utils/jwt.ts`

**Current Code (Lines 1-3):**
```typescript
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
```

**Fixed Code:**
```typescript
import jwt from "jsonwebtoken";

// Enforce JWT_SECRET as required configuration
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is required. " +
    "Generate a strong secret with: openssl rand -base64 32"
  );
}

if (JWT_SECRET.length < 32) {
  throw new Error(
    "FATAL: JWT_SECRET must be at least 32 characters long for security."
  );
}
```

**Testing:**
1. Remove `JWT_SECRET` from `.env` and run server - should fail to start with clear error
2. Set weak secret (< 32 chars) - should fail to start
3. Set strong secret - should start successfully

**Generate Strong Secret:**
```bash
# Run this and add to .env file
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

---

## Task 1.2: Fix Database Error Handler

**File:** `backend/src/config/database.ts`

**Current Code (Lines 19-22):**
```typescript
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});
```

**Fixed Code:**
```typescript
// Track consecutive errors for circuit breaker pattern
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RESET_TIMEOUT = 60000; // 1 minute

pool.on("error", (err) => {
  console.error("Unexpected error on idle client:", {
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString(),
  });

  consecutiveErrors++;

  // Alert monitoring system (TODO: integrate with your monitoring tool)
  // Example: Sentry.captureException(err);

  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.error(
      `CRITICAL: ${MAX_CONSECUTIVE_ERRORS} consecutive database errors. ` +
      "Manual intervention required."
    );
    // In production, this should trigger alerts, not exit
    // For now, log critically but allow server to attempt recovery
  }

  // Reset error counter after timeout
  setTimeout(() => {
    if (consecutiveErrors > 0) {
      consecutiveErrors--;
    }
  }, ERROR_RESET_TIMEOUT);
});

// Add connection health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}
```

**Additional Changes Needed:**

**File:** `backend/src/index.ts` (Add health check endpoint)

Add after existing routes (around line 70):
```typescript
// Health check endpoint
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();

  if (dbHealthy) {
    res.status(200).json({ status: "healthy", database: "connected" });
  } else {
    res.status(503).json({ status: "unhealthy", database: "disconnected" });
  }
});
```

**Testing:**
1. Simulate database error (disconnect database temporarily)
2. Verify server stays running and logs error
3. Verify health check endpoint returns 503
4. Reconnect database
5. Verify health check returns 200

---

## Task 1.3: Fix CORS Configuration

**File:** `backend/src/index.ts`

**Current Code (Lines 44-47, 65):**
```typescript
// In Socket.io setup:
cors: {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST"],
}

// Later in file:
app.use(cors()); // Enables CORS for all origins
```

**Fixed Code:**

Replace both CORS configurations with:

```typescript
import cors from "cors";

// Parse and validate allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map(origin => origin.trim());

if (!allowedOrigins || allowedOrigins.length === 0) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: ALLOWED_ORIGINS environment variable is required in production. " +
      "Example: ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com"
    );
  } else {
    // Default for development only
    console.warn(
      "WARNING: ALLOWED_ORIGINS not set. Defaulting to localhost:3000 for development."
    );
    allowedOrigins = ["http://localhost:3000"];
  }
}

// Validate origin format
allowedOrigins.forEach(origin => {
  try {
    new URL(origin);
  } catch (error) {
    throw new Error(`Invalid origin in ALLOWED_ORIGINS: ${origin}`);
  }
});

console.log("CORS enabled for origins:", allowedOrigins);

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true, // Allow cookies/authorization headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // Cache preflight requests for 24 hours
};

// Apply to Express
app.use(cors(corsOptions));

// Apply to Socket.io (around line 44)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
```

**Environment Variable Setup:**

Add to `.env.example`:
```bash
# CORS Configuration - REQUIRED for production
# Comma-separated list of allowed origins (no trailing slashes)
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com
```

**Testing:**
1. Set `ALLOWED_ORIGINS=http://localhost:3000`
2. Make request from `localhost:3000` - should succeed
3. Make request from different origin - should fail with CORS error
4. Test Socket.io connection from allowed origin - should connect
5. Test Socket.io from disallowed origin - should fail

---

## Task 1.4: Implement Comprehensive Input Validation

**File:** `backend/src/validators/authValidator.ts` (NEW FILE)

Create this new file:

```typescript
import { body, ValidationChain } from "express-validator";

// Validation rules for registration
export const registerValidator: ValidationChain[] = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Username can only contain letters, numbers, underscores, and hyphens")
    .custom((value) => {
      const reserved = ["admin", "root", "system", "api", "null", "undefined"];
      if (reserved.includes(value.toLowerCase())) {
        throw new Error("This username is reserved");
      }
      return true;
    }),

  body("email")
    .trim()
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email must be less than 255 characters"),

  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, " +
      "one uppercase letter, and one number"
    )
    .not()
    .matches(/^(.)\1+$/)
    .withMessage("Password cannot be all the same character"),

  body("phone_number")
    .optional({ nullable: true })
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Must be a valid phone number in E.164 format"),

  body("first_name")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("First name must be less than 50 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("First name can only contain letters, spaces, hyphens, and apostrophes"),

  body("last_name")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Last name must be less than 50 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("Last name can only contain letters, spaces, hyphens, and apostrophes"),
];

// Validation rules for login
export const loginValidator: ValidationChain[] = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ max: 255 })
    .withMessage("Username too long"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ max: 128 })
    .withMessage("Password too long"),
];

// Validation for password reset request
export const resetRequestValidator: ValidationChain[] = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail(),
];

// Validation for password reset
export const resetPasswordValidator: ValidationChain[] = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("Reset token is required")
    .isLength({ min: 32, max: 256 })
    .withMessage("Invalid token format"),

  body("newPassword")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, " +
      "one uppercase letter, and one number"
    ),
];
```

**File:** `backend/src/middleware/validationMiddleware.ts` (NEW FILE)

```typescript
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

/**
 * Middleware to check validation results and return errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Format errors for client
    const formattedErrors = errors.array().map((error) => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formattedErrors,
    });
  }

  next();
};
```

**File:** `backend/src/controllers/authController.ts`

Update imports at the top:
```typescript
import {
  registerValidator,
  loginValidator,
  resetRequestValidator,
  resetPasswordValidator,
} from "../validators/authValidator";
import { handleValidationErrors } from "../middleware/validationMiddleware";
```

**File:** `backend/src/routes/authRoutes.ts`

Update routes to include validation:

```typescript
import { Router } from "express";
import {
  register,
  login,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authController";
import {
  registerValidator,
  loginValidator,
  resetRequestValidator,
  resetPasswordValidator,
} from "../validators/authValidator";
import { handleValidationErrors } from "../middleware/validationMiddleware";
import { loginLimiter, passwordResetLimiter } from "../middleware/rateLimiter";

const router = Router();

// Apply validation middleware to routes
router.post(
  "/register",
  registerValidator,
  handleValidationErrors,
  register
);

router.post(
  "/login",
  loginLimiter,
  loginValidator,
  handleValidationErrors,
  login
);

router.post(
  "/request-password-reset",
  passwordResetLimiter,
  resetRequestValidator,
  handleValidationErrors,
  requestPasswordReset
);

router.post(
  "/reset-password",
  resetPasswordValidator,
  handleValidationErrors,
  resetPassword
);

export default router;
```

**Testing:**
1. Test registration with weak password - should fail with clear message
2. Test registration with invalid email - should fail
3. Test registration with short username - should fail
4. Test registration with valid data - should succeed
5. Test login with empty fields - should fail
6. Test password reset with invalid email - should fail

---

## Task 1.5: Fix Race Conditions in Waiver Processing

**File:** `backend/src/services/waiverService.ts`

**Current Code (Lines 91-100):**
```typescript
export async function processWaivers(leagueId: number): Promise<void> {
  try {
    // Get pending claims sorted by priority
    const pendingClaims = await getPendingClaimsByLeague(leagueId);

    // Process each claim
    for (const claim of pendingClaims) {
      // Check if player is available
      // Process claim
    }
  } catch (error) {
    // ...
  }
}
```

**Fixed Code:**

```typescript
import { pool } from "../config/database";
import { PoolClient } from "pg";

/**
 * Process all pending waiver claims for a league with transaction isolation
 */
export async function processWaivers(leagueId: number): Promise<void> {
  const client = await pool.connect();

  try {
    // Begin transaction with SERIALIZABLE isolation level
    // This prevents phantom reads and ensures consistent view of data
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    // Lock the league row to prevent concurrent processing
    await client.query(
      "SELECT id FROM leagues WHERE id = $1 FOR UPDATE",
      [leagueId]
    );

    // Get pending claims sorted by priority within transaction
    const pendingClaimsResult = await client.query(
      `SELECT wc.*, r.user_id, r.league_id
       FROM waiver_claims wc
       JOIN rosters r ON wc.roster_id = r.id
       WHERE r.league_id = $1
         AND wc.status = 'pending'
       ORDER BY wc.priority ASC, wc.created_at ASC
       FOR UPDATE OF wc`,
      [leagueId]
    );

    const pendingClaims = pendingClaimsResult.rows;

    // Track processed players in this batch to prevent duplicates
    const claimedPlayerIds = new Set<number>();

    for (const claim of pendingClaims) {
      try {
        // Skip if player already claimed in this batch
        if (claimedPlayerIds.has(claim.player_id)) {
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
            ["failed", claim.id]
          );
          continue;
        }

        // Check if player is available (not on any roster in this league)
        const playerAvailabilityResult = await client.query(
          `SELECT COUNT(*) as count
           FROM roster_players rp
           JOIN rosters r ON rp.roster_id = r.id
           WHERE r.league_id = $1 AND rp.player_id = $2`,
          [leagueId, claim.player_id]
        );

        const isAvailable = parseInt(playerAvailabilityResult.rows[0].count) === 0;

        if (!isAvailable) {
          // Player taken - mark claim as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
            ["failed", claim.id]
          );
          continue;
        }

        // Check roster spot availability
        const rosterCountResult = await client.query(
          "SELECT COUNT(*) as count FROM roster_players WHERE roster_id = $1",
          [claim.roster_id]
        );

        const rosterCount = parseInt(rosterCountResult.rows[0].count);
        const maxRosterSize = 16; // TODO: Get from league settings

        if (rosterCount >= maxRosterSize) {
          // No roster space - mark as failed
          await client.query(
            "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
            ["failed", claim.id]
          );
          continue;
        }

        // If drop_player_id is specified, verify ownership and remove
        if (claim.drop_player_id) {
          const dropResult = await client.query(
            "DELETE FROM roster_players WHERE roster_id = $1 AND player_id = $2 RETURNING id",
            [claim.roster_id, claim.drop_player_id]
          );

          if (dropResult.rowCount === 0) {
            // Couldn't drop player - mark claim as failed
            await client.query(
              "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
              ["failed", claim.id]
            );
            continue;
          }
        }

        // Add player to roster
        await client.query(
          "INSERT INTO roster_players (roster_id, player_id, added_at) VALUES ($1, $2, NOW())",
          [claim.roster_id, claim.player_id]
        );

        // Mark claim as successful
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
          ["successful", claim.id]
        );

        // Track claimed player
        claimedPlayerIds.add(claim.player_id);

        // Update waiver priority (move to end)
        await updateWaiverPriority(client, claim.roster_id, leagueId);

        console.log(`Waiver claim ${claim.id} processed successfully`);
      } catch (claimError) {
        console.error(`Error processing claim ${claim.id}:`, claimError);
        // Mark individual claim as failed but continue with others
        await client.query(
          "UPDATE waiver_claims SET status = $1, processed_at = NOW() WHERE id = $2",
          ["failed", claim.id]
        );
      }
    }

    // Commit transaction
    await client.query("COMMIT");
    console.log(`Processed ${pendingClaims.length} waiver claims for league ${leagueId}`);
  } catch (error) {
    // Rollback on any error
    await client.query("ROLLBACK");
    console.error("Error processing waivers:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update waiver priority after successful claim
 */
async function updateWaiverPriority(
  client: PoolClient,
  rosterId: number,
  leagueId: number
): Promise<void> {
  // Move this roster to the end of the waiver order
  await client.query(
    `UPDATE rosters
     SET waiver_priority = (
       SELECT MAX(waiver_priority) + 1
       FROM rosters
       WHERE league_id = $1
     )
     WHERE id = $2`,
    [leagueId, rosterId]
  );
}
```

**Testing:**
1. Create multiple waiver claims for same player
2. Run waiver processing
3. Verify only one claim succeeds
4. Verify other claims marked as failed
5. Test concurrent waiver processing (run function twice simultaneously)
6. Verify no duplicate player assignments

---

## Task 1.6: Remove Sensitive Data from Logs

**File:** `backend/src/services/emailService.ts`

**Current Code (Lines 152-153):**
```typescript
console.log("Reset Link:", resetLink); // Contains sensitive token
```

**Fixed Code:**

Replace all logging in this file:

```typescript
// Remove or redact sensitive data logging

// REMOVE THIS LINE (line 152-153):
// console.log("Reset Link:", resetLink);

// REPLACE WITH:
console.log("Password reset email sent to user:", {
  userId: user.id,
  email: user.email.substring(0, 3) + "***", // Redact email
  tokenLength: token.length, // Log token length for debugging, not token itself
  expiresAt: expiresAt.toISOString(),
});
```

**Additional Files to Audit:**

Search for all console.log statements that might contain sensitive data:

```bash
# Run this to find potential issues:
grep -r "console.log.*token" backend/src/
grep -r "console.log.*password" backend/src/
grep -r "console.log.*secret" backend/src/
```

**Create Secure Logging Utility:**

**File:** `backend/src/utils/logger.ts` (NEW FILE)

```typescript
/**
 * Secure logging utility that redacts sensitive information
 */

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "jwt",
  "api_key",
  "apiKey",
];

/**
 * Redact sensitive information from objects before logging
 */
function redactSensitiveData(data: any): any {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sensitive) =>
      keyLower.includes(sensitive)
    );

    if (isSensitive) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Safe logging functions
 */
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data ? redactSensitiveData(data) : "");
  },

  error: (message: string, error?: any) => {
    console.error(
      `[ERROR] ${message}`,
      error ? redactSensitiveData(error) : ""
    );
  },

  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data ? redactSensitiveData(data) : "");
  },

  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[DEBUG] ${message}`,
        data ? redactSensitiveData(data) : ""
      );
    }
  },
};
```

**Update All Controllers to Use Logger:**

Example for `authController.ts`:

```typescript
import { logger } from "../utils/logger";

// Replace console.log with logger
// OLD: console.log("User registered:", user);
// NEW:
logger.info("User registered", { userId: user.id, username: user.username });
```

**Testing:**
1. Trigger password reset
2. Verify logs don't contain reset token
3. Trigger errors with sensitive data
4. Verify sensitive data is redacted in logs

---

## Task 1.7: Add Authorization Checks

**File:** `backend/src/middleware/authorization.ts` (NEW FILE)

```typescript
import { Request, Response, NextFunction } from "express";
import { getLeagueById } from "../models/League";
import { getRosterById } from "../models/Roster";
import { getTradeById } from "../models/Trade";

/**
 * Extended Request type with user info from auth middleware
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
  };
}

/**
 * Check if user is commissioner of a league
 */
export async function requireCommissioner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const leagueId = parseInt(req.params.leagueId || req.body.leagueId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const league = await getLeagueById(leagueId);

    if (!league) {
      return res.status(404).json({
        success: false,
        message: "League not found",
      });
    }

    if (league.commissioner_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the league commissioner can perform this action",
      });
    }

    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user is a member of a league
 */
export async function requireLeagueMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const leagueId = parseInt(req.params.leagueId || req.body.leagueId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if user has a roster in this league
    const query = `
      SELECT COUNT(*) as count
      FROM rosters
      WHERE league_id = $1 AND user_id = $2
    `;

    const { pool } = await import("../config/database");
    const result = await pool.query(query, [leagueId, userId]);
    const isMember = parseInt(result.rows[0].count) > 0;

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this league",
      });
    }

    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user owns a specific roster
 */
export async function requireRosterOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const rosterId = parseInt(req.params.rosterId || req.body.rosterId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const roster = await getRosterById(rosterId);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found",
      });
    }

    if (roster.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "You do not own this roster",
      });
    }

    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user is involved in a trade (proposer or receiver)
 */
export async function requireTradeParticipant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const tradeId = parseInt(req.params.tradeId || req.body.tradeId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const trade = await getTradeById(tradeId);

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: "Trade not found",
      });
    }

    // Get rosters involved in trade
    const { pool } = await import("../config/database");
    const result = await pool.query(
      `SELECT user_id FROM rosters WHERE id IN ($1, $2)`,
      [trade.proposer_roster_id, trade.receiver_roster_id]
    );

    const participantUserIds = result.rows.map((row) => row.user_id);

    if (!participantUserIds.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this trade",
      });
    }

    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}
```

**Update Routes to Use Authorization:**

**File:** `backend/src/routes/leagueRoutes.ts`

```typescript
import {
  requireCommissioner,
  requireLeagueMember,
} from "../middleware/authorization";

// Add authorization to routes
router.put(
  "/:leagueId/settings",
  authenticate,
  requireCommissioner, // Add this
  updateLeagueSettings
);

router.post(
  "/:leagueId/start-draft",
  authenticate,
  requireCommissioner, // Add this
  startDraft
);

router.get(
  "/:leagueId/rosters",
  authenticate,
  requireLeagueMember, // Add this
  getLeagueRosters
);
```

**File:** `backend/src/routes/rosterRoutes.ts`

```typescript
import { requireRosterOwnership } from "../middleware/authorization";

router.put(
  "/:rosterId/starters",
  authenticate,
  requireRosterOwnership, // Add this
  setStarters
);

router.post(
  "/:rosterId/drop-player",
  authenticate,
  requireRosterOwnership, // Add this
  dropPlayer
);
```

**Testing:**
1. Try to modify league settings as non-commissioner - should fail
2. Try to set starters for another user's roster - should fail
3. Try to access league data as non-member - should fail
4. Test valid operations - should succeed

---

## Task 1.8: Add Database Indexes

**File:** `backend/migrations/027_add_performance_indexes.sql` (NEW FILE)

```sql
-- Critical Performance Indexes
-- Run this migration to add indexes for frequently queried columns

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- Leagues table indexes
CREATE INDEX IF NOT EXISTS idx_leagues_commissioner ON leagues(commissioner_id);
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

-- Rosters table indexes
CREATE INDEX IF NOT EXISTS idx_rosters_league ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_user ON rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_league_user ON rosters(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_waiver_priority ON rosters(league_id, waiver_priority);

-- Roster players (composite indexes for joins)
CREATE INDEX IF NOT EXISTS idx_roster_players_roster ON roster_players(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_players_player ON roster_players(player_id);
CREATE INDEX IF NOT EXISTS idx_roster_players_roster_player ON roster_players(roster_id, player_id);

-- Draft picks
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster ON draft_picks(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_pick_number ON draft_picks(draft_id, pick_number);

-- Waiver claims
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league_priority ON waiver_claims(roster_id, priority);

-- Trades
CREATE INDEX IF NOT EXISTS idx_trades_proposer ON trades(proposer_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_receiver ON trades(receiver_roster_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);

-- Matchups
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1 ON matchups(roster_id_1);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2 ON matchups(roster_id_2);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roster ON transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Players (for search and filtering)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(to_tsvector('english', name || ' ' || COALESCE(team, '')));

-- Player stats (critical for performance)
CREATE INDEX IF NOT EXISTS idx_player_stats_player_week ON player_stats(player_id, week, season);
CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leagues_commissioner_status ON leagues(commissioner_id, status);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_round_pick ON draft_picks(draft_id, round, pick_number);

-- Add comments for documentation
COMMENT ON INDEX idx_users_email IS 'Used for login and password reset lookups';
COMMENT ON INDEX idx_leagues_invite_code IS 'Used for joining leagues via invite code';
COMMENT ON INDEX idx_rosters_league_user IS 'Composite index for checking league membership';
COMMENT ON INDEX idx_waiver_claims_league_priority IS 'Used for processing waivers in priority order';
COMMENT ON INDEX idx_player_stats_player_week IS 'Critical for scoring calculations';
```

**Run Migration:**

```bash
# Apply migration
psql -U your_username -d your_database -f backend/migrations/027_add_performance_indexes.sql

# Or if you have a migration runner:
npm run migrate
```

**Verify Indexes:**

```sql
-- Check that indexes were created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

**Testing:**
1. Run `EXPLAIN ANALYZE` on slow queries before adding indexes
2. Add indexes
3. Run same queries again - should show index scans instead of seq scans
4. Monitor query performance in production

---

# TRACK 2: Input Validation Extensions (Priority: HIGH)
**Estimated Time:** 2-3 days
**Dependencies:** Task 1.4 must be complete
**Can run in parallel with:** Tracks 3, 4, 5, 6, 7, 8

## Task 2.1: Create League Validation

**File:** `backend/src/validators/leagueValidator.ts` (NEW FILE)

```typescript
import { body, param, ValidationChain } from "express-validator";

export const createLeagueValidator: ValidationChain[] = [
  body("name")
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("League name must be between 3 and 50 characters")
    .matches(/^[a-zA-Z0-9\s'-]+$/)
    .withMessage("League name can only contain letters, numbers, spaces, hyphens, and apostrophes"),

  body("type")
    .isIn(["redraft", "keeper", "dynasty"])
    .withMessage("League type must be redraft, keeper, or dynasty"),

  body("size")
    .isInt({ min: 2, max: 20 })
    .withMessage("League size must be between 2 and 20 teams"),

  body("scoring_type")
    .isIn(["standard", "ppr", "half_ppr", "custom"])
    .withMessage("Invalid scoring type"),

  body("draft_type")
    .optional()
    .isIn(["snake", "linear", "auction", "slow_auction"])
    .withMessage("Invalid draft type"),

  body("settings")
    .optional()
    .isObject()
    .withMessage("Settings must be an object")
    .custom((value) => {
      // Validate settings structure
      if (value.roster_positions) {
        const validPositions = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BENCH", "IR"];
        for (const [position, count] of Object.entries(value.roster_positions)) {
          if (!validPositions.includes(position)) {
            throw new Error(`Invalid roster position: ${position}`);
          }
          if (typeof count !== "number" || count < 0 || count > 10) {
            throw new Error(`Invalid count for ${position}: must be 0-10`);
          }
        }
      }

      if (value.scoring_settings) {
        // Validate scoring settings are numbers
        for (const [key, val] of Object.entries(value.scoring_settings)) {
          if (typeof val !== "number") {
            throw new Error(`Scoring setting ${key} must be a number`);
          }
        }
      }

      if (value.trade_deadline_week) {
        const week = value.trade_deadline_week;
        if (!Number.isInteger(week) || week < 1 || week > 18) {
          throw new Error("Trade deadline week must be between 1 and 18");
        }
      }

      return true;
    }),
];

export const updateLeagueValidator: ValidationChain[] = [
  param("leagueId")
    .isInt({ min: 1 })
    .withMessage("Invalid league ID"),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("League name must be between 3 and 50 characters"),

  body("settings")
    .optional()
    .isObject()
    .withMessage("Settings must be an object"),
];

export const joinLeagueValidator: ValidationChain[] = [
  body("invite_code")
    .trim()
    .isLength({ min: 6, max: 20 })
    .withMessage("Invalid invite code format"),

  body("team_name")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Team name must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9\s'-]+$/)
    .withMessage("Team name contains invalid characters"),
];
```

## Task 2.2: Trade Validation

**File:** `backend/src/validators/tradeValidator.ts` (NEW FILE)

```typescript
import { body, param, ValidationChain } from "express-validator";

export const proposeTradeValidator: ValidationChain[] = [
  body("proposer_roster_id")
    .isInt({ min: 1 })
    .withMessage("Invalid proposer roster ID"),

  body("receiver_roster_id")
    .isInt({ min: 1 })
    .withMessage("Invalid receiver roster ID")
    .custom((value, { req }) => {
      if (value === req.body.proposer_roster_id) {
        throw new Error("Cannot trade with yourself");
      }
      return true;
    }),

  body("proposer_players")
    .isArray({ min: 0, max: 10 })
    .withMessage("Proposer players must be an array (max 10 players)"),

  body("proposer_players.*")
    .isInt({ min: 1 })
    .withMessage("Invalid player ID in proposer players"),

  body("receiver_players")
    .isArray({ min: 0, max: 10 })
    .withMessage("Receiver players must be an array (max 10 players)"),

  body("receiver_players.*")
    .isInt({ min: 1 })
    .withMessage("Invalid player ID in receiver players"),

  body("proposer_draft_picks")
    .optional()
    .isArray({ max: 5 })
    .withMessage("Maximum 5 draft picks can be traded"),

  body("receiver_draft_picks")
    .optional()
    .isArray({ max: 5 })
    .withMessage("Maximum 5 draft picks can be traded"),

  // Must have at least one asset on each side
  body()
    .custom((value) => {
      const proposerAssets = (value.proposer_players?.length || 0) +
                            (value.proposer_draft_picks?.length || 0);
      const receiverAssets = (value.receiver_players?.length || 0) +
                            (value.receiver_draft_picks?.length || 0);

      if (proposerAssets === 0 || receiverAssets === 0) {
        throw new Error("Both sides must include at least one asset");
      }
      return true;
    }),
];

export const respondTradeValidator: ValidationChain[] = [
  param("tradeId")
    .isInt({ min: 1 })
    .withMessage("Invalid trade ID"),

  body("action")
    .isIn(["accept", "reject"])
    .withMessage("Action must be accept or reject"),
];
```

## Task 2.3: Waiver Claim Validation

**File:** `backend/src/validators/waiverValidator.ts` (NEW FILE)

```typescript
import { body, param, ValidationChain } from "express-validator";

export const submitWaiverClaimValidator: ValidationChain[] = [
  body("roster_id")
    .isInt({ min: 1 })
    .withMessage("Invalid roster ID"),

  body("player_id")
    .isInt({ min: 1 })
    .withMessage("Invalid player ID"),

  body("drop_player_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid drop player ID")
    .custom((value, { req }) => {
      if (value === req.body.player_id) {
        throw new Error("Cannot add and drop the same player");
      }
      return true;
    }),

  body("priority")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Priority must be between 1 and 100"),

  body("bid_amount")
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage("Bid amount must be between 0 and 1000"),
];

export const cancelWaiverClaimValidator: ValidationChain[] = [
  param("claimId")
    .isInt({ min: 1 })
    .withMessage("Invalid claim ID"),
];
```

## Task 2.4: Draft Validation

**File:** `backend/src/validators/draftValidator.ts` (NEW FILE)

```typescript
import { body, param, ValidationChain } from "express-validator";

export const makeDraftPickValidator: ValidationChain[] = [
  param("draftId")
    .isInt({ min: 1 })
    .withMessage("Invalid draft ID"),

  body("player_id")
    .isInt({ min: 1 })
    .withMessage("Invalid player ID"),

  body("roster_id")
    .isInt({ min: 1 })
    .withMessage("Invalid roster ID"),
];

export const startDraftValidator: ValidationChain[] = [
  body("draft_type")
    .isIn(["snake", "linear", "auction", "slow_auction"])
    .withMessage("Invalid draft type"),

  body("pick_time_seconds")
    .optional()
    .isInt({ min: 30, max: 600 })
    .withMessage("Pick time must be between 30 and 600 seconds"),

  body("start_time")
    .optional()
    .isISO8601()
    .withMessage("Invalid start time format")
    .custom((value) => {
      const startTime = new Date(value);
      const now = new Date();
      if (startTime < now) {
        throw new Error("Start time must be in the future");
      }
      return true;
    }),
];

export const makeBidValidator: ValidationChain[] = [
  param("draftId")
    .isInt({ min: 1 })
    .withMessage("Invalid draft ID"),

  body("player_id")
    .isInt({ min: 1 })
    .withMessage("Invalid player ID"),

  body("bid_amount")
    .isInt({ min: 1, max: 999 })
    .withMessage("Bid amount must be between 1 and 999"),
];
```

## Task 2.5: Socket Event Validation

**File:** `backend/src/validators/socketValidator.ts` (NEW FILE)

```typescript
/**
 * Validation for Socket.io events
 * Since express-validator doesn't work with sockets, we need custom validation
 */

export interface ValidationError {
  field: string;
  message: string;
}

export function validateDraftJoin(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.draft_id || typeof data.draft_id !== "number" || data.draft_id < 1) {
    errors.push({ field: "draft_id", message: "Invalid draft ID" });
  }

  if (!data.roster_id || typeof data.roster_id !== "number" || data.roster_id < 1) {
    errors.push({ field: "roster_id", message: "Invalid roster ID" });
  }

  return errors;
}

export function validateDraftPick(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.draft_id || typeof data.draft_id !== "number" || data.draft_id < 1) {
    errors.push({ field: "draft_id", message: "Invalid draft ID" });
  }

  if (!data.player_id || typeof data.player_id !== "number" || data.player_id < 1) {
    errors.push({ field: "player_id", message: "Invalid player ID" });
  }

  if (!data.roster_id || typeof data.roster_id !== "number" || data.roster_id < 1) {
    errors.push({ field: "roster_id", message: "Invalid roster ID" });
  }

  return errors;
}

export function validateAuctionBid(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.draft_id || typeof data.draft_id !== "number" || data.draft_id < 1) {
    errors.push({ field: "draft_id", message: "Invalid draft ID" });
  }

  if (!data.player_id || typeof data.player_id !== "number" || data.player_id < 1) {
    errors.push({ field: "player_id", message: "Invalid player ID" });
  }

  if (!data.bid_amount || typeof data.bid_amount !== "number" ||
      data.bid_amount < 1 || data.bid_amount > 999) {
    errors.push({ field: "bid_amount", message: "Bid amount must be between 1 and 999" });
  }

  return errors;
}

export function validateChatMessage(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.message || typeof data.message !== "string") {
    errors.push({ field: "message", message: "Message is required" });
  } else if (data.message.length > 500) {
    errors.push({ field: "message", message: "Message too long (max 500 characters)" });
  }

  if (!data.room || typeof data.room !== "string") {
    errors.push({ field: "room", message: "Room is required" });
  }

  return errors;
}
```

**Update Socket Handlers:**

**File:** `backend/src/socket/draftSocket.ts`

Add validation to socket handlers:

```typescript
import {
  validateDraftJoin,
  validateDraftPick,
  validateAuctionBid,
} from "../validators/socketValidator";

// In socket handler setup:
socket.on("join_draft", async (data) => {
  try {
    // Validate input
    const errors = validateDraftJoin(data);
    if (errors.length > 0) {
      socket.emit("error", {
        message: "Validation failed",
        errors,
      });
      return;
    }

    // Continue with existing logic...
  } catch (error) {
    socket.emit("error", { message: "Failed to join draft" });
  }
});

socket.on("make_pick", async (data) => {
  try {
    const errors = validateDraftPick(data);
    if (errors.length > 0) {
      socket.emit("error", {
        message: "Validation failed",
        errors,
      });
      return;
    }

    // Continue with existing logic...
  } catch (error) {
    socket.emit("error", { message: "Failed to make pick" });
  }
});
```

---

# TRACK 3: Testing Infrastructure (Priority: HIGH)
**Estimated Time:** 1-2 weeks
**Dependencies:** None
**Can run in parallel with:** All other tracks

## Task 3.1: Set Up Testing Framework

**Install Dependencies:**

```bash
cd backend
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
```

**File:** `backend/jest.config.js` (NEW FILE)

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  testTimeout: 10000,
};
```

**File:** `backend/src/__tests__/setup.ts` (NEW FILE)

```typescript
// Test setup and global mocks
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-minimum-32-characters-long";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
```

**Update package.json:**

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration"
  }
}
```

---

## Task 3.2: Unit Tests for Authentication

**File:** `backend/src/__tests__/unit/auth.test.ts` (NEW FILE)

```typescript
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateToken, verifyToken } from "../../utils/jwt";

describe("Authentication Utils", () => {
  describe("JWT Token Generation", () => {
    it("should generate a valid JWT token", () => {
      const payload = { id: 1, username: "testuser" };
      const token = generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });

    it("should include correct payload in token", () => {
      const payload = { id: 1, username: "testuser" };
      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(payload.id);
      expect(decoded.username).toBe(payload.username);
    });

    it("should fail with invalid token", () => {
      const invalidToken = "invalid.token.here";
      expect(() => verifyToken(invalidToken)).toThrow();
    });
  });

  describe("Password Hashing", () => {
    it("should hash passwords correctly", async () => {
      const password = "TestPassword123";
      const hashed = await bcrypt.hash(password, 10);

      expect(hashed).not.toBe(password);
      expect(hashed.length).toBeGreaterThan(50);
    });

    it("should verify correct password", async () => {
      const password = "TestPassword123";
      const hashed = await bcrypt.hash(password, 10);
      const isValid = await bcrypt.compare(password, hashed);

      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const password = "TestPassword123";
      const hashed = await bcrypt.hash(password, 10);
      const isValid = await bcrypt.compare("WrongPassword", hashed);

      expect(isValid).toBe(false);
    });
  });
});
```

---

## Task 3.3: Integration Tests for API Endpoints

**File:** `backend/src/__tests__/integration/auth.api.test.ts` (NEW FILE)

```typescript
import request from "supertest";
import app from "../../index"; // Export app from index.ts
import { pool } from "../../config/database";

describe("Auth API Endpoints", () => {
  // Clean up test data after all tests
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE username LIKE 'testuser%'");
    await pool.end();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user with valid data", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser1",
          email: "test1@example.com",
          password: "TestPass123",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty("id");
      expect(response.body.data.user.username).toBe("testuser1");
      expect(response.body.data).toHaveProperty("token");
    });

    it("should fail with weak password", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser2",
          email: "test2@example.com",
          password: "weak",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with invalid email", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser3",
          email: "not-an-email",
          password: "TestPass123",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with duplicate username", async () => {
      // First registration
      await request(app).post("/api/auth/register").send({
        username: "testuser4",
        email: "test4@example.com",
        password: "TestPass123",
      });

      // Duplicate
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser4",
          email: "test4b@example.com",
          password: "TestPass123",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeAll(async () => {
      // Create test user
      await request(app).post("/api/auth/register").send({
        username: "logintest",
        email: "logintest@example.com",
        password: "TestPass123",
      });
    });

    it("should login with valid credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "logintest",
        password: "TestPass123",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("token");
    });

    it("should fail with incorrect password", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "logintest",
        password: "WrongPassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with non-existent user", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "nonexistent",
        password: "TestPass123",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
```

**Update index.ts to export app:**

**File:** `backend/src/index.ts`

At the end of file, add:

```typescript
// Export app for testing
export default app;
```

---

## Task 3.4: Tests for Critical Business Logic

**File:** `backend/src/__tests__/unit/waiver.test.ts` (NEW FILE)

```typescript
import { processWaivers } from "../../services/waiverService";
import { pool } from "../../config/database";

// Mock database
jest.mock("../../config/database");

describe("Waiver Processing Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should process claims in priority order", async () => {
    // TODO: Implement test with mocked database
  });

  it("should prevent duplicate claims for same player", async () => {
    // TODO: Implement test
  });

  it("should handle roster size limits", async () => {
    // TODO: Implement test
  });
});
```

---

## Task 3.5: Flutter Widget Tests

**File:** `frontend/test/widget_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tbd_fantasy_app/main.dart';

void main() {
  testWidgets('App starts and shows login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();

    // Verify login screen elements are present
    expect(find.text('Login'), findsOneWidget);
    expect(find.byType(TextField), findsWidgets);
  });

  testWidgets('Login form validation works', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();

    // Try to submit empty form
    final loginButton = find.text('Login');
    await tester.tap(loginButton);
    await tester.pumpAndSettle();

    // Should show validation errors
    expect(find.text('Username is required'), findsOneWidget);
  });
}
```

**Run Flutter tests:**

```bash
cd frontend
flutter test
flutter test --coverage
```

---

# TRACK 4: Performance Optimization (Priority: MEDIUM)
**Estimated Time:** 1 week
**Dependencies:** Task 1.8 (indexes) recommended
**Can run in parallel with:** Tracks 2, 3, 5, 6, 7, 8

## Task 4.1: Implement Caching Layer

**Install Redis:**

```bash
npm install redis @types/redis
```

**File:** `backend/src/config/cache.ts` (NEW FILE)

```typescript
import { createClient, RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

export async function initializeCache(): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not configured. Caching disabled.");
    return;
  }

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    await redisClient.connect();
    console.log("Redis cache connected successfully");
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    redisClient = null;
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (error) {
    console.error("Cache get error:", error);
    return null;
  }
}

export async function setCache(
  key: string,
  value: any,
  expirationSeconds: number = 300
): Promise<void> {
  if (!redisClient) return;

  try {
    await redisClient.setEx(key, expirationSeconds, JSON.stringify(value));
  } catch (error) {
    console.error("Cache set error:", error);
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redisClient) return;

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
}

export async function closeCache(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
  }
}
```

**Update index.ts:**

```typescript
import { initializeCache, closeCache } from "./config/cache";

// In startup
async function startServer() {
  await initializeCache();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

// In shutdown
process.on("SIGTERM", async () => {
  await closeCache();
  // ... rest of shutdown
});
```

---

## Task 4.2: Cache Player Data

**File:** `backend/src/models/Player.ts`

Add caching to expensive queries:

```typescript
import { getCached, setCache, invalidateCache } from "../config/cache";

export async function getAllPlayers(): Promise<Player[]> {
  // Try cache first
  const cacheKey = "players:all";
  const cached = await getCached<Player[]>(cacheKey);

  if (cached) {
    return cached;
  }

  // Cache miss - query database
  const query = "SELECT * FROM players ORDER BY name";
  const result = await pool.query(query);
  const players = result.rows;

  // Cache for 1 hour
  await setCache(cacheKey, players, 3600);

  return players;
}

export async function getPlayersByPosition(position: string): Promise<Player[]> {
  const cacheKey = `players:position:${position}`;
  const cached = await getCached<Player[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const query = "SELECT * FROM players WHERE position = $1 ORDER BY name";
  const result = await pool.query(query, [position]);
  const players = result.rows;

  await setCache(cacheKey, players, 3600);

  return players;
}

// Invalidate cache when players are updated
export async function updatePlayer(id: number, data: Partial<Player>): Promise<void> {
  // Update database
  // ...

  // Invalidate caches
  await invalidateCache("players:*");
}
```

---

## Task 4.3: Fix N+1 Queries

**File:** `backend/src/models/Roster.ts`

**Current (N+1 problem):**

```typescript
// Gets rosters, then for each roster queries players separately
export async function getRostersWithPlayers(leagueId: number) {
  const rosters = await getRostersByLeague(leagueId);

  for (const roster of rosters) {
    roster.players = await getPlayersByRoster(roster.id); // N+1!
  }

  return rosters;
}
```

**Fixed (single query with JOIN):**

```typescript
export async function getRostersWithPlayers(leagueId: number) {
  const query = `
    SELECT
      r.id as roster_id,
      r.user_id,
      r.team_name,
      r.waiver_priority,
      u.username,
      json_agg(
        json_build_object(
          'player_id', p.id,
          'name', p.name,
          'position', p.position,
          'team', p.team
        )
      ) FILTER (WHERE p.id IS NOT NULL) as players
    FROM rosters r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN roster_players rp ON r.id = rp.roster_id
    LEFT JOIN players p ON rp.player_id = p.id
    WHERE r.league_id = $1
    GROUP BY r.id, r.user_id, r.team_name, r.waiver_priority, u.username
    ORDER BY r.id
  `;

  const result = await pool.query(query, [leagueId]);
  return result.rows;
}
```

---

## Task 4.4: Add Pagination

**File:** `backend/src/controllers/playerController.ts`

```typescript
export async function getPlayers(req: Request, res: Response) {
  try {
    // Parse pagination params
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    // Parse filters
    const position = req.query.position as string;
    const team = req.query.team as string;
    const search = req.query.search as string;

    // Build query
    let query = "SELECT * FROM players WHERE 1=1";
    const params: any[] = [];
    let paramCount = 1;

    if (position) {
      query += ` AND position = $${paramCount}`;
      params.push(position);
      paramCount++;
    }

    if (team) {
      query += ` AND team = $${paramCount}`;
      params.push(team);
      paramCount++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR team ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Get total count
    const countQuery = query.replace("SELECT *", "SELECT COUNT(*)");
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY name LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        players: result.rows,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: offset + limit < totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch players",
    });
  }
}
```

---

## Task 4.5: Optimize Draft Room Queries

**File:** `backend/src/models/Draft.ts`

```typescript
/**
 * Get complete draft state in a single query
 * Optimized for draft room real-time display
 */
export async function getDraftState(draftId: number) {
  // Use cached version if available
  const cacheKey = `draft:${draftId}:state`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const query = `
    SELECT
      d.id,
      d.league_id,
      d.status,
      d.current_pick,
      d.pick_time_seconds,
      d.type as draft_type,
      json_agg(
        DISTINCT jsonb_build_object(
          'pick_number', dp.pick_number,
          'round', dp.round,
          'roster_id', dp.roster_id,
          'player_id', dp.player_id,
          'player_name', p.name,
          'player_position', p.position,
          'picked_at', dp.picked_at
        ) ORDER BY dp.pick_number
      ) FILTER (WHERE dp.id IS NOT NULL) as picks,
      json_agg(
        DISTINCT jsonb_build_object(
          'roster_id', r.id,
          'user_id', r.user_id,
          'team_name', r.team_name,
          'username', u.username,
          'budget_remaining', r.auction_budget
        )
      ) FILTER (WHERE r.id IS NOT NULL) as rosters
    FROM drafts d
    LEFT JOIN draft_picks dp ON d.id = dp.draft_id
    LEFT JOIN players p ON dp.player_id = p.id
    LEFT JOIN rosters r ON d.league_id = r.league_id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE d.id = $1
    GROUP BY d.id
  `;

  const result = await pool.query(query, [draftId]);
  const draftState = result.rows[0];

  // Cache for 5 seconds (balance between performance and real-time updates)
  await setCache(cacheKey, draftState, 5);

  return draftState;
}
```

---

# TRACK 5: Documentation (Priority: MEDIUM)
**Estimated Time:** 3-5 days
**Dependencies:** None
**Can run in parallel with:** All other tracks

## Task 5.1: API Documentation with Swagger

**Install Swagger:**

```bash
npm install swagger-jsdoc swagger-ui-express @types/swagger-jsdoc @types/swagger-ui-express
```

**File:** `backend/src/config/swagger.ts` (NEW FILE)

```typescript
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TBD Fantasy Football API",
      version: "1.0.0",
      description: "API documentation for TBD Fantasy Football platform",
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("Swagger docs available at /api-docs");
}
```

**Update index.ts:**

```typescript
import { setupSwagger } from "./config/swagger";

// After middleware setup
setupSwagger(app);
```

**Add JSDoc comments to routes:**

**File:** `backend/src/controllers/authController.ts`

```typescript
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       400:
 *         description: Validation error
 */
export async function register(req: Request, res: Response) {
  // ... existing code
}
```

---

## Task 5.2: Architecture Documentation

**File:** `ARCHITECTURE.md` (NEW FILE)

Create comprehensive architecture documentation covering:
- System overview
- Component diagram
- Data flow
- Authentication flow
- Draft system architecture
- Waiver processing flow
- Real-time communication (WebSockets)
- Database schema

---

## Task 5.3: Developer Setup Guide

**File:** `DEVELOPER_SETUP.md` (NEW FILE)

Detailed setup instructions for new developers.

---

# TRACK 6: Token Management & Sessions (Priority: MEDIUM)
**Estimated Time:** 2-3 days
**Dependencies:** Task 1.1 (JWT fixes)
**Can run in parallel with:** All tracks except Track 1

## Task 6.1: Implement Refresh Token

**File:** `backend/src/utils/jwt.ts`

Add refresh token functions:

```typescript
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function generateTokenPair(payload: JwtPayload) {
  return {
    accessToken: generateToken(payload), // 1 hour
    refreshToken: generateRefreshToken(payload), // 7 days
  };
}
```

**File:** `backend/migrations/028_add_refresh_tokens.sql` (NEW FILE)

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

---

## Task 6.2: Token Revocation on Logout

**File:** `backend/src/controllers/authController.ts`

```typescript
export async function logout(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const refreshToken = req.body.refreshToken;

    if (refreshToken) {
      await pool.query(
        "UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token = $1",
        [refreshToken]
      );
    }

    // Invalidate all sessions for user if requested
    if (req.body.allDevices) {
      await pool.query(
        "UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE user_id = $1",
        [userId]
      );
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
}
```

---

# TRACK 7: Monitoring & Observability (Priority: LOW-MEDIUM)
**Estimated Time:** 3-5 days
**Dependencies:** None
**Can run in parallel with:** All other tracks

## Task 7.1: Error Tracking with Sentry

**Install Sentry:**

```bash
npm install @sentry/node @sentry/tracing
```

**File:** `backend/src/config/sentry.ts` (NEW FILE)

```typescript
import * as Sentry from "@sentry/node";
import { Express } from "express";

export function initializeSentry(app: Express): void {
  if (!process.env.SENTRY_DSN) {
    console.warn("SENTRY_DSN not configured. Error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });

  // Request handler must be first
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

export function sentryErrorHandler(): any {
  return Sentry.Handlers.errorHandler();
}
```

---

# TRACK 8: Flutter App Improvements (Priority: LOW)
**Estimated Time:** 1 week
**Dependencies:** None
**Can run in parallel with:** All other tracks

## Task 8.1: Add Error Boundaries

**File:** `frontend/lib/utils/error_handler.dart` (NEW FILE)

```dart
import 'package:flutter/material.dart';

class ErrorBoundary extends StatefulWidget {
  final Widget child;
  final Widget Function(Object error)? errorBuilder;

  const ErrorBoundary({
    Key? key,
    required this.child,
    this.errorBuilder,
  }) : super(key: key);

  @override
  _ErrorBoundaryState createState() => _ErrorBoundaryState();
}

class _ErrorBoundaryState extends State<ErrorBoundary> {
  Object? error;

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      if (widget.errorBuilder != null) {
        return widget.errorBuilder!(error!);
      }
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red),
            SizedBox(height: 16),
            Text('Something went wrong'),
            SizedBox(height: 8),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  error = null;
                });
              },
              child: Text('Retry'),
            ),
          ],
        ),
      );
    }

    return widget.child;
  }
}
```

---

# Task Summary Matrix

| Track | Priority | Time | Can Start Immediately | Blocking Others |
|-------|----------|------|----------------------|-----------------|
| Track 1: Critical Security | CRITICAL | 3-5 days | YES | Blocks production |
| Track 2: Input Validation | HIGH | 2-3 days | After Task 1.4 | No |
| Track 3: Testing | HIGH | 1-2 weeks | YES | No |
| Track 4: Performance | MEDIUM | 1 week | After Task 1.8 | No |
| Track 5: Documentation | MEDIUM | 3-5 days | YES | No |
| Track 6: Token Management | MEDIUM | 2-3 days | After Task 1.1 | No |
| Track 7: Monitoring | LOW-MEDIUM | 3-5 days | YES | No |
| Track 8: Flutter | LOW | 1 week | YES | No |

---

# Parallel Execution Strategy

## Week 1: Critical Path
- **Developer 1:** Track 1 (Tasks 1.1-1.4) - Critical security fixes
- **Developer 2:** Track 3 (Task 3.1) - Test infrastructure setup
- **Developer 3:** Track 5 (Task 5.1) - API documentation

## Week 2: Parallel Expansion
- **Developer 1:** Track 1 (Tasks 1.5-1.8) - Complete critical fixes
- **Developer 2:** Track 3 (Tasks 3.2-3.3) - Write tests
- **Developer 3:** Track 2 (Tasks 2.1-2.3) - Input validation
- **Developer 4:** Track 4 (Tasks 4.1-4.2) - Caching setup

## Week 3: Breadth
- **Developer 1:** Track 6 - Token management
- **Developer 2:** Track 3 (Tasks 3.4-3.5) - Complete testing
- **Developer 3:** Track 2 (Tasks 2.4-2.5) - Complete validation
- **Developer 4:** Track 4 (Tasks 4.3-4.5) - Performance optimization

## Week 4: Polish
- **Developer 1:** Track 7 - Monitoring
- **Developer 2:** Track 8 - Flutter improvements
- **Developer 3:** Track 5 (Tasks 5.2-5.3) - Complete documentation
- **Developer 4:** Integration testing and bug fixes

---

# Testing After Each Track

After completing each track, run these verification steps:

## After Track 1 (Security):
```bash
# Verify JWT secret enforcement
unset JWT_SECRET
npm start  # Should fail with clear error

# Verify CORS
curl -H "Origin: http://evil.com" http://localhost:5000/api/users
# Should return CORS error

# Run security audit
npm audit
```

## After Track 2 (Validation):
```bash
# Test invalid inputs
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"a","email":"bad","password":"weak"}'
# Should return validation errors
```

## After Track 3 (Testing):
```bash
npm test
npm run test:coverage
# Coverage should be >60% for critical paths
```

## After Track 4 (Performance):
```bash
# Load testing
npm install -g artillery
artillery quick --count 100 --num 10 http://localhost:5000/api/players

# Check query performance
psql -c "EXPLAIN ANALYZE SELECT * FROM rosters WHERE league_id = 1"
```

---

# Environment Variables Checklist

Ensure these are set before deploying:

```bash
# Required
JWT_SECRET=<32+ character random string>
ALLOWED_ORIGINS=<comma-separated-urls>
DATABASE_URL=<postgres-connection-string>
NODE_ENV=production

# Optional but recommended
REDIS_URL=<redis-connection-string>
SENTRY_DSN=<sentry-project-dsn>
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

# Success Criteria

Before marking tracks as complete:

### Track 1 (Critical Security):
- [ ] Server fails to start without JWT_SECRET
- [ ] CORS rejects unauthorized origins
- [ ] No sensitive data in logs
- [ ] Authorization checks prevent unauthorized access
- [ ] Database indexes improve query performance by 50%+
- [ ] Waiver race conditions eliminated

### Track 2 (Validation):
- [ ] All inputs validated before processing
- [ ] Clear error messages for validation failures
- [ ] Socket events validated
- [ ] No SQL injection possible

### Track 3 (Testing):
- [ ] >60% code coverage on backend
- [ ] All critical paths tested
- [ ] Widget tests pass for Flutter
- [ ] CI/CD runs tests automatically

### Track 4 (Performance):
- [ ] Redis caching reduces DB queries by 40%+
- [ ] N+1 queries eliminated
- [ ] Pagination implemented on all lists
- [ ] API response times <200ms for 95th percentile

### Track 5 (Documentation):
- [ ] Swagger docs accessible at /api-docs
- [ ] Architecture document complete
- [ ] Setup guide allows new dev to start in <30 min

### Track 6 (Tokens):
- [ ] Refresh tokens work
- [ ] Logout revokes tokens
- [ ] Expired tokens rejected

### Track 7 (Monitoring):
- [ ] Errors tracked in Sentry
- [ ] Health check endpoint works
- [ ] Metrics dashboard accessible

### Track 8 (Flutter):
- [ ] Error boundaries prevent crashes
- [ ] Network errors handled gracefully
- [ ] Widget tests pass
