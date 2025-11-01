# Track 1A: Configuration & Environment Security

**Assigned to:** Sonnet A
**Priority:** CRITICAL
**Estimated Time:** 2-3 hours
**Dependencies:** None - can start immediately
**Parallel with:** Tracks 1B, 1C, 1D

## Overview

You will fix critical configuration security issues related to JWT secrets, CORS, and logging. These are foundational security fixes that must be completed before production deployment.

---

## Task 1A.1: Fix JWT Secret Configuration

**Objective:** Enforce JWT_SECRET as a required environment variable and validate its strength.

**File to modify:** `backend/src/utils/jwt.ts`

### Current Code (Lines 1-3):
```typescript
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
```

### Replace with:
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

### Generate Strong Secret for Testing:
```bash
# Run this command and add result to .env file
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

### Testing Steps:
1. **Test 1:** Remove `JWT_SECRET` from `.env` and run server
   ```bash
   # In .env, comment out or remove JWT_SECRET line
   npm start
   ```
   **Expected:** Server fails to start with error message about missing JWT_SECRET

2. **Test 2:** Set weak secret (< 32 chars)
   ```bash
   # In .env, set:
   JWT_SECRET=weak
   npm start
   ```
   **Expected:** Server fails to start with error about secret length

3. **Test 3:** Set strong secret
   ```bash
   # In .env, set a 32+ character secret
   JWT_SECRET=<your-generated-secret>
   npm start
   ```
   **Expected:** Server starts successfully

### Success Criteria:
- [ ] Server fails to start without JWT_SECRET
- [ ] Server fails to start with weak secret
- [ ] Server starts with strong secret
- [ ] Clear error messages guide user to fix

---

## Task 1A.2: Fix CORS Configuration

**Objective:** Enforce allowed origins and prevent wildcard CORS in production.

**File to modify:** `backend/src/index.ts`

### Find this code (around lines 44-47 and 65):
```typescript
// In Socket.io setup:
cors: {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST"],
}

// Later in file:
app.use(cors()); // Enables CORS for all origins
```

### Replace both sections with this (add near top of file after imports):

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

// Apply to Express (replace existing app.use(cors()) line)
app.use(cors(corsOptions));
```

### Update Socket.io configuration (around line 44):
```typescript
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
```

### Update .env.example file:

**File to create/modify:** `backend/.env.example`

Add this section:
```bash
# CORS Configuration - REQUIRED for production
# Comma-separated list of allowed origins (no trailing slashes)
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com
```

### Testing Steps:

1. **Test 1:** Start without ALLOWED_ORIGINS in development
   ```bash
   # In .env, remove ALLOWED_ORIGINS
   NODE_ENV=development
   npm start
   ```
   **Expected:** Server starts with warning, defaults to localhost:3000

2. **Test 2:** Try production without ALLOWED_ORIGINS
   ```bash
   # In .env:
   NODE_ENV=production
   # No ALLOWED_ORIGINS set
   npm start
   ```
   **Expected:** Server fails to start with clear error

3. **Test 3:** Test CORS with allowed origin
   ```bash
   # In .env:
   ALLOWED_ORIGINS=http://localhost:3000
   npm start

   # Then make request from allowed origin
   curl -H "Origin: http://localhost:3000" http://localhost:5000/api/users
   ```
   **Expected:** Request succeeds, response includes CORS headers

4. **Test 4:** Test CORS with disallowed origin
   ```bash
   curl -H "Origin: http://evil.com" http://localhost:5000/api/users
   ```
   **Expected:** Request fails with CORS error

5. **Test 5:** Test Socket.io connection
   - Open browser console on allowed origin
   - Try to connect to WebSocket
   **Expected:** Connection succeeds

### Success Criteria:
- [ ] Production mode requires ALLOWED_ORIGINS
- [ ] Development mode has sensible defaults
- [ ] Invalid URLs in ALLOWED_ORIGINS cause startup failure
- [ ] Requests from allowed origins succeed
- [ ] Requests from disallowed origins fail
- [ ] Socket.io respects CORS settings

---

## Task 1A.3: Remove Sensitive Data from Logs

**Objective:** Create secure logging utility and remove sensitive data from logs.

### Step 1: Create Secure Logger

**File to create:** `backend/src/utils/logger.ts`

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
  "reset_token",
  "refresh_token",
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

### Step 2: Fix Email Service Logging

**File to modify:** `backend/src/services/emailService.ts`

**Find and REMOVE this line (around lines 152-153):**
```typescript
console.log("Reset Link:", resetLink); // Contains sensitive token
```

**Replace with:**
```typescript
import { logger } from "../utils/logger";

// In the password reset function, replace console.log with:
logger.info("Password reset email sent", {
  userId: user.id,
  emailPrefix: user.email.substring(0, 3) + "***",
  tokenLength: token.length,
  expiresAt: expiresAt.toISOString(),
});
```

