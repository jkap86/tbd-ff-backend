# League Invitation Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Journey                            │
└─────────────────────────────────────────────────────────────────┘

    User receives link:
    https://hypetrain.netlify.app/#/league/invite?leagueId=123
                            ↓
    ┌───────────────────────────────────────────────────────────┐
    │                    Web Browser / App                       │
    │                    Opens Deep Link                         │
    └───────────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────────┐
    │              Flutter App (GoRouter)                        │
    │         Route: /league/invite?leagueId=123                 │
    │                                                            │
    │  • Extracts leagueId from query parameter                  │
    │  • Route marked as PUBLIC (no auth required)               │
    │  • Creates LeagueInviteScreen(leagueId: 123)              │
    └───────────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────────┐
    │            LeagueInviteScreen Loads                        │
    └───────────────────────────────────────────────────────────┘
                            ↓
            ┌───────────────┴───────────────┐
            ↓                               ↓
    ┌──────────────────┐          ┌──────────────────┐
    │  User NOT Auth   │          │   User Auth      │
    └──────────────────┘          └──────────────────┘
            ↓                               ↓
    ┌──────────────────┐          ┌──────────────────┐
    │  Try to fetch    │          │  Fetch league    │
    │  from PUBLIC     │          │  with AUTH token │
    │  leagues API     │          │  /api/leagues/   │
    │  /api/leagues/   │          │  :leagueId       │
    │  public          │          └──────────────────┘
    └──────────────────┘                    ↓
            ↓                       ┌──────────────────┐
    ┌──────────────────┐            │  Show league     │
    │  League found    │            │  preview card    │
    │  in public list? │            │                  │
    └──────────────────┘            │  • Name          │
         ↓       ↓                  │  • Season        │
        Yes      No                 │  • Type          │
         ↓       ↓                  │  • Rosters       │
         ↓       ↓                  │  • Available     │
         ↓       ↓                  └──────────────────┘
         ↓       ↓                           ↓
         ↓   ┌──────────────────┐   ┌──────────────────┐
         ↓   │  Show error:     │   │  Show button     │
         ↓   │  "Please login   │   │  based on state: │
         ↓   │  to view"        │   │                  │
         ↓   │                  │   │  • League Full?  │
         ↓   │  Button:         │   │    → Disabled    │
         ↓   │  "Login to View" │   │  • Has spots?    │
         ↓   └──────────────────┘   │    → Join button │
         ↓                           └──────────────────┘
         ↓                                    ↓
    ┌──────────────────┐                     ↓
    │  Show league     │                     ↓
    │  preview card    │             ┌──────────────────┐
    │                  │             │  User clicks     │
    │  • Name          │             │  "Join League"   │
    │  • Season        │             └──────────────────┘
    │  • Type          │                      ↓
    │  • Rosters       │             ┌──────────────────┐
    │  • Available     │             │  POST /api/      │
    └──────────────────┘             │  leagues/:id/    │
            ↓                        │  join            │
    ┌──────────────────┐             │                  │
    │  Show button:    │             │  (with auth      │
    │  "Login to Join" │             │   token)         │
    └──────────────────┘             └──────────────────┘
            ↓                                 ↓
    ┌──────────────────┐             ┌──────────────────┐
    │  User clicks     │             │  Success?        │
    │  "Login to Join" │             └──────────────────┘
    └──────────────────┘                 ↓        ↓
            ↓                           Yes       No
    ┌──────────────────┐                 ↓        ↓
    │  Navigate to     │         ┌──────────┐  ┌──────────┐
    │  /login with     │         │ Show     │  │ Show     │
    │  returnUrl set   │         │ success  │  │ error    │
    │  to current URL  │         │ message  │  │ message  │
    └──────────────────┘         └──────────┘  └──────────┘
            ↓                           ↓            ↓
    ┌──────────────────┐         ┌──────────┐  ┌──────────┐
    │  Login Screen    │         │ Navigate │  │ Allow    │
    │  User enters     │         │ to       │  │ retry    │
    │  credentials     │         │ league   │  └──────────┘
    └──────────────────┘         │ details  │
            ↓                    └──────────┘
    ┌──────────────────┐
    │  Successful      │
    │  login           │
    └──────────────────┘
            ↓
    ┌──────────────────┐
    │  Redirect back   │
    │  to invitation   │
    │  page (now auth) │
    └──────────────────┘
            ↓
    ┌──────────────────┐
    │  Now follows     │
    │  "User Auth"     │
    │  flow (right)    │
    └──────────────────┘
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                    Flutter App Architecture                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         GoRouter                                 │
│  - Handles URL routing                                           │
│  - Parses query parameters                                       │
│  - Manages navigation stack                                      │
│  - Defines public routes                                         │
└──────────────────────────────────────────────────────────────────┘
                            ↓ creates
