import { BaseRepository } from "../models/BaseRepository";
import { User } from "../models/User";
import { logger } from "../config/logger";
import { escapeLikePattern } from "../utils/sqlHelpers";

/**
 * UserRepository - Centralized repository for all user-related queries
 *
 * This repository extends BaseRepository to provide:
 * - Standard CRUD operations (inherited from BaseRepository)
 * - User authentication queries
 * - User search functionality
 * - Email and username lookups
 * - Password management
 *
 * Benefits:
 * - Centralizes all user data access logic
 * - Provides consistent error handling
 * - Enables easier testing via dependency injection
 * - Reduces code duplication across controllers
 */
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users', 'id');
  }

  /**
   * Search users by username or email
   * Case-insensitive search
   *
   * @param query - Search query string
   * @param limit - Maximum number of results
   * @returns Array of matching users
   */
  async search(query: string, limit: number = 10): Promise<User[]> {
    try {
      const escapedQuery = escapeLikePattern(query);
      const searchQuery = `
        SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
        FROM users
        WHERE username ILIKE $1 OR email ILIKE $1
        ORDER BY username ASC
        LIMIT $2
      `;

      const result = await this.query(searchQuery, [`%${escapedQuery}%`, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error searching users:', { query, limit, error });
      throw new Error('Failed to search users');
    }
  }

  /**
   * Get user by username
   * Case-insensitive lookup
   *
   * @param username - The username to search for
   * @returns User or null if not found
   */
  async getByUsername(username: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `;

      const result = await this.query(query, [username]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting user by username:', { username, error });
      throw new Error('Failed to get user by username');
    }
  }

  /**
   * Get user by username with password hash
   * Used for authentication
   *
   * @param username - The username
   * @returns User with password_hash field or null
   */
  async getByUsernameWithPassword(
    username: string
  ): Promise<(User & { password_hash: string }) | null> {
    try {
      const query = `
        SELECT id, username, email, phone_number, is_phone_verified, is_admin, password_hash, created_at, updated_at
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `;

      const result = await this.query<User & { password_hash: string }>(query, [username]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting user by username with password:', { username, error });
      throw new Error('Failed to get user by username with password');
    }
  }

  /**
   * Get user by email
   * Case-insensitive lookup
   *
   * @param email - The email address
   * @returns User or null if not found
   */
  async getByEmail(email: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `;

      const result = await this.query(query, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting user by email:', { email, error });
      throw new Error('Failed to get user by email');
    }
  }

  /**
   * Update user password
   *
   * @param userId - The user ID
   * @param passwordHash - New password hash
   */
  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    try {
      const query = `
        UPDATE users
        SET password_hash = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await this.query(query, [passwordHash, userId]);

      logger.debug('Updated user password', { userId });
    } catch (error) {
      logger.error('Error updating user password:', { userId, error });
      throw new Error('Failed to update user password');
    }
  }

  /**
   * Update user email
   *
   * @param userId - The user ID
   * @param email - New email address
   * @returns Updated user
   */
  async updateEmail(userId: number, email: string): Promise<User> {
    try {
      const query = `
        UPDATE users
        SET email = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      `;

      const result = await this.query(query, [email, userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.debug('Updated user email', { userId, email });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user email:', { userId, email, error });
      throw new Error('Failed to update user email');
    }
  }

  /**
   * Update user phone number
   *
   * @param userId - The user ID
   * @param phoneNumber - New phone number
   * @returns Updated user
   */
  async updatePhoneNumber(userId: number, phoneNumber: string | null): Promise<User> {
    try {
      const query = `
        UPDATE users
        SET phone_number = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      `;

      const result = await this.query(query, [phoneNumber, userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.debug('Updated user phone number', { userId, phoneNumber });

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user phone number:', { userId, phoneNumber, error });
      throw new Error('Failed to update user phone number');
    }
  }

  /**
   * Mark user phone as verified
   *
   * @param userId - The user ID
   * @returns Updated user
   */
  async markPhoneAsVerified(userId: number): Promise<User> {
    try {
      const query = `
        UPDATE users
        SET is_phone_verified = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      `;

      const result = await this.query(query, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info('Marked user phone as verified', { userId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error marking phone as verified:', { userId, error });
      throw new Error('Failed to mark phone as verified');
    }
  }

  /**
   * Check if username is taken
   *
   * @param username - The username to check
   * @returns True if username exists
   */
  async usernameExists(username: string): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM users
          WHERE LOWER(username) = LOWER($1)
        ) as exists
      `;

      const result = await this.query(query, [username]);
      return result.rows[0].exists;
    } catch (error) {
      logger.error('Error checking if username exists:', { username, error });
      throw new Error('Failed to check if username exists');
    }
  }

  /**
   * Check if email is taken
   *
   * @param email - The email to check
   * @returns True if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM users
          WHERE LOWER(email) = LOWER($1)
        ) as exists
      `;

      const result = await this.query(query, [email]);
      return result.rows[0].exists;
    } catch (error) {
      logger.error('Error checking if email exists:', { email, error });
      throw new Error('Failed to check if email exists');
    }
  }

  /**
   * Get all admin users
   *
   * @returns Array of admin users
   */
  async getAdmins(): Promise<User[]> {
    try {
      return await this.findBy('is_admin', true, 'username ASC');
    } catch (error) {
      logger.error('Error getting admin users:', { error });
      throw new Error('Failed to get admin users');
    }
  }

  /**
   * Set user admin status
   *
   * @param userId - The user ID
   * @param isAdmin - Whether user should be admin
   * @returns Updated user
   */
  async setAdminStatus(userId: number, isAdmin: boolean): Promise<User> {
    try {
      const query = `
        UPDATE users
        SET is_admin = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, username, email, phone_number, is_phone_verified, is_admin, created_at, updated_at
      `;

      const result = await this.query(query, [isAdmin, userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info('Updated user admin status', { userId, isAdmin });

      return result.rows[0];
    } catch (error) {
      logger.error('Error setting admin status:', { userId, isAdmin, error });
      throw new Error('Failed to set admin status');
    }
  }

  /**
   * Get total user count
   *
   * @returns Total number of users
   */
  async getTotalCount(): Promise<number> {
    try {
      return await this.count();
    } catch (error) {
      logger.error('Error getting total user count:', { error });
      throw new Error('Failed to get total user count');
    }
  }
}

/**
 * Export singleton instance for use throughout the application
 * In the future, this will be managed by the DI container
 */
export const userRepository = new UserRepository();
