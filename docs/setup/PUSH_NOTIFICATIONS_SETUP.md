# Push Notifications Setup Guide

This guide explains how to complete the Firebase Cloud Messaging (FCM) setup for push notifications.

## Current Status

✅ **Database Schema** - Complete (migrations 056-058)
✅ **Backend API** - Complete (notification service, controllers, routes)
✅ **Flutter Models & Services** - Complete
🔲 **Firebase Project Setup** - Needs configuration
🔲 **Firebase Admin SDK** - Needs installation
🔲 **Flutter FCM Integration** - Needs dependencies

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Enter project name: "TBD Fantasy Football"
4. Disable Google Analytics (optional)
5. Create project

---

## Step 2: Add iOS App to Firebase

1. In Firebase Console, click "Add app" → iOS
2. iOS bundle ID: `com.yourcompany.tbd-ff` (match what's in `ios/Runner.xcodeproj`)
3. Download `GoogleService-Info.plist`
4. Add to `flutter_app/ios/Runner/` in Xcode
5. In Xcode:
   - Open `ios/Runner.xcworkspace`
   - Select Runner → Signing & Capabilities
   - Click "+ Capability" → Push Notifications
   - Click "+ Capability" → Background Modes
   - Check "Remote notifications"

---

## Step 3: Add Android App to Firebase

1. In Firebase Console, click "Add app" → Android
2. Android package name: `com.yourcompany.tbd_ff` (match what's in `android/app/build.gradle`)
3. Download `google-services.json`
4. Place in `flutter_app/android/app/`
5. Edit `android/app/build.gradle`:
   ```gradle
   plugins {
       id "com.android.application"
       id "kotlin-android"
       id "dev.flutter.flutter-gradle-plugin"
       id "com.google.gms.google-services"  // ADD THIS LINE
   }
   ```
6. Edit `android/build.gradle`:
   ```gradle
   dependencies {
       classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
       classpath "com.google.gms:google-services:4.4.0"  // ADD THIS LINE
   }
   ```

---

## Step 4: Generate Service Account Key (Backend)

1. In Firebase Console, go to Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Save as `backend/firebase-service-account.json`
5. Add to `.gitignore`:
   ```
   firebase-service-account.json
   ```
6. For Heroku production:
   ```bash
   heroku config:set FIREBASE_SERVICE_ACCOUNT="$(cat backend/firebase-service-account.json)"
   ```

---

## Step 5: Install Backend Dependencies

```bash
cd backend
npm install firebase-admin
```

Update `backend/src/services/pushNotificationService.ts`:

Replace the TODO comment with:

```typescript
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (add at top of file, run once)
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('../../firebase-service-account.json');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// In sendPushNotification function, replace the simulation code:
await admin.messaging().send({
  token: tokenData.token,
  notification: {
    title: payload.title,
    body: payload.body,
    imageUrl: payload.imageUrl
  },
  data: payload.data || {},
  apns: {
    payload: {
      aps: {
        sound: 'default',
        badge: 1
      }
    }
  },
  android: {
    priority: 'high',
    notification: {
      sound: 'default',
      channelId: 'default'
    }
  }
});
```

---

## Step 6: Update Flutter Dependencies

Add to `flutter_app/pubspec.yaml`:

```yaml
dependencies:
  # Push Notifications
  firebase_core: ^2.24.2
  firebase_messaging: ^14.7.9
  flutter_local_notifications: ^16.3.0
```

Run:
```bash
cd flutter_app
flutter pub get
```

---

## Step 7: Create Flutter FCM Handler

Create `flutter_app/lib/services/fcm_service.dart`:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'dart:io';
import 'notification_service.dart';

// Background message handler (must be top-level function)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print('Handling background message: ${message.messageId}');
}

class FCMService {
  static final FCMService _instance = FCMService._internal();
  factory FCMService() => _instance;
  FCMService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  Future<void> initialize(String authToken) async {
    // Request permission
    NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus != AuthorizationStatus.authorized) {
      print('User declined notifications');
      return;
    }

    // Initialize local notifications
    const AndroidInitializationSettings androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const DarwinInitializationSettings iosSettings =
        DarwinInitializationSettings();

    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // Get FCM token
    String? token = await _messaging.getToken();
    if (token != null) {
      print('FCM Token: $token');

      // Register token with backend
      final deviceType = Platform.isIOS ? 'ios' : 'android';
      await NotificationService().registerPushToken(
        token: token,
        deviceType: deviceType,
        authToken: authToken,
      );
    }

    // Listen for token refresh
    _messaging.onTokenRefresh.listen((newToken) async {
      final deviceType = Platform.isIOS ? 'ios' : 'android';
      await NotificationService().registerPushToken(
        token: newToken,
        deviceType: deviceType,
        authToken: authToken,
      );
    });

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle background messages
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Handle notification taps
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
  }

  void _handleForegroundMessage(RemoteMessage message) {
    print('Foreground message: ${message.notification?.title}');

    // Show local notification
    _localNotifications.show(
      message.hashCode,
      message.notification?.title,
      message.notification?.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'default',
          'Default',
          importance: Importance.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  void _handleNotificationTap(RemoteMessage message) {
    print('Notification tapped: ${message.data}');
    // TODO: Navigate to appropriate screen based on message.data['screen']
  }

  void _onNotificationTap(NotificationResponse response) {
    print('Local notification tapped');
  }
}
```

---

## Step 8: Initialize FCM in Flutter

Update `flutter_app/lib/main.dart`:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'services/fcm_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp();

  runApp(const MyApp());
}

// In your app, after user logs in:
Future<void> onUserLogin(String authToken) async {
  await FCMService().initialize(authToken);
}
```

---

## Step 9: Run Database Migrations

```bash
cd backend
npm run migrate
```

For Heroku production:
```bash
heroku run npm run migrate -a your-app-name
```

---

## Step 10: Test Notifications

1. Run the app in debug mode
2. Check console for "FCM Token: ..."
3. Use Firebase Console → Cloud Messaging → Send test message
4. Or trigger a notification event (e.g., propose a trade)

---

## Notification Events Currently Configured

The following events will trigger push notifications:

- **Draft**: Your turn, other picks, draft completed
- **Trades**: Proposed, accepted, declined
- **Waivers**: Claim processed, outbid
- **Matchups**: Started, ended, close game
- **Players**: Injury updates, status changes
- **League**: Announcements, invites

Users can customize which notifications they receive in Settings.

---

## Next Steps

1. Complete Firebase project setup
2. Install Firebase Admin SDK in backend
3. Add FCM dependencies to Flutter
4. Test on physical devices (iOS push notifications don't work on simulator)
5. Configure APNs certificates for iOS production

---

## Troubleshooting

**iOS notifications not working:**
- Ensure Push Notifications capability is enabled
- Check APNs certificate is uploaded to Firebase
- Test on physical device (simulator doesn't support push)

**Android notifications not working:**
- Verify `google-services.json` is in correct location
- Check app package name matches Firebase console
- Ensure Google Play Services is installed on device

**Backend errors:**
- Check `FIREBASE_SERVICE_ACCOUNT` environment variable is set
- Verify service account JSON is valid
- Check Firebase Admin SDK is installed
