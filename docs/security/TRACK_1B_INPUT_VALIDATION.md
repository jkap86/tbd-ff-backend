# Track 1B: Input Validation Core

**Assigned to:** Sonnet B
**Priority:** CRITICAL
**Estimated Time:** 3-4 hours
**Dependencies:** Track 1A Task 1A.1 (JWT fix) should be done first
**Parallel with:** Tracks 1A, 1C, 1D

## Overview

You will implement comprehensive input validation for authentication endpoints using express-validator. This prevents weak passwords, invalid emails, SQL injection attempts, and other malicious input from entering the system.

---

## Task 1B.1: Create Authentication Validators

**Objective:** Create validation rules for registration, login, and password reset endpoints.

### Step 1: Create Validator File

**File to create:** `backend/src/validators/authValidator.ts`

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

### Step 2: Create Validation Middleware

**File to create:** `backend/src/middleware/validationMiddleware.ts`

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

---

## Task 1B.2: Update Auth Routes with Validation

**Objective:** Apply validation middleware to authentication routes.

**File to modify:** `backend/src/routes/authRoutes.ts`

### Update imports at top of file:

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
```

### Update routes to include validation:

```typescript
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

---

## Task 1B.3: Update Auth Controller

**Objective:** Remove redundant validation from controller since it's now in validators.

**File to modify:** `backend/src/controllers/authController.ts`

### Update imports:
```typescript
import {
  registerValidator,
  loginValidator,
  resetRequestValidator,
  resetPasswordValidator,
} from "../validators/authValidator";
import { handleValidationErrors } from "../middleware/validationMiddleware";
```

### In the `register` function (around lines 27-43):

**Find this validation code:**
```typescript
// Validate input
if (!username || !email || !password) {
  return res.status(400).json({
    success: false,
    message: "Username, email, and password are required",
  });
}

if (password.length < 6) {
  return res.status(400).json({
    success: false,
    message: "Password must be at least 6 characters long",
  });
}
```

**REMOVE it** - validation now happens in middleware

### In the `requestPasswordReset` function (around lines 185-192):

**Find this validation:**
```typescript
// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return res.status(400).json({
    success: false,
    message: "Invalid email format",
  });
}
```

**REMOVE it** - validation now happens in middleware

---

## Testing

### Test 1: Registration with Weak Password

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "weak"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "message": "Password must be between 8 and 128 characters"
    }
  ]
}
```

### Test 2: Registration with Invalid Email

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "not-an-email",
    "password": "StrongPass123"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Must be a valid email address"
    }
  ]
}
```

### Test 3: Registration with Short Username

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ab",
    "email": "test@example.com",
    "password": "StrongPass123"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "Username must be between 3 and 30 characters"
    }
  ]
}
```

### Test 4: Registration with Reserved Username

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "test@example.com",
    "password": "StrongPass123"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "This username is reserved"
    }
  ]
}
```

### Test 5: Registration with Password Missing Requirements

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "alllowercase123"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "message": "Password must contain at least one lowercase letter, one uppercase letter, and one number"
    }
  ]
}
```

### Test 6: Valid Registration

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "validuser",
    "email": "valid@example.com",
    "password": "StrongPass123"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": 1,
      "username": "validuser",
      "email": "valid@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Test 7: Login with Empty Fields

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "",
    "password": ""
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "Username is required"
    },
    {
      "field": "password",
      "message": "Password is required"
    }
  ]
}
```

### Test 8: Password Reset with Invalid Email

```bash
curl -X POST http://localhost:5000/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Must be a valid email address"
    }
  ]
}
```

### Test 9: Multiple Validation Errors

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "a",
    "email": "bad",
    "password": "weak"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "Username must be between 3 and 30 characters"
    },
    {
      "field": "email",
      "message": "Must be a valid email address"
    },
    {
      "field": "password",
      "message": "Password must be between 8 and 128 characters"
    }
  ]
}
```

---

## Automated Testing Script

Create this script to run all tests quickly:

**File to create:** `backend/test-validation.sh`

```bash
#!/bin/bash

echo "Testing Input Validation..."
echo ""

BASE_URL="http://localhost:5000"

echo "Test 1: Weak password"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"weak"}' \
  | jq .

echo ""
echo "Test 2: Invalid email"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"not-email","password":"Strong123"}' \
  | jq .

echo ""
echo "Test 3: Short username"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"ab","email":"test@example.com","password":"Strong123"}' \
  | jq .

echo ""
echo "Test 4: Reserved username"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"test@example.com","password":"Strong123"}' \
  | jq .

echo ""
echo "Test 5: Valid registration (should succeed)"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"validuser","email":"valid@example.com","password":"Strong123"}' \
  | jq .

echo ""
echo "All tests complete!"
```

Make it executable:
```bash
chmod +x backend/test-validation.sh
```

Run tests:
```bash
# Make sure server is running first
npm start

# In another terminal:
cd backend
./test-validation.sh
```

---

## Success Criteria

Before marking Track 1B as complete, verify:

- [ ] **Validator files created:**
  - `backend/src/validators/authValidator.ts`
  - `backend/src/middleware/validationMiddleware.ts`

- [ ] **Routes updated:**
  - `backend/src/routes/authRoutes.ts` uses validation middleware

- [ ] **Controller cleaned up:**
  - Redundant validation removed from `authController.ts`

- [ ] **Password validation:**
  - Minimum 8 characters enforced
  - Must contain uppercase, lowercase, and number
  - Cannot be all same character

- [ ] **Username validation:**
  - 3-30 characters enforced
  - Only alphanumeric, underscore, hyphen allowed
  - Reserved names rejected

- [ ] **Email validation:**
  - Valid email format enforced
  - Normalized before storage

- [ ] **All 9 manual tests pass**
- [ ] **Automated test script runs successfully**

---

## Common Issues & Solutions

### Issue: express-validator not found
```bash
npm install express-validator
```

### Issue: Validation not triggering
**Solution:** Make sure middleware is in correct order:
```typescript
router.post(
  "/register",
  registerValidator,      // 1. Validate first
  handleValidationErrors, // 2. Check for errors
  register               // 3. Then controller
);
```

### Issue: Validation errors not formatted correctly
**Solution:** Check `validationMiddleware.ts` uses correct error format:
```typescript
const formattedErrors = errors.array().map((error) => ({
  field: error.type === 'field' ? error.path : 'unknown',
  message: error.msg,
}));
```

### Issue: Tests fail with CORS errors
**Solution:** Wait for Track 1A to complete CORS configuration

---

## Dependencies

### Required before starting:
- Track 1A Task 1A.1 (JWT fix) - needed for server to start

### Required packages:
```bash
npm install express-validator
```

---

## Files Modified

Track 1B modifies/creates these files:

**Created:**
- `backend/src/validators/authValidator.ts`
- `backend/src/middleware/validationMiddleware.ts`
- `backend/test-validation.sh`

**Modified:**
- `backend/src/routes/authRoutes.ts`
- `backend/src/controllers/authController.ts`

---

## Handoff Notes

When complete, provide:

1. **Confirmation:**
   ```
   Track 1B Complete:
   - Validators created: ✓
   - Routes updated: ✓
   - Controller cleaned: ✓
   - All tests passing: ✓
   ```

2. **Test results:** Share output from automated test script

3. **Any edge cases found** during testing

4. **Files modified** (list above)

---

## Time Estimate

- Task 1B.1 (Create validators): 60-90 minutes
- Task 1B.2 (Update routes): 30 minutes
- Task 1B.3 (Update controller): 30 minutes
- Testing: 45-60 minutes
- **Total: 3-4 hours**

Good luck! 🚀
