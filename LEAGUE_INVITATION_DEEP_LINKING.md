# League Invitation Deep Linking Implementation

## Overview

This document describes the implementation of league invitation deep linking for the TBD Fantasy Football app. The feature allows users to share league invitation links that work both in the Flutter mobile app and on the web.

## URL Format

League invitation links use the following format:

```
https://hypetrain.netlify.app/#/league/invite?leagueId=123
```

Where `123` is the ID of the league being shared.

## Implementation Details

### 1. Route Configuration

**File:** `flutter_app/lib/config/app_router.dart`

The invitation route is configured as a public route (accessible without authentication):

```dart
GoRoute(
  path: '/league/invite',
  builder: (context, state) {
    final leagueId = state.uri.queryParameters['leagueId'];
    if (leagueId == null) {
      return const JoinLeagueScreen();
    }

    final parsedLeagueId = int.tryParse(leagueId);
    if (parsedLeagueId == null) {
      return const Scaffold(
        body: Center(
          child: Text('Invalid league invitation link'),
        ),
      );
    }

    return LeagueInviteScreen(leagueId: parsedLeagueId);
  },
),
```

The route is marked as public in the router's redirect logic:

```dart
final isPublicRoute = location == '/card-demo' ||
                      location.startsWith('/league/invite');
```

### 2. League Invite Screen

**File:** `flutter_app/lib/screens/league_invite_screen.dart`

A dedicated screen that displays league information and handles the join flow:

**Features:**
- Displays league preview card with key information:
  - League name
  - Season
  - League type (Redraft, Dynasty, Keeper)
  - Current roster count vs total rosters
  - Available spots
  - League status
- Shows appropriate action button based on auth state:
  - "Login to Join" (if not authenticated)
  - "Join League" (if authenticated and spots available)
  - "League Full" (if no spots available)
- Handles loading and error states
- Supports pull-to-refresh
- Automatically navigates to league details after successful join

**Authentication Flow:**
- Unauthenticated users see league preview with "Login to Join" button
- Login button redirects to login screen with return URL
- After successful login, user is redirected back to invitation page
- Authenticated users can immediately join the league

**League Data Fetching:**
- For authenticated users: Uses authenticated `/api/leagues/:leagueId` endpoint
- For unauthenticated users: Attempts to fetch from public leagues list
- Falls back gracefully if league is not publicly available

### 3. Backend API Endpoints

**Used Endpoints:**

1. **GET /api/v1/leagues/public**
   - Public endpoint (no authentication required)
   - Returns list of all public leagues
   - Used to show league preview for unauthenticated users

2. **GET /api/v1/leagues/:leagueId**
   - Protected endpoint (requires authentication and league membership)
   - Returns detailed league information with rosters
   - Used for authenticated users viewing invitation

3. **POST /api/v1/leagues/:leagueId/join**
   - Protected endpoint (requires authentication)
   - Creates a new roster for the authenticated user in the league
   - Returns the newly created roster

### 4. User Flows

#### Flow 1: Unauthenticated User Visits Link

```
1. User clicks invitation link
2. App loads league invite screen (no auth required)
3. Screen attempts to load league info from public leagues
4. If league is public:
   - Display league preview card
   - Show "Login to Join" button
5. If league is not public:
   - Show error message: "Please log in to view invitation"
   - Show "Login to View" button
6. User clicks "Login" button
7. Redirect to login screen with return URL
8. After successful login, redirect back to invitation page
9. User is now authenticated, can join league
```

#### Flow 2: Authenticated User Visits Link

```
1. User clicks invitation link
2. App loads league invite screen
3. Screen loads league info via authenticated endpoint
4. Display league preview card with details
5. If league has available spots:
   - Show "Join League" button
6. If league is full:
   - Show "League Full" button (disabled)
7. User clicks "Join League"
8. API request to join league
9. On success:
   - Show success message
   - Navigate to league details screen
10. On error:
    - Show error message
    - Allow user to retry
```

#### Flow 3: Already a Member Visits Link

```
1. User clicks invitation link
2. App loads league invite screen
3. Screen loads league info (user already has access)
4. Display league preview
5. User sees they're already a member
6. Can navigate to league details
```

## Files Modified/Created

### Created Files:
1. `flutter_app/lib/screens/league_invite_screen.dart` - Main invitation screen

### Modified Files:
1. `flutter_app/lib/config/app_router.dart` - Added route and marked as public
2. `flutter_app/lib/config/routes.dart` - Added route constant

### Existing Files Used:
1. `flutter_app/lib/services/league_service.dart` - Used existing `getLeagueDetails()` and `joinLeague()` methods
2. `flutter_app/lib/models/league_model.dart` - Existing league model
3. `flutter_app/lib/providers/auth_provider.dart` - Authentication state management

## Design Decisions

### 1. Public Route vs Protected Route

