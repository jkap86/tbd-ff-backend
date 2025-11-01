# iOS Push Notifications Setup - HypeTrain

**Date**: 2025-11-01
**Status**: Code implemented, Xcode configuration needed

---

## ✅ What's Already Done

### Firebase Console
- ✅ Created HypeTrain Firebase project
- ✅ Added iOS app (bundle ID: com.jkap86.fantasyfootball)
- ✅ Downloaded GoogleService-Info.plist
- ✅ Uploaded APNs authentication key (.p8) for Dev and Prod
- ✅ Enabled Cloud Messaging API V1

### Backend (Node.js)
- ✅ Firebase Admin SDK installed
- ✅ Service account JSON placed at `backend/firebase-service-account.json`
- ✅ Push notification service implemented (`pushNotificationService.ts`)
- ✅ Database tables created (push_tokens, notification_preferences, notification_history)
- ✅ API endpoints enabled at `/api/notifications/*`
- ✅ Token registration endpoint: `POST /api/notifications/register-token`
- ✅ Preferences endpoint: `GET/PUT /api/notifications/preferences`

### Flutter
- ✅ Added firebase_core and firebase_messaging packages
- ✅ Created PushNotificationService (`lib/services/push_notification_service.dart`)
- ✅ Firebase initialization in main.dart
- ✅ Push notification initialization in HomeScreen
- ✅ Background message handler configured
- ✅ GoogleService-Info.plist placed in `ios/Runner/`

---

## ❌ What You Need to Do in Xcode

### Step 1: Open iOS Project in Xcode
```bash
cd flutter_app/ios
open Runner.xcworkspace  # NOT Runner.xcodeproj
```

### Step 2: Add GoogleService-Info.plist to Xcode
1. In Xcode, right-click on the `Runner` folder (in the left sidebar)
2. Select "Add Files to 'Runner'"
3. Navigate to and select `GoogleService-Info.plist`
4. Make sure "Copy items if needed" is UNCHECKED (file is already there)
5. Make sure "Runner" target is checked
6. Click "Add"

### Step 3: Enable Push Notification Capability
1. Select the `Runner` project in the left sidebar
2. Select the `Runner` target
3. Go to "Signing & Capabilities" tab
4. Click "+ Capability" button
5. Search for "Push Notifications" and add it
6. You should see "Push Notifications" added to capabilities

### Step 4: Enable Background Modes
1. Still in "Signing & Capabilities"
2. Click "+ Capability" again
3. Add "Background Modes"
4. Check these options:
   - ✅ Remote notifications
   - ✅ Background fetch (optional, for future features)

### Step 5: Update iOS Deployment Target (if needed)
1. In "General" tab
2. Set "Minimum Deployments" to iOS 12.0 or higher

### Step 6: Clean and Build
```bash
cd flutter_app
flutter clean
flutter pub get
cd ios
pod install
```

---

## Testing Push Notifications

### Test on Physical Device (Required for iOS)
Push notifications don't work reliably on iOS Simulator. You need a physical iPhone/iPad.

### Step 1: Run the App
```bash
flutter run --release
```
Or use Xcode to run on your device.

### Step 2: Grant Permissions
When the app launches, you'll see a permission dialog. Tap "Allow" to enable notifications.

### Step 3: Send Test Notification

#### Option A: From Backend API
```bash
# Get your auth token first (login via app or API)
# Then send test notification:

curl -X POST https://your-backend.com/api/notifications/test \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

#### Option B: From Firebase Console
1. Go to Firebase Console
2. Navigate to "Engage" → "Cloud Messaging"
3. Click "Create your first campaign"
4. Choose "Firebase Notification messages"
5. Enter title and text
6. Click "Send test message"
7. Add your FCM token (check console logs for token)
8. Click "Test"

### Step 4: Check Console Logs
Look for these in Xcode console or `flutter run` output:
```
[PushNotifications] FCM Token: <your-token>
[PushNotifications] Token registered with backend
[PushNotifications] Foreground message received
```

---

## Common Issues & Solutions

### Issue: "No valid 'aps-environment' entitlement"
**Solution**: Make sure Push Notifications capability is added in Xcode

### Issue: Token is nil
**Solution**:
1. Ensure you're on a physical device
2. Check that you've accepted notification permissions
3. Verify GoogleService-Info.plist is added to Xcode project

### Issue: Not receiving notifications
**Solution**:
1. Check device has internet connection
2. Verify APNs key is uploaded to Firebase
3. Check notification permissions in Settings → HypeTrain → Notifications
4. Ensure app is using correct bundle ID (com.jkap86.fantasyfootball)

### Issue: "firebase_core not found" build error
**Solution**:
```bash
cd ios
pod install
```

---

## Notification Types Implemented

The following notification types are ready to use:

### Draft
- `draft_starting` - Draft starts in X minutes
- `your_turn_to_draft` - It's your turn to pick
- `draft_pick` - Someone made a pick

### Trade
- `trade_offer` - New trade offer received
- `trade_accepted` - Your trade was accepted
- `trade_rejected` - Your trade was rejected

### Waiver
- `waiver_processed` - Waiver claims processed
- `waiver_claimed` - You successfully claimed a player

### Matchup
- `matchup_reminder` - Set your lineup reminder
- `matchup_final` - Matchup results

---

## How Notifications Work in Your App

1. **App Launch**: PushNotificationService initializes in HomeScreen
2. **Permission Request**: iOS prompts user for notification permission
3. **Token Registration**: FCM token is sent to backend and stored
4. **Receiving**:
   - Foreground: Shows in-app notification
   - Background: Shows system notification
   - Tapped: Navigates to relevant screen

---

## API Endpoints Available

### Register FCM Token
```
POST /api/notifications/register-token
Body: {
  "token": "fcm-token-here",
  "device_type": "ios",
  "device_id": "unique-device-id"
}
```

### Update Preferences
```
PUT /api/notifications/preferences
Body: {
  "draft_your_turn": true,
  "trade_proposed": true,
  // ... other preferences
}
```

### Get Preferences
```
GET /api/notifications/preferences
```

### Send Test Notification (Dev only)
```
POST /api/notifications/test
```

---

## Next Steps

After Xcode setup:
1. Run on physical iOS device
2. Check that FCM token appears in logs
3. Send test notification
4. Verify notification appears

Once working, notifications will automatically trigger for:
- Draft events (when draft socket events fire)
- Trade events (when trades are proposed/accepted)
- Waiver processing (via scheduler)
- Matchup reminders (via scheduler)

---

## Production Deployment

Before deploying to App Store:
1. Ensure production APNs key is configured in Firebase
2. Test with TestFlight build
3. Verify notifications work in release mode
4. Consider implementing notification categories (for action buttons)
5. Add notification settings screen in app

---

*Last Updated: 2025-11-01*
*Status: Ready for Xcode configuration*