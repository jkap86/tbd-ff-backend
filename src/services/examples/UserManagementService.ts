/**
 * User Management Service - Example Service Using DI Container
 *
 * This service demonstrates best practices for using the DI Container pattern:
 * - Constructor injection of dependencies
 * - Using repositories from container
 * - Using EventBus for real-time notifications
 * - Proper error handling and logging
 * - Testable design
 */

import { IEventBus } from '../../interfaces/IEventBus';
import { UserRepository } from '../../repositories/UserRepository';
import { LoggerInterface } from '../../types/dependencies';

export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
}

export interface UpdateUserDTO {
  username?: string;
  email?: string;
}

export class UserManagementService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: IEventBus,
    private readonly logger: LoggerInterface,
    private readonly passwordHasher: (password: string) => Promise<string>
  ) {}

  /**
   * Create a new user
   */
  async createUser(data: CreateUserDTO): Promise<any> {
    this.logger.info('Creating new user', { username: data.username });

    try {
      // Validate username doesn't exist
      const usernameExists = await this.userRepository.usernameExists(data.username);
      if (usernameExists) {
        throw new Error('Username already exists');
      }

      // Validate email doesn't exist
      const emailExists = await this.userRepository.emailExists(data.email);
      if (emailExists) {
        throw new Error('Email already exists');
      }

      // Hash password
      await this.passwordHasher(data.password);

      // Create user (Note: in real implementation, password_hash would be passed to create)
      const user = await this.userRepository.create({
        username: data.username,
        email: data.email,
      } as any);

      this.logger.info('User created successfully', { userId: user.id });

      // Emit event for real-time updates
      this.eventBus.emit('user:created', {
        userId: user.id,
        username: user.username,
      });

      return user;
    } catch (error: any) {
      this.logger.error('Failed to create user', {
        username: data.username,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<any> {
    this.logger.debug('Fetching user by ID', { userId });

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user
   */
  async updateUser(userId: number, data: UpdateUserDTO): Promise<any> {
    this.logger.info('Updating user', { userId, updates: data });

    try {
      // Validate user exists
      const existingUser = await this.userRepository.findById(userId);
      if (!existingUser) {
        throw new Error('User not found');
      }

      // Validate username if changing
      if (data.username && data.username !== existingUser.username) {
        const usernameExists = await this.userRepository.usernameExists(data.username);
        if (usernameExists) {
          throw new Error('Username already exists');
        }
      }

      // Validate email if changing
      if (data.email && data.email !== existingUser.email) {
        const emailExists = await this.userRepository.emailExists(data.email);
        if (emailExists) {
          throw new Error('Email already exists');
        }
      }

      // Update user
      const updatedUser = await this.userRepository.update(userId, data);

      if (!updatedUser) {
        throw new Error('Failed to update user');
      }

      this.logger.info('User updated successfully', { userId });

      // Emit event
      this.eventBus.emit('user:updated', {
        userId: updatedUser.id,
        changes: data,
      });

      return updatedUser;
    } catch (error: any) {
      this.logger.error('Failed to update user', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Search users
   */
  async searchUsers(query: string): Promise<any[]> {
    this.logger.debug('Searching users', { query });

    const users = await this.userRepository.search(query);

    return users;
  }

  /**
   * Change user password
   */
  async changePassword(userId: number, newPassword: string): Promise<void> {
    this.logger.info('Changing user password', { userId });

    try {
      // Validate user exists
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const passwordHash = await this.passwordHasher(newPassword);

      // Update password
      await this.userRepository.updatePassword(userId, passwordHash);

      this.logger.info('Password changed successfully', { userId });

      // Emit event
      this.eventBus.emitToUser(userId, 'password:changed', {
        timestamp: new Date(),
      });
    } catch (error: any) {
      this.logger.error('Failed to change password', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }
}

/**
 * Factory function for creating UserManagementService from container
 */
export function createUserManagementService(
  userRepository: UserRepository,
  eventBus: IEventBus,
  logger: LoggerInterface,
  passwordHasher: (password: string) => Promise<string>
): UserManagementService {
  return new UserManagementService(
    userRepository,
    eventBus,
    logger,
    passwordHasher
  );
}
