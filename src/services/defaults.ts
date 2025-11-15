/**
 * Default Dependency Implementations
 *
 * This file provides default implementations of injectable dependencies.
 * These are used as default parameters in service constructors/factories.
 */

import pool from '../config/database';
import { logger } from '../config/logger';
import * as emailService from './emailService';
import {
  DatabaseClient,
  LoggerInterface,
  EmailServiceInterface,
} from '../types/dependencies';

/**
 * Default Database Client
 *
 * Wraps the global pool for dependency injection
 */
export const defaultDbClient: DatabaseClient = {
  query: <T extends import('pg').QueryResultRow = any>(sql: string, params?: any[]) => pool.query<T>(sql, params),
};

/**
 * Default Logger
 *
 * Wraps the global logger for dependency injection
 */
export const defaultLogger: LoggerInterface = {
  info: (message: string, meta?: any) => logger.info(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
};

/**
 * Default Email Service
 *
 * Wraps the email service for dependency injection
 */
export const defaultEmailService: EmailServiceInterface = {
  sendPasswordResetEmail: (email: string, username: string, resetToken: string) =>
    emailService.sendPasswordResetEmail(email, username, resetToken),
};

/**
 * No-op Email Service (for testing/development)
 *
 * Email service that doesn't send emails, just logs
 */
export const noopEmailService: EmailServiceInterface = {
  sendPasswordResetEmail: async (email: string, username: string, _resetToken: string) => {
    logger.info(`[NOOP] Would send password reset email to ${email} for user ${username}`);
  },
};
