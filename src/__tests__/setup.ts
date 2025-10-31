/**
 * Test Setup and Utilities
 * Global test configuration and helper functions
 */

import pool from '../config/database';

// Mock logger to prevent console spam during tests
jest.mock('../config/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Close database connections after all tests
afterAll(async () => {
  await pool.end();
});

// Helper function to create mock request
export const mockRequest = (overrides = {}) => {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides,
  } as any;
};

// Helper function to create mock response
export const mockResponse = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res;
};

// Helper function to create mock next
export const mockNext = () => jest.fn();

// Helper to wait for async operations
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock user for authenticated requests
export const mockAuthUser = {
  userId: 1,
  username: 'testuser',
  isAdmin: false,
};

// Mock admin user
export const mockAdminUser = {
  userId: 999,
  username: 'admin',
  isAdmin: true,
};
