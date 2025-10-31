/**
 * Jest Setup File
 * Runs before all tests to configure environment
 */

// Set test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-for-jest-tests-only';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/tbd_ff_test';
