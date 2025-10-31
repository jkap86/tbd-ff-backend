import { body, ValidationChain } from "express-validator";

// Validation rules for registration
export const registerValidator: ValidationChain[] = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Username can only contain letters, numbers, underscores, and hyphens")
    .custom((value) => {
      const reserved = ["admin", "root", "system", "api", "null", "undefined"];
      if (reserved.includes(value.toLowerCase())) {
        throw new Error("This username is reserved");
      }
      return true;
    }),

  body("email")
    .trim()
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email must be less than 255 characters"),

  body("password")
    .isLength({ min: 12, max: 128 })
    .withMessage("Password must be at least 12 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage(
      "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (@$!%*?&)"
    )
    .custom((value, { req }) => {
      const username = req.body.username?.toLowerCase();
      const email = req.body.email?.toLowerCase();
      const passwordLower = value.toLowerCase();

      // Reject if password contains username
      if (username && passwordLower.includes(username)) {
        throw new Error("Password cannot contain username");
      }

      // Reject if password contains email local part
      if (email) {
        const emailLocal = email.split('@')[0];
        if (passwordLower.includes(emailLocal)) {
          throw new Error("Password cannot contain email");
        }
      }

      // Reject common passwords
      const commonPasswords = ['password', 'qwerty', 'admin', 'letmein', 'welcome'];
      if (commonPasswords.some(common => passwordLower.includes(common))) {
        throw new Error("Password is too common");
      }

      return true;
    }),

  body("phone_number")
    .optional({ nullable: true })
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Must be a valid phone number in E.164 format"),

  body("first_name")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("First name must be less than 50 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("First name can only contain letters, spaces, hyphens, and apostrophes"),

  body("last_name")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Last name must be less than 50 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("Last name can only contain letters, spaces, hyphens, and apostrophes"),
];

// Validation rules for login
export const loginValidator: ValidationChain[] = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ max: 255 })
    .withMessage("Username too long"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ max: 128 })
    .withMessage("Password too long"),
];

// Validation for password reset request
export const resetRequestValidator: ValidationChain[] = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail(),
];

// Validation for password reset
export const resetPasswordValidator: ValidationChain[] = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("Reset token is required")
    .isLength({ min: 32, max: 256 })
    .withMessage("Invalid token format"),

  body("newPassword")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, " +
      "one uppercase letter, and one number"
    ),
];
