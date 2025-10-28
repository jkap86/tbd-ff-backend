import rateLimit from "express-rate-limit";

/**
 * Rate Limiting Configuration
 *
 * Multi-layer rate limiting strategy:
 * 1. Global API limit - prevents resource exhaustion
 * 2. Auth limits - prevents brute force attacks
 * 3. Public endpoint limits - prevents data scraping
 */

/**
 * Global API rate limiter
 * Applied to all /api routes
 * Prevents general abuse and DDoS attacks
 */
export const globalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // 100 requests per minute per IP
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for successful requests (optional - adjust based on needs)
  skipSuccessfulRequests: false,
  // Skip rate limiting for failed requests (optional)
  skipFailedRequests: false,
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks on login, registration, and password reset
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 5, // 5 requests per window per IP
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Track failed attempts more strictly
  skipSuccessfulRequests: false,
});

/**
 * Moderate rate limiter for password reset requests
 * More restrictive than general auth to prevent email spam
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // 3 requests per hour per IP
  message: {
    success: false,
    message: "Too many password reset requests. Please try again in 1 hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for public data endpoints
 * Prevents data scraping and excessive queries
 */
export const publicDataLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // 30 requests per minute per IP
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for search endpoints
 * Prevents search abuse and excessive database queries
 */
export const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 20, // 20 searches per minute per IP
  message: {
    success: false,
    message: "Too many search requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for player sync/bulk operations
 * Very strict to prevent abuse of resource-intensive operations
 */
export const bulkOperationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: 5, // 5 requests per 5 minutes per IP
  message: {
    success: false,
    message: "Too many bulk operations. Please wait 5 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
