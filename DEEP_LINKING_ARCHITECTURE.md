# Deep Linking Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEEP LINKING SYSTEM                          │
└─────────────────────────────────────────────────────────────────┘

                           LINK GENERATION
                                 │
                    ┌────────────┴────────────┐
                    │                         │
             Commissioner              Generates Link
                    │                         │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Backend API Endpoint  │
                    │  POST /leagues/:id/     │
                    │  generate-invite-link   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
         Returns Both Link Formats:
         ┌──────────────────────────────────┐
         │  webLink: https://hypetrain...   │
         │  appLink: tbdff://league/invite  │
         └──────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   Commissioner          Shares via:
      Shares             • Email
        │                • SMS
        │                • Social media
        │                • Messaging apps
        ▼                • Direct link
```

---

## Link Flow - App Installed

```
User Clicks: tbdff://league/invite?leagueId=123
        │
        ▼
┌─────────────────────────────┐
│  Deep Link Handler          │
│  (lib/main.dart:223)        │
└────────────┬────────────────┘
             │
    ┌────────▼────────┐
    │  Parse leagueId │
    │  Check auth     │
    └────────┬────────┘
             │
    ┌────────▼────────────────────────┐
    │ Authenticated?                   │
    └────────┬──────────┬──────────────┘
             │ YES      │ NO
             │          │
        ┌────▼────┐  ┌──▼─────────┐
        │Navigate │  │ Redirect   │
        │ to      │  │ to /login  │
        │/league/ │  └────┬───────┘
        │invite   │       │
        │?leagueId│   After login
        └────┬────┘   back to same
             │        flow
    ┌────────▼──────────────────────┐
    │  GoRouter Routes              │
    │  /league/invite               │
    │  (app_router.dart:144)        │
    └────────┬──────────────────────┘
             │
    ┌────────▼──────────────────────┐
    │  LeagueVisitorScreen          │
    │  (league_visitor_screen.dart) │
    └────────┬──────────────────────┘
             │
    ┌────────▼──────────────────────┐
    │ Load League Details from API  │
    │ GET /leagues/:leagueId        │
    └────────┬──────────────────────┘
             │
    ┌────────▼──────────────────────┐
    │ Check User Membership         │
    └────────┬──────────────────────┘
             │
    ┌────────▼────────────┬─────────────────┐
    │                     │                 │
Already  User is      User is         League
 Member? Already      Not a           is
 │       Member?      Member?         Full?
 │       │            │              │
 │       ▼            ▼              ▼
 │   Auto-        "Join League"   "League
 │  Redirect      Button          is Full"
 │   to Full    (Clickable)       Message
 │  Details
 │
 └──────────────────────────────────────────
```

---

## Link Flow - App Not Installed

```
User Clicks: https://hypetrain.netlify.app/#/league/invite?leagueId=123
        │
        ▼
┌──────────────────────────────────┐
│  Browser Opens Web App           │
│  (Flutter Web)                   │
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│  GoRouter Parses URL             │
│  /league/invite?leagueId=123     │
└──────────────┬───────────────────┘
               │
    ┌──────────▼──────────┐
    │  Authenticated?      │
    └──────┬──────┬────────┘
           │ YES  │ NO
           │      │
     ┌─────▼──┐   └──┬──────────┐
     │  Show  │      │ Redirect │
     │ League │      │ to login │
     │Preview │      │  page    │
     └─────┬──┘      └──┬───────┘
           │            │
           │        After login
           │        redirect back
           │
    ┌──────▼──────────┐
    │  "Join League"  │
    │   Button        │
    └──────┬──────────┘
           │
    ┌──────▼──────────────────┐
    │  POST /leagues/:id/join  │
    │  (Same endpoint as app)  │
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │  Success! User joined   │
    └─────────────────────────┘
