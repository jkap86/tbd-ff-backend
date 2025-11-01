# Track 1D: Authorization & Access Control

**Assigned to:** Sonnet D
**Priority:** CRITICAL
**Estimated Time:** 3-4 hours
**Dependencies:** None - can start immediately
**Parallel with:** Tracks 1A, 1B, 1C

## Overview

You will implement authorization middleware to ensure users can only access and modify resources they own or have permission to access. Currently, the app only checks authentication (is user logged in?) but not authorization (does user have permission?). This is a critical security gap.

---

## Task 1D.1: Create Authorization Middleware

**Objective:** Create reusable middleware functions to check user permissions.

### Step 1: Create Authorization Middleware File

**File to create:** `backend/src/middleware/authorization.ts`

```typescript
import { Request, Response, NextFunction } from "express";
import { getLeagueById } from "../models/League";
import { getRosterById } from "../models/Roster";
import { getTradeById } from "../models/Trade";
import { pool } from "../config/database";

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

    if (!leagueId || isNaN(leagueId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid league ID",
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

    // User is commissioner, proceed
    next();
  } catch (error: any) {
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

    if (!leagueId || isNaN(leagueId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
    }

    // Check if user has a roster in this league
    const query = `
      SELECT COUNT(*) as count
      FROM rosters
      WHERE league_id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [leagueId, userId]);
    const isMember = parseInt(result.rows[0].count) > 0;

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this league",
      });
    }

    // User is member, proceed
    next();
  } catch (error: any) {
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

    if (!rosterId || isNaN(rosterId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID",
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

    // User owns roster, proceed
    next();
  } catch (error: any) {
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

    if (!tradeId || isNaN(tradeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trade ID",
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

    // User is participant, proceed
    next();
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}

/**
 * Check if user is commissioner OR owner of the roster
 * Useful for operations that either role can perform
 */
export async function requireCommissionerOrRosterOwner(
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

    if (!rosterId || isNaN(rosterId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID",
      });
    }

    const roster = await getRosterById(rosterId);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found",
      });
    }

    // Check if user owns the roster
    if (roster.user_id === userId) {
      return next();
    }

    // Check if user is league commissioner
    const league = await getLeagueById(roster.league_id);
    if (league && league.commissioner_id === userId) {
      return next();
    }

    // User is neither owner nor commissioner
    return res.status(403).json({
      success: false,
      message: "You must be the roster owner or league commissioner",
    });
  } catch (error: any) {
    console.error("Authorization error:", error);
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}
```

---

## Task 1D.2: Apply Authorization to League Routes

**Objective:** Protect league endpoints so only authorized users can access them.

**File to modify:** `backend/src/routes/leagueRoutes.ts`

### Add import at top:
```typescript
import {
  requireCommissioner,
  requireLeagueMember,
} from "../middleware/authorization";
```

### Update routes with authorization middleware:

```typescript
// Existing imports...
import { Router } from "express";
import {
  createLeague,
  getLeagueById,
  updateLeagueSettings,
  joinLeague,
  getLeagueRosters,
  getLeagueStandings,
  startDraft,
  deleteLeague,
} from "../controllers/leagueController";
import { authenticate } from "../middleware/auth";
import {
  requireCommissioner,
  requireLeagueMember,
} from "../middleware/authorization";

const router = Router();

// Public/authenticated routes (no league-specific authorization)
router.post("/", authenticate, createLeague);
router.post("/join", authenticate, joinLeague);

// League member routes (must be in the league)
router.get(
  "/:leagueId",
  authenticate,
  requireLeagueMember,
  getLeagueById
);

router.get(
  "/:leagueId/rosters",
  authenticate,
  requireLeagueMember,
  getLeagueRosters
);

router.get(
  "/:leagueId/standings",
  authenticate,
  requireLeagueMember,
  getLeagueStandings
);

// Commissioner-only routes
router.put(
  "/:leagueId/settings",
  authenticate,
  requireCommissioner,
  updateLeagueSettings
);

router.post(
  "/:leagueId/start-draft",
  authenticate,
  requireCommissioner,
  startDraft
);

router.delete(
  "/:leagueId",
  authenticate,
  requireCommissioner,
  deleteLeague
);

