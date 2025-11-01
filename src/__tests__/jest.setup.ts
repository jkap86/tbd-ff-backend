/**
 * Jest Setup File
 * Runs before all tests to configure environment
 */

// Set test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-for-jest-tests-only';
process.env.NODE_ENV = 'test';

// Use test database with credentials from main .env
// Format: postgresql://username:password@localhost:5432/database_name_test
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password123@localhost:5432/tbdff_test';