```

---

## Component Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       BACKEND (Node.js)                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  leagueController.ts                                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ generateInviteLinkHandler                          │  │  │
│  │  │ - Validates authentication                         │  │  │
│  │  │ - Checks commissioner status                       │  │  │
│  │  │ - Generates web + app links                        │  │  │
│  │  │ - Returns JSON response                            │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             ▲                                   │
│                             │ (middleware)                      │
│  ┌──────────────────────────┼──────────────────────────────┐   │
│  │  leagueRoutes.ts         │                              │   │
│  │  POST /:leagueId/generate-invite-link                   │   │
│  │       ├─ authenticate                                  │   │
│  │       ├─ requireCommissioner                           │   │
│  │       └─ generateInviteLinkHandler                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    FLUTTER APP (Mobile)                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Platform Layer:                                               │
│  ├─ Android: Intent Filters (AndroidManifest.xml)             │
│  │   ├─ tbdff://league/invite (custom scheme)                │
│  │   └─ https://hypetrain.netlify.app/league/invite         │
│  │                                                            │
│  └─ iOS: URL Schemes (Info.plist)                            │
│      └─ tbdff://                                             │
│                                                                 │
│  Application Layer:                                            │
│  ├─ main.dart:223 (_handleDeepLink)                          │
│  │   ├─ Parses URI                                           │
│  │   ├─ Extracts leagueId                                    │
│  │   └─ Routes to correct screen                             │
│  │                                                            │
│  ├─ app_router.dart:144 (/league/invite route)              │
│  │   ├─ Parses query parameters                             │
│  │   ├─ Validates leagueId                                  │
│  │   └─ Shows LeagueVisitorScreen                           │
│  │                                                            │
│  └─ league_visitor_screen.dart (UI)                         │
│      ├─ Loads league details                                │
│      ├─ Shows preview                                       │
│      ├─ "Join" button logic                                 │
│      └─ Auto-redirect for existing members                  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    FLUTTER WEB (Browser)                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Browser:                                                      │
│  ├─ URL: https://hypetrain.netlify.app/#/league/invite       │
│  └─ Netlify SPA routing via _redirects                        │
│                                                                 │
│  Application:                                                  │
│  ├─ Same GoRouter system as mobile                            │
│  ├─ /league/invite route                                      │
│  └─ LeagueVisitorScreen (same UI)                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
                    DEEP LINK GENERATION

Commissioner              Backend                API Response
    │                       │                         │
    ├─ Click "Share"        │                         │
    │                       │                         │
    │   POST /leagues/123   │                         │
    │   /generate-invite    │                         │
    │──────────────────────>│                         │
    │                       ├─ Check auth            │
    │                       ├─ Check commissioner    │
    │                       ├─ Generate links        │
    │                       │                         │
    │                       │  {                     │
    │                       │    webLink: "https://", │
    │                       │    appLink: "tbdff://"  │
    │                       │  }                      │
    │<──────────────────────┼─────────────────────────│
    │   Response            │                         │
    │                       │                         │
    ├─ Copy link                                      │
    └─ Share via SMS/Email/etc.                       │

              DEEP LINK CONSUMPTION

User                  Browser/App              Backend/App
 │                        │                        │
 ├─ Click link             │                        │
 │ (app or web)            │                        │
 │                    Open link                     │
 │──────────────────────>│                          │
 │                    If mobile:                    │
 │                    ├─ System routes to app      │
 │                    │  via intent filter         │
 │                    │                            │
 │                    If web:                      │
 │                    ├─ Browser loads page        │
 │                    │                            │
 │                    Parse URI                    │
 │                    Extract leagueId             │
 │                    Navigate to /league/invite   │
 │<───────────────────────┤                        │
 │   Display league preview                        │
 │                                                 │
 ├─ Click "Join League"                            │
 │──────────────────────────────────────────────>│
 │                                   POST /join    │
 │                                      │          │
 │                                   Check auth    │
 │                                   Add roster    │
 │<─────────────────────────────────────────────│
 │   Success! Joined league                       │
 │                                                 │
 └─ Navigate to league details                     │
```

---

## Technology Stack

```
Frontend:
├─ Flutter (Mobile & Web)
├─ GoRouter (Navigation)
├─ Provider (State Management)
├─ app_links (Deep linking on mobile)
└─ HTTP client (API calls)

Backend:
├─ Node.js + Express
├─ TypeScript
├─ JWT Authentication
└─ PostgreSQL

Platform:
├─ iOS (App Links via URL scheme)
├─ Android (Deep Links via intent filters)
└─ Web (SPA routing via GoRouter)
```