export default router;
```

---

## Task 1D.3: Apply Authorization to Roster Routes

**Objective:** Protect roster endpoints so users can only modify their own rosters.

**File to modify:** `backend/src/routes/rosterRoutes.ts`

### Add import:
```typescript
import {
  requireRosterOwnership,
  requireLeagueMember,
} from "../middleware/authorization";
```

### Update routes:

```typescript
import { Router } from "express";
import {
  getRosterById,
  updateRosterName,
  setStarters,
  addPlayer,
  dropPlayer,
  getRosterPlayers,
} from "../controllers/rosterController";
import { authenticate } from "../middleware/auth";
import {
  requireRosterOwnership,
  requireLeagueMember,
} from "../middleware/authorization";

const router = Router();

// View roster (any league member can view)
router.get(
  "/:rosterId",
  authenticate,
  // Note: Would need to add requireLeagueMember check based on roster's league
  getRosterById
);

router.get(
  "/:rosterId/players",
  authenticate,
  getRosterPlayers
);

// Modify roster (only owner)
router.put(
  "/:rosterId/name",
  authenticate,
  requireRosterOwnership,
  updateRosterName
);

router.put(
  "/:rosterId/starters",
  authenticate,
  requireRosterOwnership,
  setStarters
);

router.post(
  "/:rosterId/add-player",
  authenticate,
  requireRosterOwnership,
  addPlayer
);

router.post(
  "/:rosterId/drop-player",
  authenticate,
  requireRosterOwnership,
  dropPlayer
);

export default router;
```

---

## Task 1D.4: Apply Authorization to Trade Routes

**Objective:** Ensure only trade participants can accept/reject trades.

**File to modify:** `backend/src/routes/tradeRoutes.ts`

### Add import:
```typescript
import {
  requireTradeParticipant,
  requireLeagueMember,
} from "../middleware/authorization";
```

### Update routes:

```typescript
import { Router } from "express";
import {
  proposeTrade,
  getTradeById,
  acceptTrade,
  rejectTrade,
  getLeagueTrades,
  cancelTrade,
} from "../controllers/tradeController";
import { authenticate } from "../middleware/auth";
import {
  requireTradeParticipant,
  requireLeagueMember,
} from "../middleware/authorization";

const router = Router();

// Propose trade (any authenticated user with roster)
router.post("/", authenticate, proposeTrade);

// View league trades (league members only)
router.get(
  "/league/:leagueId",
  authenticate,
  requireLeagueMember,
  getLeagueTrades
);

// View specific trade (participants only)
router.get(
  "/:tradeId",
  authenticate,
  requireTradeParticipant,
  getTradeById
);

// Accept/reject trade (participants only)
router.post(
  "/:tradeId/accept",
  authenticate,
  requireTradeParticipant,
  acceptTrade
);

router.post(
  "/:tradeId/reject",
  authenticate,
  requireTradeParticipant,
  rejectTrade
);

router.delete(
  "/:tradeId",
  authenticate,
  requireTradeParticipant,
  cancelTrade
);

export default router;
```

---

## Task 1D.5: Apply Authorization to Waiver Routes

**Objective:** Ensure users can only submit/cancel waiver claims for their own rosters.

**File to modify:** `backend/src/routes/waiverRoutes.ts`

### Add import:
```typescript
import { requireRosterOwnership } from "../middleware/authorization";
```

### Update routes:

```typescript
import { Router } from "express";
import {
  submitWaiverClaim,
  cancelWaiverClaim,
  getWaiverClaimsByRoster,
  getWaiverClaimsByLeague,
} from "../controllers/waiverController";
import { authenticate } from "../middleware/auth";
import { requireRosterOwnership } from "../middleware/authorization";

const router = Router();

// Submit waiver claim (must own roster)
router.post(
  "/",
  authenticate,
  // Note: Need to validate rosterId in body
  submitWaiverClaim
);

// Cancel waiver claim (must own roster)
router.delete(
  "/:claimId",
  authenticate,
  // Note: Need to check ownership in controller or add middleware
  cancelWaiverClaim
);

