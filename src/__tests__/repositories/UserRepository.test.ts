/**
 * UserRepository Tests
 *
 * Example test showing how to test repositories using the new architecture
 */

import { UserRepository } from '../../repositories/UserRepository';
import { QueryResult } from 'pg';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockPool: any;

  beforeEach(() => {
    // Create mock database pool
    mockPool = {
      query: jest.fn(),
    };

    // Create repository with mock pool
    repository = new UserRepository(mockPool);
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({
        rows: [mockUser],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.findById(1);

      expect(result).toEqual(mockUser);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1]
      );
    });

    it('should return null when user not found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(repository.findById(1)).rejects.toThrow('Database connection failed');
    });
  });

  describe('getByUsername', () => {
    it('should find user by username', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
      };

      mockPool.query.mockResolvedValue({
        rows: [mockUser],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.getByUsername('testuser');

      expect(result).toEqual(mockUser);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE username ='),
        ['testuser']
      );
    });

    it('should return null for non-existent username', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await repository.getByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
      };

      mockPool.query.mockResolvedValue({
        rows: [mockUser],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.getByEmail('test@example.com');

      expect(result).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const newUser = {
        username: 'newuser',
        email: 'new@example.com',
        password_hash: 'hashed_password',
      };

      const createdUser = {
        id: 1,
        ...newUser,
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({
        rows: [createdUser],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.create(newUser);

      expect(result).toEqual(createdUser);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([newUser.username, newUser.email, newUser.password_hash])
      );
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const updatedData = {
        username: 'updateduser',
        email: 'updated@example.com',
      };

      const updatedUser = {
        id: 1,
        ...updatedData,
      };

      mockPool.query.mockResolvedValue({
        rows: [updatedUser],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.update(1, updatedData);

      expect(result).toEqual(updatedUser);
    });

    it('should return null when updating non-existent user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await repository.update(999, { username: 'test' });

      expect(result).toBeNull();
    });
  });

  describe('usernameExists', () => {
    it('should return true when username exists', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.usernameExists('existinguser');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        ['existinguser']
      );
    });

    it('should return false when username does not exist', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ exists: false }],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.usernameExists('newuser');

      expect(result).toBe(false);
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.emailExists('existing@example.com');

      expect(result).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ exists: false }],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.emailExists('new@example.com');

      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    it('should search users by username pattern', async () => {
      const mockUsers = [
        { id: 1, username: 'testuser1' },
        { id: 2, username: 'testuser2' },
      ];

      mockPool.query.mockResolvedValue({
        rows: mockUsers,
        rowCount: 2,
      } as QueryResult);

      const result = await repository.search('test');

      expect(result).toEqual(mockUsers);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%test%'])
      );
    });

    it('should return empty array when no matches found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await repository.search('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      const userId = 1;
      const newPasswordHash = 'new_hashed_password';

      mockPool.query.mockResolvedValue({
        rows: [{ id: userId }],
        rowCount: 1,
      } as QueryResult);

      const result = await repository.updatePassword(userId, newPasswordHash);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining([newPasswordHash, userId])
      );
    });

    it('should return false when user not found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await repository.updatePassword(999, 'hash');

      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should propagate database errors with context', async () => {
      const dbError = new Error('Connection timeout');
      mockPool.query.mockRejectedValue(dbError);

      await expect(repository.findById(1)).rejects.toThrow('Connection timeout');
    });

    it('should handle query errors gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('Invalid SQL'));

      await expect(repository.getByUsername('test')).rejects.toThrow();
    });
  });

  describe('integration with DI Container', () => {
    it('should work when resolved from container', () => {
      // This test shows how the repository would be used via container
      const mockContainer = {
        resolve: jest.fn().mockReturnValue(repository),
      };

      const userRepo = mockContainer.resolve('repository.user');

      expect(userRepo).toBe(repository);
      expect(typeof userRepo.findById).toBe('function');
      expect(typeof userRepo.getByUsername).toBe('function');
    });
  });
});