---

## Security Flow

```
┌────────────────┐
│ User clicks    │
│ invite link    │
└────────┬───────┘
         │
    ┌────▼──────────────────┐
    │ App/Web receives link │
    └────┬──────────────────┘
         │
    ┌────▼──────────────────┐
    │ Extract leagueId      │
    │ from query params     │
    └────┬──────────────────┘
         │
    ┌────▼──────────────────┐
    │ Check authenticated?  │
    └────┬──────────────────┘
         │
    ┌────▼───────┬──────────┐
    │ YES        │ NO       │
    │            │          │
    │      ┌─────▼────┐     │
    │      │ Redirect │     │
    │      │ to login │     │
    │      └──────────┘     │
    │            │          │
    │      After auth:      │
    │      │                │
    │      └────┐           │
    │           │           │
    │      ┌────▼──────────────┐
    │      │ Load league data  │
    │      │ from API          │
    │      └────┬─────────────┘
    │           │
    │      ┌────▼──────────────┐
    │      │ Validate user can │
    │      │ join (not member) │
    │      └────┬─────────────┘
    │           │
    │      ┌────▼──────────────┐
    │      │ Show UI           │
    │      │ "Join League"     │
    │      │ button enabled    │
    │      └────┬─────────────┘
    │           │
    │      ┌────▼──────────────┐
    │      │ User clicks Join  │
    │      └────┬─────────────┘
    │           │
    │      ┌────▼────────────────────┐
    │      │ POST /leagues/:id/join   │
    │      │ (with JWT auth token)    │
    │      └────┬────────────────────┘
    │           │
    │      ┌────▼────────────────────┐
    │      │ Backend validates:       │
    │      │ ✓ User authenticated     │
    │      │ ✓ League exists          │
    │      │ ✓ User not member        │
    │      │ ✓ League not full        │
    │      └────┬────────────────────┘
    │           │
    │      ┌────▼────────────────────┐
    │      │ Create roster entry      │
    │      │ User is now member       │
    │      └────┬────────────────────┘
    │           │
    │      ┌────▼────────────────────┐
    │      │ Return success           │
    │      │ Redirect to league       │
    │      │ details screen           │
    │      └─────────────────────────┘
    │
    └─ Done! ✅
```

---

## Scaling Considerations

For future growth:

1. **Rate Limiting:** Add per-user/per-league limits on join attempts
2. **Analytics:** Track link clicks, conversions, drop-off points
3. **Invite Codes:** Use short alphanumeric codes instead of league IDs
4. **Expiration:** Add optional TTL to links
5. **Revocation:** Allow commissioners to revoke specific links
6. **Batch Sharing:** Generate multiple links for bulk invitations
7. **Incentives:** Bonus for users who join via links
8. **Tracking:** Know which user brought in which members

---

## Error Handling

```
Possible Errors & Recovery:

┌─────────────────────┐
│ Parse Error         │
│ Invalid leagueId    │
└─────────────────────┘
        │
        └─> Show "Invalid League" error
            Offer to browse leagues
            Link to /join-league screen

┌─────────────────────┐
│ League Not Found    │
│ leagueId=99999      │
└─────────────────────┘
        │
        └─> Show "League Not Found" error
            Check league exists
            Link to /join-league screen

┌─────────────────────┐
│ User Not Auth       │
│ No JWT token        │
└─────────────────────┘
        │
        └─> Redirect to /login
            Store deep link
            After login, use stored link

┌─────────────────────┐
│ Already Member      │
│ User in roster      │
└─────────────────────┘
        │
        └─> Auto-redirect to /league/:id
            Show full member UI

┌─────────────────────┐
│ League Full         │
│ All rosters filled  │
└─────────────────────┘
        │
        └─> Show "League is Full" message
            No join button
            Offer to browse other leagues

┌─────────────────────┐
│ API Error           │
│ Network unavailable │
└─────────────────────┘
        │
        └─> Show error message
            Retry button
            Back to home
```

---

This architecture supports millions of users sharing and joining leagues seamlessly across mobile and web platforms.