┌──────────────────────────────────────────────────────────────────┐
│                    LeagueInviteScreen                            │
│  - StatefulWidget                                                │
│  - Manages loading state                                         │
│  - Displays league preview                                       │
│  - Handles join action                                           │
└──────────────────────────────────────────────────────────────────┘
              ↓ uses                    ↓ uses
┌───────────────────────┐    ┌────────────────────────┐
│    AuthProvider        │    │   LeagueService        │
│  - isAuthenticated     │    │  - getLeagueDetails()  │
│  - token               │    │  - joinLeague()        │
│  - user                │    └────────────────────────┘
└───────────────────────┘              ↓ calls
              ↓ reads                   ↓
┌───────────────────────┐    ┌────────────────────────┐
│   Shared Preferences   │    │   Backend API          │
│   (Auth State)         │    │  - GET /leagues/public │
└───────────────────────┘    │  - GET /leagues/:id    │
                             │  - POST /leagues/:id/  │
                             │    join                │
                             └────────────────────────┘
```

## API Call Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    Unauthenticated User                          │
└──────────────────────────────────────────────────────────────────┘

LeagueInviteScreen.initState()
         ↓
    _loadLeagueDetails()
         ↓
    Check authProvider.isAuthenticated = false
         ↓
    Call _loadPublicLeagueInfo()
         ↓
    HTTP GET /api/v1/leagues/public
         ↓
    ┌──────────────────────────────────────┐
    │  Backend Response:                   │
    │  {                                   │
    │    "success": true,                  │
    │    "data": [                         │
    │      {                               │
    │        "id": 123,                    │
    │        "name": "My League",          │
    │        "season": "2024",             │
    │        "league_type": "redraft",     │
    │        "total_rosters": 12,          │
    │        "current_rosters": 8          │
    │      },                              │
    │      ...                             │
    │    ]                                 │
    │  }                                   │
    └──────────────────────────────────────┘
         ↓
    Find league with id=123
         ↓
    Create League model from JSON
         ↓
    setState() to update UI
         ↓
    Display league preview card


┌──────────────────────────────────────────────────────────────────┐
│                     Authenticated User                           │
└──────────────────────────────────────────────────────────────────┘

LeagueInviteScreen.initState()
         ↓
    _loadLeagueDetails()
         ↓
    Check authProvider.isAuthenticated = true
         ↓
    HTTP GET /api/v1/leagues/123
    Header: Authorization: Bearer <token>
         ↓
    ┌──────────────────────────────────────┐
    │  Backend Response:                   │
    │  {                                   │
    │    "success": true,                  │
    │    "data": {                         │
    │      "league": {                     │
    │        "id": 123,                    │
    │        "name": "My League",          │
    │        "season": "2024",             │
    │        "league_type": "redraft",     │
    │        "total_rosters": 12,          │
    │        "current_rosters": 8,         │
    │        "settings": {...},            │
    │        ...                           │
    │      },                              │
    │      "rosters": [...]                │
    │    }                                 │
    │  }                                   │
    └──────────────────────────────────────┘
         ↓
    Create League model from JSON
         ↓
    setState() to update UI
         ↓
    Display league preview card
         ↓
    User clicks "Join League"
         ↓
    _joinLeague()
         ↓
    HTTP POST /api/v1/leagues/123/join
    Header: Authorization: Bearer <token>
    Body: {}
         ↓
    ┌──────────────────────────────────────┐
    │  Backend Response:                   │
    │  {                                   │
    │    "success": true,                  │
    │    "data": {                         │
    │      "id": 456,                      │
    │      "league_id": 123,               │
    │      "user_id": 789,                 │
    │      "roster_id": 9,                 │
    │      ...                             │
    │    }                                 │
    │  }                                   │
    └──────────────────────────────────────┘
         ↓
    Show success message
         ↓
    Navigate to LeagueDetailsScreen(leagueId: 123)
```

