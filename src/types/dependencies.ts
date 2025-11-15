/**
 * Dependency Injection Type Definitions
 *
 * This file defines interfaces for injectable dependencies used throughout the application.
 * These interfaces allow for easy mocking in tests while maintaining type safety.
 */

import { QueryResult, QueryResultRow } from 'pg';

/**
 * Database Client Interface
 *
 * Abstraction over pg.Pool for dependency injection
 */
export interface DatabaseClient {
  /**
   * Execute a SQL query
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query result with rows
   */
  query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
}

/**
 * Logger Interface
 *
 * Abstraction over winston logger for dependency injection
 */
export interface LoggerInterface {
  /**
   * Log informational message
   */
  info(message: string, meta?: any): void;

  /**
   * Log error message
   */
  error(message: string, meta?: any): void;

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void;

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void;
}

/**
 * Email Service Interface
 *
 * Abstraction over email service for dependency injection
 */
export interface EmailServiceInterface {
  /**
   * Send password reset email
   */
  sendPasswordResetEmail(
    email: string,
    username: string,
    resetToken: string
  ): Promise<void>;

  /**
   * Send league invite email (if implemented)
   */
  sendLeagueInvite?(
    email: string,
    leagueName: string,
    inviteCode: string
  ): Promise<void>;

  /**
   * Send draft start notification (if implemented)
   */
  sendDraftStartNotification?(
    email: string,
    leagueName: string,
    draftTime: Date
  ): Promise<void>;
}

/**
 * Push Notification Service Interface
 *
 * Abstraction over push notification service for dependency injection
 */
export interface PushNotificationInterface {
  /**
   * Send push notification to a single user
   */
  sendNotification(
    userId: number,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void>;

  /**
   * Send bulk notifications to multiple users
   */
  sendBulkNotifications(
    notifications: Array<{
      userId: number;
      title: string;
      body: string;
      data?: Record<string, any>;
    }>
  ): Promise<void>;
}

/**
 * External API Client Interface (for Sleeper API, etc.)
 */
export interface ExternalApiClient {
  /**
   * Make a GET request
   */
  get<T = any>(url: string, params?: Record<string, any>): Promise<T>;

  /**
   * Make a POST request
   */
  post<T = any>(url: string, data?: any): Promise<T>;
}

/**
 * Cache Interface (for Redis or in-memory cache)
 */
export interface CacheInterface {
  /**
   * Get value from cache
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * Set value in cache
   */
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;

  /**
   * Delete value from cache
   */
  del(key: string): Promise<void>;

  /**
   * Check if key exists
   */
  exists(key: string): Promise<boolean>;
}

/**
 * Transaction Client Interface
 *
 * Extends DatabaseClient to include transaction control methods
 */
export interface TransactionClient extends DatabaseClient {
  /**
   * Start a transaction
   */
  begin(): Promise<void>;

  /**
   * Commit a transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback a transaction
   */
  rollback(): Promise<void>;

  /**
   * Release the client back to the pool
   */
  release(): void;
}

/**
 * Service Dependencies Type
 *
 * Common dependencies used across many services
 */
export interface ServiceDependencies {
  db?: DatabaseClient;
  logger?: LoggerInterface;
  emailService?: EmailServiceInterface;
  pushService?: PushNotificationInterface;
  cache?: CacheInterface;
}