**Decision:** Make `/league/invite` a public route

**Rationale:**
- Allows sharing links with users who don't have accounts yet
- Encourages new user signups
- Matches common UX pattern (see invite, then login to join)
- Provides preview without requiring authentication

### 2. Dedicated Screen vs Reusing League Details

**Decision:** Create dedicated `LeagueInviteScreen`

**Rationale:**
- League details screen requires authentication and membership
- Invitation screen needs different UX for non-members
- Clearer separation of concerns
- Better control over what information is shown publicly
- Allows custom messaging ("You're invited to join...")

### 3. Data Fetching Strategy

**Decision:** Try authenticated endpoint first, fallback to public leagues

**Rationale:**
- Authenticated users get full league details
- Unauthenticated users get basic preview from public leagues
- Graceful degradation if league is not public
- Minimal backend changes required

### 4. Error Handling

**Decision:** Show helpful error messages with recovery options

**Rationale:**
- "League not found" → Suggest login
- "Not publicly available" → Prompt login
- "League full" → Disable join button
- "Join failed" → Show error, allow retry

## Testing Scenarios

### Test Case 1: New User Flow
1. Share link: `https://hypetrain.netlify.app/#/league/invite?leagueId=1`
2. Open in incognito/private browsing
3. Verify league preview shows
4. Click "Login to Join"
5. Complete login
6. Verify redirect back to invitation
7. Click "Join League"
8. Verify successful join and navigation to league details

### Test Case 2: Authenticated User
1. Share link: `https://hypetrain.netlify.app/#/league/invite?leagueId=2`
2. Open in authenticated browser/app
3. Verify league details load immediately
4. Click "Join League"
5. Verify successful join

### Test Case 3: Full League
1. Create league with max rosters
2. Fill all roster spots
3. Share invitation link
4. Open link
5. Verify "League Full" button is disabled

### Test Case 4: Invalid League ID
1. Open link: `https://hypetrain.netlify.app/#/league/invite?leagueId=99999`
2. Verify error message shows
3. Verify recovery options available

### Test Case 5: Already a Member
1. User is already in league
2. Open invitation link for that league
3. Verify can view league details
4. Optionally show "You're already a member" message

## Future Enhancements

### 1. Backend Public League Endpoint
- Create dedicated `/api/v1/leagues/:leagueId/public` endpoint
- Returns limited league info without requiring authentication
- Better than filtering public leagues list

### 2. Invite Codes
- Support invite code parameter: `?inviteCode=ABC123`
- Allow joining via code instead of league ID
- More user-friendly than numeric IDs

### 3. Deep Link Analytics
- Track invitation link clicks
- Measure conversion rate (views → signups → joins)
- Identify most shared leagues

### 4. Social Sharing
- Add "Share League" button in app
- Generate shareable link with metadata
- Support SMS, email, social media sharing
- Include Open Graph tags for rich previews

### 5. Invite-Specific Permissions
- Allow commissioner to enable/disable public invitations
- Require approval for joins from public links
- Set expiration dates on invitation links

### 6. Mobile App Deep Linking
- Configure Universal Links (iOS) and App Links (Android)
- Automatically open app if installed
- Fallback to web if app not installed

## Security Considerations

### 1. League Privacy
- Only public leagues are visible to unauthenticated users
- Private leagues require login to view invitation
- League members list not exposed publicly

### 2. Rate Limiting
- Backend already has rate limiting on join endpoint
- Prevents spam joining attempts
- Protects against malicious invitation link sharing

### 3. Authorization
- Join endpoint verifies user is authenticated
- Checks league has available roster spots
- Prevents duplicate joins (one roster per user per league)

## Troubleshooting

### Issue: "League not found" error for valid league
**Cause:** League may not be marked as public
**Solution:** Login to view the invitation, or contact league commissioner

### Issue: Redirect loop after login
**Cause:** Return URL not properly preserved
**Solution:** Check login screen handles `returnUrl` argument correctly

### Issue: Can't join league after login
**Cause:** League may have filled up between viewing and joining
**Solution:** Refresh page to see current roster count

## References

### Related Files
- `flutter_app/lib/screens/league_invite_screen.dart`
- `flutter_app/lib/config/app_router.dart`
- `flutter_app/lib/config/routes.dart`
- `flutter_app/lib/services/league_service.dart`
- `backend/src/routes/leagueRoutes.ts`
- `backend/src/controllers/leagueController.ts`

### API Documentation
- See backend API documentation for detailed endpoint specs
- `/api/v1/leagues/public` - Get all public leagues
- `/api/v1/leagues/:leagueId` - Get league details
- `/api/v1/leagues/:leagueId/join` - Join a league

### Flutter Resources
- GoRouter documentation: https://pub.dev/packages/go_router
- Deep linking guide: https://docs.flutter.dev/ui/navigation/deep-linking
