# Password Reset Feature - Setup Guide

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install nodemailer @types/nodemailer
```

### 2. Create Database Table

Run the migration script to create the `password_reset_tokens` table:

```bash
cd backend
npx ts-node src/scripts/createPasswordResetTable.ts
```

### 3. Environment Variables

Add these to your `.env` file:

```env
# Email Configuration (Development - logs to console)
NODE_ENV=development

# Email Configuration (Production - actual SMTP)
# Uncomment and configure for production:
# NODE_ENV=production
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# SMTP_FROM="TBD Fantasy Football <noreply@tbdff.com>"
# FRONTEND_URL=http://localhost:3000
```

### 4. Gmail Setup (if using Gmail)

If using Gmail for production:

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the App Password as `SMTP_PASS`

## API Endpoints

### Request Password Reset
```
POST /api/auth/request-reset
Content-Type: application/json

{
  "email": "user@example.com"
}

Response (200 OK):
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

### Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "abc123...token-from-email",
  "newPassword": "newpassword123"
}

Response (200 OK):
{
  "success": true,
  "message": "Password has been reset successfully"
}

Error Responses:
- 400: Invalid or expired token
- 400: Password too short (< 6 characters)
```

## Development Mode

In development mode (`NODE_ENV=development`):
- Emails are NOT actually sent
- Reset links are logged to the console
- Check your backend console for the reset link after requesting a reset

Example console output:
```
📧 Password Reset Email (Development Mode):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: user@example.com
Subject: Password Reset Request - TBD Fantasy Football
Reset Link: http://localhost:3000/reset-password?token=abc123...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Production Mode

In production mode (`NODE_ENV=production`):
- Actual emails are sent via configured SMTP server
- Users receive HTML-formatted emails
- Tokens expire after 1 hour
- Used tokens cannot be reused

## Security Features

1. **Email Enumeration Protection**: Always returns success message, even if email doesn't exist
2. **Token Expiration**: Reset tokens expire after 1 hour
3. **One-Time Use**: Tokens can only be used once
4. **Token Invalidation**: Creating a new reset request invalidates previous unused tokens
5. **Password Hashing**: New passwords are hashed with bcrypt
6. **Confirmation Emails**: Users receive confirmation after password change

## Testing

### Manual Testing with cURL

1. Request password reset:
```bash
curl -X POST http://localhost:5000/api/auth/request-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

2. Copy token from console output (dev mode)

3. Reset password:
```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_HERE","newPassword":"newpass123"}'
```

## Maintenance

### Clean Up Expired Tokens

Periodically clean up expired tokens (optional - can be run as a cron job):

```typescript
import { deleteExpiredTokens } from "./models/PasswordReset";

// Run this periodically (e.g., daily)
await deleteExpiredTokens();
```

## Files Created

Backend files:
- `src/scripts/createPasswordResetTable.ts` - Database migration
- `src/models/PasswordReset.ts` - Password reset token model
- `src/services/emailService.ts` - Email sending service
- `src/controllers/authController.ts` - Added requestPasswordReset, resetPassword
- `src/routes/authRoutes.ts` - Added password reset routes
- `src/models/User.ts` - Added updateUserPassword function

## Next Steps

See Flutter app documentation for frontend implementation.