// View claims by roster (must own roster)
router.get(
  "/roster/:rosterId",
  authenticate,
  requireRosterOwnership,
  getWaiverClaimsByRoster
);

// View claims by league (must be league member)
router.get(
  "/league/:leagueId",
  authenticate,
  // Note: Would need requireLeagueMember
  getWaiverClaimsByLeague
);

export default router;
```

---

## Testing

### Test Setup

Create test data:
```sql
-- Test users
INSERT INTO users (username, email, password) VALUES
  ('commissioner', 'commissioner@test.com', 'hashed_password_1'),
  ('member1', 'member1@test.com', 'hashed_password_2'),
  ('outsider', 'outsider@test.com', 'hashed_password_3');

-- Test league (commissioner_id = 1)
INSERT INTO leagues (name, commissioner_id, type, size, scoring_type)
VALUES ('Test League', 1, 'redraft', 10, 'ppr');

-- Test rosters
INSERT INTO rosters (league_id, user_id, team_name) VALUES
  (1, 1, 'Commissioner Team'),
  (1, 2, 'Member Team');
```

### Test 1: Commissioner-Only Actions

**Test 1.1:** Commissioner can modify league settings
```bash
# Login as commissioner (user ID 1)
TOKEN_COMM=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"commissioner","password":"password"}' \
  | jq -r .data.token)

# Try to update league settings (should succeed)
curl -X PUT http://localhost:5000/api/leagues/1/settings \
  -H "Authorization: Bearer $TOKEN_COMM" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"trade_deadline_week":10}}'
```

**Expected:** 200 OK, settings updated

**Test 1.2:** Non-commissioner cannot modify league settings
```bash
# Login as member (user ID 2)
TOKEN_MEMBER=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"member1","password":"password"}' \
  | jq -r .data.token)

# Try to update league settings (should fail)
curl -X PUT http://localhost:5000/api/leagues/1/settings \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"trade_deadline_week":10}}'
```

**Expected:** 403 Forbidden
```json
{
  "success": false,
  "message": "Only the league commissioner can perform this action"
}
```

### Test 2: League Membership

**Test 2.1:** League member can view league
```bash
curl http://localhost:5000/api/leagues/1 \
  -H "Authorization: Bearer $TOKEN_MEMBER"
```

**Expected:** 200 OK, league data returned

**Test 2.2:** Non-member cannot view league
```bash
# Login as outsider (user ID 3)
TOKEN_OUTSIDER=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"outsider","password":"password"}' \
  | jq -r .data.token)

# Try to view league (should fail)
curl http://localhost:5000/api/leagues/1 \
  -H "Authorization: Bearer $TOKEN_OUTSIDER"
```

**Expected:** 403 Forbidden
```json
{
  "success": false,
  "message": "You are not a member of this league"
}
```

### Test 3: Roster Ownership

**Test 3.1:** Owner can modify their roster
```bash
# Member modifies their own roster (roster ID 2)
curl -X PUT http://localhost:5000/api/rosters/2/starters \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  -H "Content-Type: application/json" \
  -d '{"starters":[1,2,3,4,5]}'
```

**Expected:** 200 OK, starters updated

**Test 3.2:** User cannot modify another user's roster
```bash
# Member tries to modify commissioner's roster (roster ID 1)
curl -X PUT http://localhost:5000/api/rosters/1/starters \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  -H "Content-Type: application/json" \
  -d '{"starters":[1,2,3,4,5]}'
```

**Expected:** 403 Forbidden
```json
{
  "success": false,
  "message": "You do not own this roster"
}
```

### Test 4: Without Authentication

**Test 4.1:** Unauthenticated request fails
```bash
curl http://localhost:5000/api/leagues/1
```

**Expected:** 401 Unauthorized

### Test 5: Invalid IDs

**Test 5.1:** Invalid league ID
```bash
curl http://localhost:5000/api/leagues/99999 \
  -H "Authorization: Bearer $TOKEN_MEMBER"
```

**Expected:** 404 Not Found

**Test 5.2:** Non-numeric ID
```bash
curl http://localhost:5000/api/leagues/abc \
  -H "Authorization: Bearer $TOKEN_MEMBER"