### Step 3: Update Auth Controller Logging

**File to modify:** `backend/src/controllers/authController.ts`

**Add import at top:**
```typescript
import { logger } from "../utils/logger";
```

**Find all `console.log` statements and replace them:**

Example replacements:
```typescript
// OLD:
console.log("User registered:", user);

// NEW:
logger.info("User registered", {
  userId: user.id,
  username: user.username
});

// OLD:
console.log("Login attempt:", { username, password });

// NEW:
logger.info("Login attempt", { username }); // Don't log password!

// OLD:
console.error("Error during registration:", error);

// NEW:
logger.error("Registration failed", {
  message: error.message,
  username: req.body.username
});
```

### Step 4: Audit Other Files

**Search for sensitive logging:**

```bash
cd backend
# Find potential issues
grep -r "console.log.*token" src/
grep -r "console.log.*password" src/
grep -r "console.log.*secret" src/
```

**For each match found:**
1. Replace `console.log` with `logger.info`
2. Replace `console.error` with `logger.error`
3. Ensure sensitive data is not logged

### Testing Steps:

1. **Test 1:** Verify logger redacts sensitive data
   ```typescript
   // Add temporary test in a controller:
   import { logger } from "../utils/logger";

   logger.info("Test logging", {
     username: "testuser",
     password: "should-be-redacted",
     token: "should-also-be-redacted",
     email: "visible@example.com"
   });
   ```
   **Expected:** Log shows username and email, but password and token show "[REDACTED]"

2. **Test 2:** Trigger password reset
   ```bash
   curl -X POST http://localhost:5000/api/auth/request-password-reset \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```
   **Expected:** Logs show email sent but NOT the reset token

3. **Test 3:** Check logs for sensitive data
   ```bash
   # Search logs for tokens (should find none)
   grep -i "reset.*token.*http" logs/*
   ```
   **Expected:** No sensitive tokens in logs

### Success Criteria:
- [ ] Logger utility created and working
- [ ] Password reset tokens not logged
- [ ] Passwords never logged
- [ ] JWT tokens not logged
- [ ] Auth tokens redacted in logs
- [ ] All console.log replaced with logger in critical files

---

## Final Checklist for Track 1A

Before marking Track 1A as complete, verify:

- [ ] **Task 1A.1:** JWT secret enforcement working
  - Server fails without JWT_SECRET
  - Server fails with weak secret
  - Server starts with strong secret

- [ ] **Task 1A.2:** CORS properly configured
  - Production requires ALLOWED_ORIGINS
  - Allowed origins work
  - Disallowed origins blocked
  - Socket.io respects CORS

- [ ] **Task 1A.3:** Sensitive data removed from logs
  - Logger utility created
  - Reset tokens not logged
  - Passwords not logged
  - Auth tokens redacted

- [ ] **Environment Variables Set:**
  ```bash
  JWT_SECRET=<32+ char string>
  ALLOWED_ORIGINS=http://localhost:3000
  NODE_ENV=development
  ```

- [ ] **Server starts without errors**
- [ ] **All tests pass**

---

## Troubleshooting

### Issue: Server won't start after JWT changes
**Solution:** Make sure JWT_SECRET is set in .env with 32+ characters

### Issue: CORS errors in browser console
**Solution:**
1. Check ALLOWED_ORIGINS includes your frontend URL
2. Ensure no trailing slashes in origins
3. Check browser's origin matches exactly

### Issue: Logger not working
**Solution:**
1. Verify import path is correct: `import { logger } from "../utils/logger"`
2. Check file was created in correct location: `backend/src/utils/logger.ts`

---

## Communication with Other Tracks

**Dependencies on you:**
- Track 1B needs JWT_SECRET fix complete (Task 1A.1) before testing auth
- Track 6 (Token Management) builds on JWT_SECRET changes

**Dependencies on others:**
- None - you can complete all tasks independently

---

## Handoff Notes

When you complete Track 1A, provide:

1. **Confirmation message:**
   ```
   Track 1A Complete:
   - JWT_SECRET: ✓ Enforced and validated
   - CORS: ✓ Configured with required origins
   - Logging: ✓ Sensitive data redacted
   - Tests: ✓ All passing
   - Environment: JWT_SECRET and ALLOWED_ORIGINS set
   ```

2. **Generated JWT_SECRET** (share securely with team)

3. **Any issues encountered** and how you resolved them

4. **Files modified:**
   - backend/src/utils/jwt.ts
   - backend/src/index.ts
   - backend/src/utils/logger.ts (new)
   - backend/src/services/emailService.ts
   - backend/src/controllers/authController.ts
   - backend/.env.example

---

## Time Estimate Breakdown

- Task 1A.1 (JWT): 30-45 minutes
- Task 1A.2 (CORS): 45-60 minutes
- Task 1A.3 (Logging): 45-60 minutes
- Testing: 30 minutes
- **Total: 2-3 hours**

Good luck! 🚀
