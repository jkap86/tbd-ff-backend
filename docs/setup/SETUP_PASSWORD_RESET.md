# Password Reset Feature - Complete Setup Guide

## Overview
Users can now reset their passwords via email if they forget them. The system generates secure, time-limited tokens and sends reset links via email.

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install nodemailer @types/nodemailer
```

### 2. Run Database Migration
Create the password_reset_tokens table:
```bash
cd backend
npx ts-node src/scripts/createPasswordResetTable.ts
```

### 3. Configure Environment Variables
Add to `.env`:

```env
# Development Mode (emails logged to console)
NODE_ENV=development

# Production Mode (uncomment and configure for actual emails)
# NODE_ENV=production
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-gmail-app-password
# SMTP_FROM="TBD Fantasy Football <noreply@tbdff.com>"
# FRONTEND_URL=http://localhost:3000
```

### 4. Start Backend
```bash
cd backend
npm run dev
```

## Frontend Setup

### 1. Ensure HTTP Package
The Flutter app should already have `http` package. If not:
```bash
cd flutter_app
flutter pub add http
```

### 2. Start Flutter App
```bash
cd flutter_app
flutter run
```

## How It Works

### User Flow:
1. User clicks "Forgot Password?" on login screen
2. Enters their email address
3. Receives email with reset link (in dev mode, link is in console)
4. Clicks link (opens reset password screen)
5. Enters new password twice
6. Password is reset successfully
7. User can log in with new password

### Security Features:
- Tokens expire after 1 hour
- Tokens can only be used once
- Email enumeration protection (always shows success message)
- Passwords are bcrypt hashed
- Confirmation emails sent after successful reset

## Testing the Feature

### Development Mode Testing:

1. **Start Backend** (make sure NODE_ENV=development):
   ```bash
   cd backend
   npm run dev
   ```

2. **Request Password Reset**:
   - Open Flutter app
   - Click "Forgot Password?"
   - Enter a registered user's email
   - Click "Send Reset Link"

3. **Get Reset Token**:
   - Check your backend console
   - Look for output like:
   ```
   📧 Password Reset Email (Development Mode):
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   To: user@example.com
   Subject: Password Reset Request
   Reset Link: http://localhost:3000/reset-password?token=ABC123...
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
   - Copy the token from the URL (everything after `token=`)

4. **Reset Password**:
   - In the Flutter app, manually navigate to reset password screen
   - Or use a deep link if configured
   - Enter the token and new password
   - Submit

5. **Verify**:
   - Try logging in with the new password
   - Should work!

### Production Mode Testing:

1. Configure SMTP settings in `.env`
2. Set `NODE_ENV=production`
3. Restart backend
4. User will receive actual emails with clickable links

## API Endpoints

### Request Password Reset
```
POST /api/auth/request-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "abc123...",
  "newPassword": "newpassword123"
}
```

## Files Created/Modified

### Backend:
- ✅ `src/scripts/createPasswordResetTable.ts` - Database migration
- ✅ `src/models/PasswordReset.ts` - Token management
- ✅ `src/services/emailService.ts` - Email sending
- ✅ `src/models/User.ts` - Added updateUserPassword()
- ✅ `src/controllers/authController.ts` - Added password reset handlers
- ✅ `src/routes/authRoutes.ts` - Added routes
- ✅ `backend/PASSWORD_RESET_SETUP.md` - Detailed backend docs

### Frontend:
- ✅ `lib/screens/forgot_password_screen.dart` - Request reset UI
- ✅ `lib/screens/reset_password_screen.dart` - Reset password UI
- ✅ `lib/screens/login_screen.dart` - Added "Forgot Password?" link

## Troubleshooting

### Emails not sending (Production):
- Check SMTP credentials are correct
- For Gmail: Use App Password, not regular password
- Check firewall isn't blocking port 587
- Verify SMTP_HOST is correct

### Token invalid/expired:
- Tokens expire after 1 hour
- Request a new reset link
- Check system time is correct

### Can't find reset link in dev mode:
- Check backend console output
- Make sure NODE_ENV=development
- Look for the 📧 emoji in console

### Password reset not working:
- Check backend logs for errors
- Verify database migration ran successfully
- Ensure backend is running and accessible
- Check network requests in Flutter dev tools

## Next Steps

1. Configure production SMTP for real emails
2. (Optional) Add rate limiting to prevent abuse
3. (Optional) Set up email templates with your branding
4. (Optional) Add deep linking in Flutter for reset links
5. (Optional) Add password strength indicator

## Deep Linking (Optional Future Enhancement)

To handle reset links from emails directly in the app:
1. Configure Flutter deep linking
2. Handle `reset-password?token=...` route
3. Extract token and navigate to ResetPasswordScreen

For now, users can manually paste tokens or you can test in development mode.
