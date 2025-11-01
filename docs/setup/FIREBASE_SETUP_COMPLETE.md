# Firebase Push Notifications - Complete Setup Guide

## What's Already Done ✅

✅ Backend Firebase Admin SDK installed (`firebase-admin`)
✅ Backend service configured to use Firebase
✅ Flutter dependencies added to `pubspec.yaml`
✅ FCM Service created (`lib/services/fcm_service.dart`)
✅ All notification APIs and database ready

## What You Need to Do

### Step 1: Create Firebase Project (5 minutes)

1. Go to https://console.firebase.google.com/
2. Click **"Add project"**
3. Project name: `TBD Fantasy Football` (or whatever you prefer)
4. Disable Google Analytics (optional, not needed)
5. Click **"Create project"**

---

### Step 2: Add iOS App to Firebase (10 minutes)

1. In Firebase Console, click the iOS icon to add an iOS app
2. **iOS bundle ID**: Find this in Xcode
   - Open `flutter_app/ios/Runner.xcworkspace` in Xcode
   - Select "Runner" in project navigator
   - Go to "Signing & Capabilities" tab
   - Look for "Bundle Identifier" (e.g., `com.yourcompany.tbd-ff`)
   - Copy this exact bundle ID

3. Click **"Register app"**

4. **Download `GoogleService-Info.plist`**

5. Add to Xcode:
   - Drag `GoogleService-Info.plist` into Xcode
   - Drop it in the `Runner` folder
   - Make sure **"Copy items if needed"** is checked
   - Make sure **"Runner" target** is selected

6. **Enable Push Notifications capability:**
   - In Xcode, select Runner → Signing & Capabilities
   - Click **"+ Capability"**
   - Add **"Push Notifications"**
   - Click **"+ Capability"** again
   - Add **"Background Modes"**
   - Check **"Remote notifications"**

7. Skip the rest of Firebase setup wizard (click Continue/Next)

---

### Step 3: Add Android App to Firebase (5 minutes)

1. In Firebase Console, click the Android icon to add an Android app
2. **Android package name**: Find this in `flutter_app/android/app/build.gradle`
   - Look for `applicationId` (e.g., `com.yourcompany.tbd_ff`)
   - Copy this exact package name

3. Click **"Register app"**

4. **Download `google-services.json`**

5. Place file:
   - Copy `google-services.json` to `flutter_app/android/app/`
   - Make sure it's in the `app` folder, NOT the root `android` folder

6. **Edit `flutter_app/android/app/build.gradle`:**
   - At the very top, add the plugin:
   ```gradle
   plugins {
       id "com.android.application"
       id "kotlin-android"
       id "dev.flutter.flutter-gradle-plugin"
       id "com.google.gms.google-services"  // ADD THIS LINE
   }
   ```

7. **Edit `flutter_app/android/build.gradle`:**
   - In the `dependencies` section, add:
   ```gradle
   dependencies {
       classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
       classpath "com.google.gms:google-services:4.4.0"  // ADD THIS LINE
   }
   ```

8. Skip the rest of Firebase setup wizard

---

### Step 4: Get Service Account Key for Backend (5 minutes)

1. In Firebase Console, click the gear icon ⚙️ → **Project settings**
2. Go to **Service Accounts** tab
3. Click **"Generate New Private Key"**
4. Click **"Generate Key"** in the popup
5. A JSON file will download - this is your service account key

6. **For Local Development:**
   - Rename the file to `firebase-service-account.json`
   - Move it to `backend/firebase-service-account.json`
   - Add to `.gitignore`:
     ```
     firebase-service-account.json
     ```

7. **For Heroku Production:**
   ```bash
   cd backend
   heroku config:set FIREBASE_SERVICE_ACCOUNT="$(cat firebase-service-account.json)"
   ```

---

### Step 5: Install Flutter Dependencies (2 minutes)

```bash
cd flutter_app
flutter pub get
```

This will install:
- `firebase_core` - Firebase initialization
- `firebase_messaging` - Push notifications
- `flutter_local_notifications` - Foreground notifications

---

### Step 6: Initialize Firebase in Flutter Main (Already done!)