```

**Expected:** 400 Bad Request

---

## Automated Test Script

**File to create:** `backend/test-authorization.sh`

```bash
#!/bin/bash

echo "Testing Authorization..."
echo ""

BASE_URL="http://localhost:5000"

# Login as different users
echo "Logging in test users..."
TOKEN_COMM=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"commissioner","password":"TestPass123"}' \
  | jq -r .data.token)

TOKEN_MEMBER=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"member1","password":"TestPass123"}' \
  | jq -r .data.token)

echo "Tokens acquired"
echo ""

echo "Test 1: Commissioner can modify league settings"
curl -s -X PUT $BASE_URL/api/leagues/1/settings \
  -H "Authorization: Bearer $TOKEN_COMM" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"trade_deadline_week":10}}' \
  | jq .
echo ""

echo "Test 2: Non-commissioner CANNOT modify league settings"
curl -s -X PUT $BASE_URL/api/leagues/1/settings \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"trade_deadline_week":10}}' \
  | jq .
echo ""

echo "Test 3: Member can view league"
curl -s $BASE_URL/api/leagues/1 \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  | jq '.success'
echo ""

echo "Test 4: Unauthenticated cannot view league"
curl -s $BASE_URL/api/leagues/1 | jq .
echo ""

echo "All tests complete!"
```

Make executable and run:
```bash
chmod +x backend/test-authorization.sh
./backend/test-authorization.sh
```

---

## Success Criteria

Before marking Track 1D as complete:

- [ ] **Authorization middleware created**
  - `requireCommissioner` works
  - `requireLeagueMember` works
  - `requireRosterOwnership` works
  - `requireTradeParticipant` works

- [ ] **League routes protected**
  - Settings require commissioner
  - Draft start requires commissioner
  - League view requires membership

- [ ] **Roster routes protected**
  - Modifications require ownership
  - Views work for all league members

- [ ] **Trade routes protected**
  - Only participants can accept/reject

- [ ] **All tests pass:**
  - Commissioner tests
  - Member tests
  - Ownership tests
  - Negative tests (unauthorized access)

- [ ] **Error messages clear and helpful**
- [ ] **No 500 errors from authorization checks**

---

## Common Issues & Solutions

### Issue: "req.user is undefined"
**Solution:** Make sure `authenticate` middleware runs before authorization middleware:
```typescript
router.get("/:leagueId",
  authenticate,        // Must be first
  requireLeagueMember, // Then authorization
  getLeagueById
);
```

### Issue: Authorization always fails
**Solution:** Check that JWT token includes user ID:
```typescript
// In jwt.ts, make sure payload includes:
const payload = {
  id: user.id,
  username: user.username
};
```

### Issue: 500 errors in authorization
**Solution:** Check database connections and that models (League, Roster, Trade) export correct functions

---

## Dependencies

### Required before starting:
- Authentication middleware working
- Database models (League, Roster, Trade) exist and work

### Required packages:
- None (uses existing packages)

---

## Files Modified

**Created:**
- `backend/src/middleware/authorization.ts`
- `backend/test-authorization.sh`

**Modified:**
- `backend/src/routes/leagueRoutes.ts`
- `backend/src/routes/rosterRoutes.ts`
- `backend/src/routes/tradeRoutes.ts`
- `backend/src/routes/waiverRoutes.ts`

---

## Handoff Notes

When complete, provide:

1. **Confirmation:**
   ```
   Track 1D Complete:
   - Authorization middleware: ✓ Created
   - League routes: ✓ Protected
   - Roster routes: ✓ Protected
   - Trade routes: ✓ Protected
   - Waiver routes: ✓ Protected
   - Tests: ✓ All passing
   ```

2. **Test results** from automated script

3. **List of all protected endpoints**

4. **Any edge cases** discovered

---

## Time Estimate

- Task 1D.1 (Create middleware): 60-90 minutes
- Task 1D.2 (League routes): 30 minutes
- Task 1D.3 (Roster routes): 30 minutes
- Task 1D.4 (Trade routes): 20 minutes
- Task 1D.5 (Waiver routes): 20 minutes
- Testing: 45-60 minutes
- **Total: 3-4 hours**

Good luck! 🚀
