# Deep Linking - Quick Reference Card

## Share Links Format

### To Share with App Users
```
tbdff://league/invite?leagueId=123
```

### To Share Anywhere (Email, Web, Social)
```
https://hypetrain.netlify.app/#/league/invite?leagueId=123
```

---

## Get Invite Link (API)

```bash
# Get the link (requires JWT token)
curl -X POST http://localhost:3000/api/leagues/123/generate-invite-link \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response:
{
  "success": true,
  "data": {
    "leagueId": 123,
    "webLink": "https://hypetrain.netlify.app/#/league/invite?leagueId=123",
    "appLink": "tbdff://league/invite?leagueId=123"
  }
}
```

---

## Test Deep Links

### Android
```bash
# App link
adb shell am start -a android.intent.action.VIEW \
  -d "tbdff://league/invite?leagueId=123"

# Web link
adb shell am start -a android.intent.action.VIEW \
  -d "https://hypetrain.netlify.app/#/league/invite?leagueId=123"
```

### iOS Simulator
```bash
# App link
xcrun simctl openurl booted "tbdff://league/invite?leagueId=123"

# Web link
xcrun simctl openurl booted "https://hypetrain.netlify.app/#/league/invite?leagueId=123"
```

---

## What Happens When User Clicks Link

### If App Installed
1. App opens
2. If logged in → Shows league preview with Join button
3. If not logged in → Redirects to login, then shows league preview
4. User clicks Join → Joins league instantly

### If App Not Installed
1. Web link opens in browser
2. If logged in → Shows league preview with Join button
3. If not logged in → Redirects to login, then shows league preview
4. User clicks Join → Joins league instantly

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Link doesn't open app | Check AndroidManifest.xml intent filters |
| Wrong screen shows | Verify `/league/invite` route in app_router.dart |
| Join button doesn't work | Check network, verify user is authenticated |
| "League not found" error | Verify leagueId is correct and exists |
| Can't generate link | Check you're league commissioner, token is valid |

---

## Files You Need to Know

- **Generate Link API:** `backend/src/controllers/leagueController.ts:1150`
- **Deep Link Handler:** `flutter_app/lib/main.dart:223`
- **Routing:** `flutter_app/lib/config/app_router.dart:144`
- **Android Config:** `flutter_app/android/app/src/main/AndroidManifest.xml`
- **Visitor Screen:** `flutter_app/lib/screens/league_visitor_screen.dart`

---

## One-Minute Setup

1. **Build the app** with latest changes
2. **Get league ID** (create a test league)
3. **Generate link:** Call `POST /api/leagues/:leagueId/generate-invite-link`
4. **Share link** with someone
5. **They click link** → App opens → Join league
6. **Done!** ✅

---

## Key Points

✅ Works on iOS, Android, web
✅ One-click join (after login if needed)
✅ Falls back to web if app not installed
✅ Only commissioners can generate links
✅ Links never expire (for now)
✅ Anyone with link can join
