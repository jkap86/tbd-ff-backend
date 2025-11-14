/**
 * Mock Factory Functions for Dependency Injection Testing
 *
 * This file provides factory functions to create mock implementations
 * of injectable dependencies for use in unit tests.
 */

import {
  DatabaseClient,
  LoggerInterface,
  EmailServiceInterface,
  PushNotificationInterface,
} from '../../types/dependencies';

/**
 * Create a mock database client
 *
 * @param mockReturnValue - Optional default return value for queries
 * @returns Mock database client with jest.fn() methods
 */
export function createMockDb(mockReturnValue: any = { rows: [] }): DatabaseClient & { querySpy: jest.Mock } {
  const querySpy = jest.fn().mockResolvedValue(mockReturnValue);

  return {
    query: querySpy,
    querySpy, // Expose for easier assertions
  };
}

/**
 * Create a spy database client that tracks queries
 *
 * Useful when you want to verify specific queries were made
 *
 * @param returnValue - What the query should return
 * @returns Database client with exposed spy
 */
export function createSpyDb(returnValue: any = { rows: [] }): DatabaseClient & { querySpy: jest.Mock } {
  return createMockDb(returnValue);
}

/**
 * Create a mock database client that returns different values for sequential calls
 *
 * @param returnValues - Array of values to return for each call
 * @returns Mock database client
 */
export function createMockDbWithSequence(returnValues: any[]): DatabaseClient & { querySpy: jest.Mock } {
  const querySpy = jest.fn();

  returnValues.forEach((value) => {
    querySpy.mockResolvedValueOnce(value);
  });

  return {
    query: querySpy,
    querySpy,
  };
}

/**
 * Create a mock logger
 *
 * All methods are jest.fn() that can be used for assertions
 *
 * @returns Mock logger with spy methods
 */
export function createMockLogger(): LoggerInterface & {
  infoSpy: jest.Mock;
  errorSpy: jest.Mock;
  warnSpy: jest.Mock;
  debugSpy: jest.Mock;
} {
  const infoSpy = jest.fn();
  const errorSpy = jest.fn();
  const warnSpy = jest.fn();
  const debugSpy = jest.fn();

  return {
    info: infoSpy,
    error: errorSpy,
    warn: warnSpy,
    debug: debugSpy,
    infoSpy,
    errorSpy,
    warnSpy,
    debugSpy,
  };
}

/**
 * Create a silent logger that doesn't output anything
 *
 * Useful when you don't care about logging in tests
 *
 * @returns Logger with no-op methods
 */
export function createSilentLogger(): LoggerInterface {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };
}

/**
 * Create a mock email service
 *
 * All methods are jest.fn() that resolve successfully
 *
 * @returns Mock email service
 */
export function createMockEmailService(): EmailServiceInterface & {
  sendPasswordResetEmailSpy: jest.Mock;
} {
  const sendPasswordResetEmailSpy = jest.fn().mockResolvedValue(undefined);

  return {
    sendPasswordResetEmail: sendPasswordResetEmailSpy,
    sendPasswordResetEmailSpy,
  };
}

/**
 * Create a mock push notification service
 *
 * All methods are jest.fn() that resolve successfully
 *
 * @returns Mock push notification service
 */
export function createMockPushService(): PushNotificationInterface & {
  sendNotificationSpy: jest.Mock;
  sendBulkNotificationsSpy: jest.Mock;
} {
  const sendNotificationSpy = jest.fn().mockResolvedValue(undefined);
  const sendBulkNotificationsSpy = jest.fn().mockResolvedValue(undefined);

  return {
    sendNotification: sendNotificationSpy,
    sendBulkNotifications: sendBulkNotificationsSpy,
    sendNotificationSpy,
    sendBulkNotificationsSpy,
  };
}

/**
 * Create a failing database client
 *
 * Useful for testing error handling
 *
 * @param error - Error to throw
 * @returns Database client that always rejects
 */
export function createFailingDb(error: Error = new Error('Database error')): DatabaseClient {
  return {
    query: jest.fn().mockRejectedValue(error),
  };
}

/**
 * Create a database client that fails on specific query
 *
 * @param failingQueryPattern - Regex pattern to match failing queries
 * @param error - Error to throw for matching queries
 * @param defaultReturn - What to return for non-failing queries
 * @returns Conditional failing database client
 */
export function createConditionalFailingDb(
  failingQueryPattern: RegExp,
  error: Error = new Error('Database error'),
  defaultReturn: any = { rows: [] }
): DatabaseClient {
  return {
    query: jest.fn((sql: string) => {
      if (failingQueryPattern.test(sql)) {
        return Promise.reject(error);
      }
      return Promise.resolve(defaultReturn);
    }),
  };
}

/**
 * Helper to create mock data for common scenarios
 */
export const mockData = {
  /**
   * Create mock roster data
   */
  roster: (overrides: Partial<any> = {}) => ({
    id: 1,
    league_id: 1,
    user_id: 100,
    roster_id: 1,
    starters: [],
    bench: [],
    taxi: [],
    ir: [],
    faab_budget: 100,
    settings: {},
    ...overrides,
  }),

  /**
   * Create mock matchup data
   */
  matchup: (overrides: Partial<any> = {}) => ({
    id: 1,
    league_id: 1,
    week: 1,
    season: '2025',
    roster1_id: 1,
    roster2_id: 2,
    roster1_score: 100.5,
    roster2_score: 95.3,
    status: 'completed',
    finalized: false,
    ...overrides,
  }),

  /**
   * Create mock player stats data
   */
  playerStats: (overrides: Partial<any> = {}) => ({
    player_id: '1001',
    season: '2025',
    week: 1,
    season_type: 'regular',
    passing_yards: 0,
    passing_touchdowns: 0,
    rushing_yards: 0,
    rushing_touchdowns: 0,
    receiving_yards: 0,
    receiving_touchdowns: 0,
    receiving_receptions: 0,
    ...overrides,
  }),

  /**
   * Create mock league data
   */
  league: (overrides: Partial<any> = {}) => ({
    id: 1,
    name: 'Test League',
    season: '2025',
    season_type: 'regular',
    league_type: 'redraft',
    total_rosters: 10,
    settings: {
      commissioner_id: 100,
      start_week: 1,
      playoff_week_start: 15,
    },
    scoring_settings: {},
    roster_positions: [],
    ...overrides,
  }),
};

/**
 * Helper to create a mock query result
 */
export function createQueryResult<T = any>(rows: T[], rowCount?: number) {
  return {
    rows,
    rowCount: rowCount !== undefined ? rowCount : rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}
