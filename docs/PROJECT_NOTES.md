# TBD Fantasy Football - Project Notes

## Documentation Structure

All documentation has been organized into the `docs/` folder:
- `docs/setup/` - Setup guides (Firebase, push notifications, password reset, waivers, git hooks)
- `docs/security/` - Security documentation (fixes, authorization tracks)
- `docs/features/` - Feature guides (themes, widgets, roadmap, auction implementation)
- `docs/testing/` - Testing documentation (strategy, tester guide)
- `docs/development/` - Development notes (refactoring, extraction summaries)

## Recent Changes

### 2025-01-27 (Session 2) - Password Reset Feature

**Added**: Complete password reset functionality for users who forget their passwords

**Features**:
- Email-based password reset with secure tokens
- Token expiration (1 hour)
- Email enumeration protection
- One-time use tokens
- Development mode (logs to console) and production mode (actual emails)
- HTML email templates
- Password changed confirmation emails

**Backend Files Created**:
- `src/scripts/createPasswordResetTable.ts` - Database migration for password_reset_tokens table
- `src/models/PasswordReset.ts` - Token management (create, verify, mark as used)
- `src/services/emailService.ts` - Email sending with nodemailer
- `src/models/User.ts` - Added updateUserPassword() function
- `src/controllers/authController.ts` - Added requestPasswordReset() and resetPassword()
- `src/routes/authRoutes.ts` - Added /request-reset and /reset-password endpoints
- `backend/PASSWORD_RESET_SETUP.md` - Detailed setup and API documentation

**Frontend Files Created**:
- `lib/screens/forgot_password_screen.dart` - Email input screen for password reset request
- `lib/screens/reset_password_screen.dart` - New password entry screen with token
- `lib/screens/login_screen.dart` - Added "Forgot Password?" link

**Setup Required**:
1. Run `npm install nodemailer @types/nodemailer` in backend
2. Run `npx ts-node src/scripts/createPasswordResetTable.ts` to create database table
3. Configure SMTP settings in `.env` (or use development mode for console logging)

**API Endpoints**:
- `POST /api/auth/request-reset` - Request password reset (body: {email})
- `POST /api/auth/reset-password` - Reset password (body: {token, newPassword})

**Documentation**: See `SETUP_PASSWORD_RESET.md` for complete setup and testing guide

### 2025-01-27 (Session 1) - BN Slot Restructure

### BN Slot Restructure
**Problem**: BN (bench) slots were showing as duplicates - appearing both as roster slots and in a separate "Bench" section.

**Solution**: Restructured how bench players are handled:
- BN slots (BN1, BN2, BN3, etc.) are now included in the `starters` array alongside other positions
- Removed separate "Bench" section from UI (matchup_detail_screen.dart, roster_details_screen.dart)
- Backend now includes BN positions when creating roster slots (Roster.ts lines 43-55, 515-526)

**Files Changed**:
- `backend/src/models/Roster.ts` - Include BN slots in starters array
- `flutter_app/lib/screens/matchup_detail_screen.dart` - Removed duplicate Bench section
- `flutter_app/lib/screens/roster_details_screen.dart` - Removed duplicate Bench section, fixed player counting

### Roster Size Validation
**Added**: Warning banner when roster has too many players
- Shows at top of roster details screen
- Calculates: total players vs total roster slots
- Displays message: "You have X players but only Y roster slots. Please drop Z players"

**Files Changed**:
- `flutter_app/lib/screens/roster_details_screen.dart` (lines 422-475)

### Draft Player Assignment & Matchup Generation Fix
**Problem**: After draft completion, matchups weren't generating

**Root Cause**:
- `autoPopulateStarters()` was only returning non-BN slots
- When updating roster, it replaced ALL starters, removing BN slots entirely
- Weekly lineup population tried to include BN slots, causing validation errors

**Solution**:
1. Preserve BN slots from existing roster structure
2. Auto-populate non-BN starters with best players
3. Assign remaining players to BN slots
4. Filter out BN slots when creating weekly lineups

**Files Changed**:
- `backend/src/models/Draft.ts` (lines 425-455) - Preserve BN slots during player assignment
- `backend/src/models/Draft.ts` (lines 448-452) - Filter BN from weekly lineups
- `backend/src/models/Matchup.ts` (lines 508-516) - Filter BN from weekly lineups

## Architecture Notes

### Roster Structure
```json
{
  "starters": [
    {"slot": "QB1", "player_id": 123},
    {"slot": "RB1", "player_id": 456},
    {"slot": "BN1", "player_id": 789},  // Bench players in BN slots
    {"slot": "BN2", "player_id": null}
  ],
  "bench": [],  // Deprecated - only for overflow players
  "taxi": [101, 102],
  "ir": [103]
}
```

### Weekly Lineup Structure
- Contains ONLY non-BN starting positions (QB, RB, WR, FLEX, etc.)
- BN slots are excluded from weekly lineups
- Weekly lineups determine which players score points each week

### Important Functions
- `clearAllRosterLineups(leagueId)` - Regenerates roster slots (includes BN slots now)
- `autoPopulateStarters(rosterId, playerIds, leagueId)` - Assigns players to non-BN slots
- `assignDraftedPlayersToRosters(draftId)` - Handles post-draft player assignment
- `generateMatchupsForWeek(leagueId, week, season)` - Creates matchups and weekly lineups

## Known Issues
- None currently

## Next Steps / TODO
- Test draft completion and matchup generation with new BN slot structure
- Verify roster validation warnings display correctly
- Ensure all 6 BN slots appear after league reset

## Testing Notes
- After making BN slot changes, existing leagues need to be reset to regenerate roster slots
- Use "Reset League" button in edit league screen (only available to commissioner)
- Reset clears all players, draft, matchups, and regenerates rosters with new structure

## League Settings
- Default BN slots: 6 (configurable in create_league_screen.dart)
- BN slots are now roster positions like any other position
