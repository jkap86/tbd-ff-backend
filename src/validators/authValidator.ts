import { body, ValidationChain } from "express-validator";

// Validation rules for registration
export const registerValidator: ValidationChain[] = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be between 3 and 20 characters")
    .isAlphanumeric()
    .withMessage("Username must contain only letters and numbers")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores")
    .custom((value) => {
      const reserved = ["admin", "root", "system", "api", "null", "undefined"];
      if (reserved.includes(value.toLowerCase())) {
        throw new Error("This username is reserved");
      }
      return true;
    }),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)"
    )
    .custom((value, { req }) => {
      // Ensure password is not similar to username or email
      const username = req.body.username?.toLowerCase();
      const email = req.body.email?.toLowerCase().split("@")[0];
      const passwordLower = value.toLowerCase();

      if (username && passwordLower.includes(username)) {
        throw new Error("Password must not contain your username");
      }
      if (email && passwordLower.includes(email)) {
        throw new Error("Password must not contain your email");
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
