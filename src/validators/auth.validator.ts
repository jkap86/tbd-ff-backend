import { body } from 'express-validator';

/**
 * Validation rules for user registration
 */
export const registerValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .isAlphanumeric()
    .withMessage('Username must contain only letters and numbers')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must not exceed 255 characters'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    )
    .custom((value, { req }) => {
      // Ensure password is not similar to username or email
      const username = req.body.username?.toLowerCase();
      const email = req.body.email?.toLowerCase().split('@')[0];
      const passwordLower = value.toLowerCase();

      if (username && passwordLower.includes(username)) {
        throw new Error('Password must not contain your username');
      }
      if (email && passwordLower.includes(email)) {
        throw new Error('Password must not contain your email');
      }
      return true;
    }),
];

/**
 * Validation rules for user login
 */
export const loginValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username or email is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('Username or email must be between 3 and 255 characters'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 1, max: 128 })
    .withMessage('Password must not exceed 128 characters'),
];

/**
 * Validation rules for password reset request
 */
export const passwordResetRequestValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must not exceed 255 characters'),
];

/**
 * Validation rules for password reset (with token)
 */
export const passwordResetValidator = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Reset token is required')
    .isLength({ min: 32, max: 256 })
    .withMessage('Invalid reset token'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    ),
];

/**
 * Validation rules for token refresh
 */
export const refreshTokenValidator = [
  body('refreshToken')
    .trim()
    .notEmpty()
    .withMessage('Refresh token is required')
    .isJWT()
    .withMessage('Invalid refresh token format'),
];