## State Management

```
┌──────────────────────────────────────────────────────────────────┐
│                  LeagueInviteScreen State                        │
└──────────────────────────────────────────────────────────────────┘

Initial State:
    _league = null
    _isLoading = true
    _isJoining = false
    _errorMessage = null
    _successMessage = null
          ↓
    initState() calls _loadLeagueDetails()
          ↓
Loading State:
    _league = null
    _isLoading = true
    _isJoining = false
    _errorMessage = null
    _successMessage = null

    UI: Shows CircularProgressIndicator
          ↓
    API call completes
          ↓
Success State:
    _league = League(...)
    _isLoading = false
    _isJoining = false
    _errorMessage = null
    _successMessage = null

    UI: Shows league preview card
          ↓
    User clicks "Join League"
          ↓
Joining State:
    _league = League(...)
    _isLoading = false
    _isJoining = true        ← Changed
    _errorMessage = null
    _successMessage = null

    UI: Button shows loading spinner
          ↓
    Join API call completes
          ↓
Joined State:
    _league = League(...)
    _isLoading = false
    _isJoining = false
    _errorMessage = null
    _successMessage = "Successfully joined league!"

    UI: Shows success banner, then navigates away
          ↓
    Navigate to league details


Alternative: Error State
    _league = null (or League if partially loaded)
    _isLoading = false
    _isJoining = false
    _errorMessage = "Error message here"
    _successMessage = null

    UI: Shows error message with recovery options
```

## URL Structure

```
Production URL:
https://hypetrain.netlify.app/#/league/invite?leagueId=123
│                              │ │              │          │
│                              │ │              │          └─ Query parameter
│                              │ │              └─ Path segment
│                              │ └─ Hash routing
│                              └─ Domain
└─ Protocol

Development URL:
http://localhost:53432/#/league/invite?leagueId=123
│                     │ │              │          │
│                     │ │              │          └─ Query parameter
│                     │ │              └─ Path segment
│                     │ └─ Hash routing
│                     └─ Dev server port
└─ Protocol

Components:
- Protocol: https:// (secure) or http:// (dev)
- Domain: hypetrain.netlify.app or localhost:PORT
- Hash: # (Flutter web uses hash routing)
- Path: /league/invite (route path)
- Query: ?leagueId=123 (league ID parameter)
```

## Navigation Flow

```
User Journey Through App:

External Link
     ↓
/league/invite?leagueId=123 ─────────┐
     ↓                               │
[View League Preview]                │
     ↓                               │
     ├─ Not Authenticated ────────┐  │
     │       ↓                    │  │
     │   Click "Login"            │  │
     │       ↓                    │  │
     │   /login ←─────────────────┘  │
     │       ↓                       │
     │   [Login Form]                │
     │       ↓                       │
     │   Successful Login            │
     │       ↓                       │
     │   Return to: /league/invite   │
     │              ?leagueId=123 ───┘
     │       ↓
     └─ Authenticated
             ↓
         Click "Join"
             ↓
         [API Call]
             ↓
         ┌───┴───┐
         ↓       ↓
     Success   Error
         ↓       ↓
     Navigate  Stay & Retry
         ↓
     /league/123
         ↓
     [League Details Screen]
```

## Error Scenarios

```
Error Handling Matrix:

┌─────────────────────┬──────────────────────┬─────────────────────┐
│   Error Type        │   User State         │   Action            │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ Invalid league ID   │ Any                  │ Show error          │
│                     │                      │ Suggest checking    │
│                     │                      │ the link            │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ League not found    │ Not authenticated    │ Prompt login        │
│                     │ Authenticated        │ Show "not found"    │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ League not public   │ Not authenticated    │ Prompt login to     │
│                     │                      │ view                │
│                     │ Authenticated        │ Should not happen   │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ League is full      │ Any                  │ Disable join button │
│                     │                      │ Show "Full" state   │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ Already a member    │ Authenticated        │ Allow viewing       │
│                     │                      │ Navigate to league  │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ Join failed         │ Authenticated        │ Show error message  │
│                     │                      │ Allow retry         │
├─────────────────────┼──────────────────────┼─────────────────────┤
│ Network error       │ Any                  │ Show error          │
│                     │                      │ Enable pull-refresh │
└─────────────────────┴──────────────────────┴─────────────────────┘
```
