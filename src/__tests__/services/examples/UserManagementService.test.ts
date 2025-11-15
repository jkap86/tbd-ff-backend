/**
 * UserManagementService Tests
 *
 * This test demonstrates best practices for testing services with DI:
 * - Using MockContainer for dependencies
 * - Mocking repositories
 * - Mocking EventBus with MockEventBus
 * - Testing business logic in isolation
 */

import { UserManagementService, CreateUserDTO, UpdateUserDTO } from '../../../services/examples/UserManagementService';
import { MockEventBus } from '../../../services/eventBus/MockEventBus';
import { UserRepository } from '../../../repositories/UserRepository';

describe('UserManagementService', () => {
  let service: UserManagementService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockEventBus: MockEventBus;
  let mockLogger: any;
  let mockPasswordHasher: jest.Mock;

  beforeEach(() => {
    // Create mocks
    mockUserRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      usernameExists: jest.fn(),
      emailExists: jest.fn(),
      search: jest.fn(),
      updatePassword: jest.fn(),
      getByUsername: jest.fn(),
      getByEmail: jest.fn(),
    } as any;

    mockEventBus = new MockEventBus();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockPasswordHasher = jest.fn().mockResolvedValue('hashed_password');

    // Create service with mocked dependencies
    service = new UserManagementService(
      mockUserRepo,
      mockEventBus,
      mockLogger,
      mockPasswordHasher
    );
  });

  describe('createUser', () => {
    const validUserData: CreateUserDTO = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    };

    it('should create a new user successfully', async () => {
      // Setup mocks
      mockUserRepo.usernameExists.mockResolvedValue(false);
      mockUserRepo.emailExists.mockResolvedValue(false);
      mockUserRepo.create.mockResolvedValue({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        created_at: new Date(),
      });

      // Execute
      const result = await service.createUser(validUserData);

      // Verify
      expect(result).toEqual({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        created_at: expect.any(Date),
      });

      // Verify password was hashed
      expect(mockPasswordHasher).toHaveBeenCalledWith('password123');

      // Verify user was created
      expect(mockUserRepo.create).toHaveBeenCalledWith({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
      });

      // Verify event was emitted
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(true);
      expect(mockEventBus.getEventData('user:created')).toEqual({
        userId: 1,
        username: 'testuser',
      });

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new user',
        { username: 'testuser' }
      );
    });

    it('should throw error if username already exists', async () => {
      mockUserRepo.usernameExists.mockResolvedValue(true);

      await expect(service.createUser(validUserData)).rejects.toThrow(
        'Username already exists'
      );

      // Verify no user was created
      expect(mockUserRepo.create).not.toHaveBeenCalled();

      // Verify no event was emitted
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(false);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error if email already exists', async () => {
      mockUserRepo.usernameExists.mockResolvedValue(false);
      mockUserRepo.emailExists.mockResolvedValue(true);

      await expect(service.createUser(validUserData)).rejects.toThrow(
        'Email already exists'
      );

      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(false);
    });

    it('should not include password in response', async () => {
      mockUserRepo.usernameExists.mockResolvedValue(false);
      mockUserRepo.emailExists.mockResolvedValue(false);
      mockUserRepo.create.mockResolvedValue({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        created_at: new Date(),
      });

      const result = await service.createUser(validUserData);

      expect(result).not.toHaveProperty('password_hash');
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('getUserById', () => {
    it('should return user by ID without password', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        created_at: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(mockUser);

      const result = await service.getUserById(1);

      expect(result).toEqual({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        created_at: expect.any(Date),
      });
      expect(result).not.toHaveProperty('password_hash');
    });

    it('should throw error if user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.getUserById(999)).rejects.toThrow('User not found');
    });
  });

  describe('updateUser', () => {
    const updateData: UpdateUserDTO = {
      username: 'updateduser',
    };

    it('should update user successfully', async () => {
      const existingUser = {
        id: 1,
        username: 'olduser',
        email: 'test@example.com',
        password_hash: 'hash',
      };

      const updatedUser = {
        ...existingUser,
        username: 'updateduser',
      };

      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.usernameExists.mockResolvedValue(false);
      mockUserRepo.update.mockResolvedValue(updatedUser);

      const result = await service.updateUser(1, updateData);

      expect(result.username).toBe('updateduser');
      expect(result).not.toHaveProperty('password_hash');

      // Verify event was emitted
      expect(mockEventBus.wasEventEmitted('user:updated')).toBe(true);
      expect(mockEventBus.getEventData('user:updated')).toEqual({
        userId: 1,
        changes: updateData,
      });
    });

    it('should throw error if user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.updateUser(999, updateData)).rejects.toThrow(
        'User not found'
      );
    });

    it('should throw error if new username already exists', async () => {
      const existingUser = {
        id: 1,
        username: 'olduser',
        email: 'test@example.com',
        password_hash: 'hash',
      };

      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.usernameExists.mockResolvedValue(true);

      await expect(service.updateUser(1, { username: 'taken' })).rejects.toThrow(
        'Username already exists'
      );

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('should allow updating to same username', async () => {
      const existingUser = {
        id: 1,
        username: 'sameuser',
        email: 'test@example.com',
        password_hash: 'hash',
      };

      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.update.mockResolvedValue(existingUser);

      // Should not check usernameExists since it's the same
      await service.updateUser(1, { username: 'sameuser' });

      expect(mockUserRepo.usernameExists).not.toHaveBeenCalled();
    });
  });

  describe('searchUsers', () => {
    it('should return users without passwords', async () => {
      const mockUsers = [
        {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
          password_hash: 'hash1',
        },
        {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
          password_hash: 'hash2',
        },
      ];

      mockUserRepo.search.mockResolvedValue(mockUsers);

      const result = await service.searchUsers('user');

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password_hash');
      expect(result[1]).not.toHaveProperty('password_hash');
      expect(mockUserRepo.search).toHaveBeenCalledWith('user');
    });

    it('should return empty array when no users found', async () => {
      mockUserRepo.search.mockResolvedValue([]);

      const result = await service.searchUsers('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const userId = 1;
      const newPassword = 'newpassword123';

      mockUserRepo.findById.mockResolvedValue({
        id: userId,
        username: 'testuser',
        password_hash: 'old_hash',
      });
      mockUserRepo.updatePassword.mockResolvedValue(true);

      await service.changePassword(userId, newPassword);

      // Verify password was hashed
      expect(mockPasswordHasher).toHaveBeenCalledWith(newPassword);

      // Verify password was updated
      expect(mockUserRepo.updatePassword).toHaveBeenCalledWith(
        userId,
        'hashed_password'
      );

      // Verify event was emitted to user
      expect(mockEventBus.wasEventEmittedToUser(userId, 'password:changed')).toBe(true);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Password changed successfully',
        { userId }
      );
    });

    it('should throw error if user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.changePassword(999, 'newpass')).rejects.toThrow(
        'User not found'
      );

      expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw error if password update fails', async () => {
      mockUserRepo.findById.mockResolvedValue({
        id: 1,
        username: 'testuser',
        password_hash: 'hash',
      });
      mockUserRepo.updatePassword.mockResolvedValue(false);

      await expect(service.changePassword(1, 'newpass')).rejects.toThrow(
        'Failed to update password'
      );
    });
  });

  describe('dependency injection integration', () => {
    it('should work with injected dependencies', () => {
      // This test verifies the service can be created with any compatible dependencies
      const alternateEventBus = new MockEventBus();
      const alternateLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };

      const alternateService = new UserManagementService(
        mockUserRepo,
        alternateEventBus,
        alternateLogger,
        mockPasswordHasher
      );

      expect(alternateService).toBeInstanceOf(UserManagementService);
    });
  });
});
