# TBD Fantasy Football - Codebase Exploration Summary

## Executive Summary
Full-stack fantasy football platform: Flutter frontend + Node.js/Express backend
Separate git repos in backend/ and flutter_app/

---

## 1. App Structure

### Flutter (flutter_app/)
- lib/main.dart - Entry point
- lib/config/app_router.dart - GoRouter (PRIMARY ROUTING)
- lib/providers/ - State (AuthProvider, LeagueProvider, InviteProvider, etc.)
- lib/services/ - API clients
- lib/screens/ - UI
- android/AndroidManifest.xml - Android deep linking
- ios/Info.plist - iOS deep linking
- web/_redirects - Netlify SPA routing

Key packages: go_router, provider, app_links, socket_io_client, firebase_messaging

### Backend (backend/src/)
- controllers/ - Request handlers
- routes/ - Route definitions
- models/ - Database models
- middleware/ - Auth, authorization, rate limiting
- services/ - Business logic
- socket/ - WebSocket handlers

Key packages: express, pg, jsonwebtoken, bcrypt, socket.io

---

## 2. Authentication

### Flow:
1. User registers/logs in via Flutter UI
2. AuthService POSTs to backend (/api/auth/login or /api/auth/register)
3. Backend validates, returns JWT token
4. AuthProvider stores token in flutter_secure_storage
5. GoRouter redirects to /home

### JWT:
- Header: Authorization: Bearer <token>
- Middleware: authenticate() verifies & attaches req.user
- Payload: { userId, username, email, isAdmin }

---

## 3. League Joining

### Two Ways:

**Public Leagues:**
- GET /api/leagues/public (browse)
- POST /api/leagues/:leagueId/join (direct join)

**Private Leagues (Invite Only):**
- POST /api/invites/send (commissioner sends)
- GET /api/invites/user/:userId (view pending)
- POST /api/invites/:inviteId/accept (accept invite)

### Frontend:
- join_league_screen.dart has 2 tabs
- Tab 1: Public leagues
- Tab 2: My invites

### Backend Logic (joinLeagueHandler):
1. Validate leagueId
2. Get userId from JWT
3. Check league exists, not full, user not already in
4. Create roster with next roster_id
5. Return roster + league

### Database:
- rosters: UNIQUE(league_id, user_id)
- league_invites: UNIQUE(league_id, invited_user_id)

---

## 4. Flutter Navigation (GoRouter)

PRIMARY file: lib/config/app_router.dart

Routes:
- / → /home (if auth) or /login (if not)
- /login, /register, /forgot-password (public)
- /reset-password?token=X (public, deep linked)
- /home, /leagues, /create-league, /join-league (protected)
- /league/:id (and nested routes)
- /draft/:id (and nested routes)
- /roster/:id (and nested routes)

Redirect logic enforces auth state

---

## 5. Web Routing (Netlify)

File: flutter_app/web/_redirects


SPA (Single Page App) routing:
- All requests → index.html
- GoRouter handles routing in browser
- Enables bookmarkable URLs

---

## 6. Deep Linking

### Android (AndroidManifest.xml):
- Scheme: tbdff://reset-password?token=X
- HTTP: http://localhost/reset-password?token=X
- HTTPS: (commented out, needs domain)

### iOS (Info.plist):
- Scheme: tbdff://

### Handler (AuthWrapper in main.dart):
**CURRENTLY DISABLED** (line 183) for crash diagnosis

When enabled:
- Uses app_links package
- Listens to deep link stream
- Routes to ResetPasswordScreen

---

## 7. Key Files

### Auth
- backend/src/middleware/authMiddleware.ts
- flutter_app/lib/providers/auth_provider.dart
- flutter_app/lib/services/auth_service.dart

### Leagues
- backend/src/controllers/leagueController.ts (join logic)
- backend/src/controllers/inviteController.ts
- flutter_app/lib/services/league_service.dart
- flutter_app/lib/services/invite_service.dart
- flutter_app/lib/screens/join_league_screen.dart

### Routing
- flutter_app/lib/config/app_router.dart (PRIMARY)
- flutter_app/lib/main.dart (deep links)
- flutter_app/web/_redirects
- android/app/src/main/AndroidManifest.xml
- ios/Runner/Info.plist

---

## 8. API Endpoints

Auth:
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/request-reset
- POST /api/auth/reset-password

Leagues:
- POST /api/leagues/create (protected)
- GET /api/leagues/public (rate limited)
- GET /api/leagues/user/:userId
- GET /api/leagues/:leagueId (protected)
- POST /api/leagues/:leagueId/join (protected)

Invites:
- POST /api/invites/send (protected)
- GET /api/invites/user/:userId
- POST /api/invites/:inviteId/accept (protected)
- POST /api/invites/:inviteId/decline (protected)

---

## 9. Database Tables

users: (id, username UNIQUE, email UNIQUE, password_hash)
leagues: (id, name, season, league_type, total_rosters, settings JSONB)
rosters: (id, league_id FK, user_id FK, roster_id, team_name)
  - UNIQUE(league_id, user_id)
  - UNIQUE(league_id, roster_id)
league_invites: (id, league_id FK, inviter_user_id, invited_user_id FK, status)
  - UNIQUE(league_id, invited_user_id)
drafts: (id, league_id UNIQUE FK, status, draft_type, ...)

---

## 10. Key Invariants (from TRUTHS.md)

1. One draft per league (UNIQUE)
2. One roster per user per league (UNIQUE)
3. Player drafted once per draft (UNIQUE)
4. Commissioner ID in league.settings.commissioner_id
5. All passwords hashed with bcrypt
6. All queries parameterized
7. JWT: { userId, username, email, isAdmin }
8. Draft status state machine enforced
9. Waiver processing atomic (SERIALIZABLE)
10. All foreign keys indexed

---

## 11. Current Status

### Working:
- Authentication
- League creation/joining
- Invitations
- Drafting (real-time)
- Rosters, trades, waivers, auctions
- Matchups, chat, push notifications

### Needs Work:
1. Deep Linking DISABLED (line 183, main.dart)
   - Crash diagnosis pending
2. Production Email Links (localhost only)
3. Production Domain Config

---

## 12. Important File Paths

Flutter:
- C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app\lib\main.dart
- C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app\lib\config\app_router.dart
- C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app\android\app\src\main\AndroidManifest.xml
- C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app\ios\Runner\Info.plist
- C:\Users\jkap8\Documents\DEV\tbd-ff\flutter_app\web\_redirects

Backend:
- C:\Users\jkap8\Documents\DEV\tbd-ff\backend\src\controllers\leagueController.ts
- C:\Users\jkap8\Documents\DEV\tbd-ff\backend\src\controllers\inviteController.ts
- C:\Users\jkap8\Documents\DEV\tbd-ff\backend\src\middleware\authMiddleware.ts

Docs:
- C:\Users\jkap8\Documents\DEV\tbd-ff\docs\TRUTHS.md
- C:\Users\jkap8\Documents\DEV\tbd-ff\CLAUDE.md