The code structure is ready. You just need to initialize Firebase in your `main.dart`:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'services/fcm_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp();

  runApp(const MyApp());
}
```

Then, after user logs in, initialize FCM:

```dart
Future<void> onUserLogin(String authToken) async {
  await FCMService().initialize(
    authToken,
    onNotificationTap: (data) {
      // Handle navigation based on notification data
      final screen = data['screen'];
      final type = data['type'];

      switch (screen) {
        case 'DraftRoom':
          // Navigate to draft room
          break;
        case 'TradeDetail':
          // Navigate to trade details
          break;
        case 'Roster':
          // Navigate to roster
          break;
        // ... etc
      }
    },
  );
}
```

And on logout:

```dart
Future<void> onUserLogout(String authToken) async {
  await FCMService().deactivate(authToken);
}
```

---

### Step 7: Run Database Migrations

**Local Development:**
```bash
cd backend
npm run migrate
```

**Heroku Production:**
```bash
heroku run npm run migrate -a your-app-name
```

This creates 3 new tables:
- `push_tokens` - Stores device FCM tokens
- `notification_preferences` - User notification settings
- `notification_history` - Audit log

---

### Step 8: Test Push Notifications

**Option A: Send Test from Firebase Console**
1. Go to Firebase Console → Cloud Messaging
2. Click **"Send your first message"**
3. Enter a title and body
4. Click **"Send test message"**
5. Get FCM token from app logs: Look for `FCM Token: ...`
6. Paste token and click Test

**Option B: Trigger Real Notification**
1. Run the app on a physical device (iOS simulator doesn't support push)
2. Login to the app
3. Check backend logs - should see "Push token registered"
4. Perform an action that triggers notification:
   - Propose a trade to yourself (from another account)
   - Join a draft and make it your turn
   - Process a waiver claim

---

## iOS Additional Steps (For Production)

For iOS production push notifications, you need an APNs certificate:

1. Go to https://developer.apple.com/account/
2. Certificates, Identifiers & Profiles
3. Create a new certificate:
   - Type: Apple Push Notification service SSL (Production)
   - Select your App ID
4. Download the certificate
5. Upload to Firebase:
   - Firebase Console → Project Settings → Cloud Messaging
   - iOS app configuration
   - Upload APNs certificate

For development, Firebase handles this automatically.

---

## Testing Checklist

- [ ] Firebase project created
- [ ] iOS app added with `GoogleService-Info.plist`
- [ ] Android app added with `google-services.json`
- [ ] Service account JSON downloaded
- [ ] Backend `FIREBASE_SERVICE_ACCOUNT` env var set (Heroku)
- [ ] Flutter dependencies installed (`flutter pub get`)
- [ ] Database migrations run
- [ ] App successfully gets FCM token
- [ ] Backend logs show "Firebase Admin initialized"
- [ ] Test notification received on device

---

## Current Notification Events

These events automatically trigger push notifications (if user has them enabled):

**Draft:**
- It's your turn to pick
- Another team made a pick
- Draft completed

**Trades:**
- You received a trade proposal
- Your trade was accepted
- Your trade was declined

**Waivers:**
- Your waiver claim processed (success/fail)
- You were outbid on a player

**Matchups:**
- Your matchup started
- Your matchup ended (with result)
- Close game alert (Monday night, within 10 points)

**Players:**
- One of your players was injured
- Player status changed (Out, Questionable, etc.)

**League:**
- You were invited to a league
- League announcements

---

## Troubleshooting

**iOS notifications not showing:**
- Ensure you're testing on a physical device (not simulator)
- Check Push Notifications capability is enabled in Xcode
- Verify `GoogleService-Info.plist` is added to Runner target
- Check APNs certificate is uploaded (production only)

**Android notifications not showing:**
- Verify `google-services.json` is in `android/app/`
- Check package name matches Firebase console
- Ensure Google Play Services is installed
- Try uninstalling and reinstalling the app

**Backend errors:**
- Check `FIREBASE_SERVICE_ACCOUNT` environment variable is set
- Verify JSON file is valid (try parsing it)
- Check backend logs for Firebase initialization message

**Token not registered:**
- Make sure user is logged in
- Check network connectivity
- Verify API endpoint is reachable
- Check backend logs for token registration

---

## What Happens Without Firebase Setup

If you don't set up Firebase right away:
- Backend will log `[SIMULATED]` notifications instead of sending
- App will work normally, just no push notifications
- All other features work fine
- No errors or crashes

You can set it up later when ready!

---

## Support

If you run into issues, check:
1. Backend logs for Firebase initialization status
2. Flutter app logs for FCM token
3. Firebase Console → Cloud Messaging → Send test message
4. This guide's troubleshooting section
