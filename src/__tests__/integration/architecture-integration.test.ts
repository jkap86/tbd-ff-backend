/**
 * Architecture Integration Tests
 *
 * Tests that demonstrate how all architectural components work together:
 * - DI Container
 * - Event Bus
 * - Repositories
 * - Services
 */

import { Container } from '../../container/Container';
import { MockEventBus } from '../../services/eventBus/MockEventBus';
import { UserRepository } from '../../repositories/UserRepository';
import { UserManagementService } from '../../services/examples/UserManagementService';

describe('Architecture Integration', () => {
  let container: Container;
  let mockEventBus: MockEventBus;
  let mockPool: any;
  let mockLogger: any;
  let mockPasswordHasher: jest.Mock;

  beforeEach(() => {
    // Create a fresh container for each test
    container = new Container();

    // Setup mocks
    mockEventBus = new MockEventBus();
    mockPool = {
      query: jest.fn(),
    };
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    mockPasswordHasher = jest.fn().mockResolvedValue('hashed_password');

    // Register core infrastructure in container
    container.registerInstance('eventBus', mockEventBus);
    container.registerInstance('database.pool', mockPool);
    container.registerInstance('logger', mockLogger);
    container.registerInstance('passwordHasher', mockPasswordHasher);

    // Register repository as singleton
    container.registerSingleton('repository.user', (c) => {
      const pool = c.resolve('database.pool');
      return new UserRepository(pool);
    });

    // Register service as singleton
    container.registerSingleton('service.userManagement', (c) => {
      const userRepo = c.resolve<UserRepository>('repository.user');
      const eventBus = c.resolve<MockEventBus>('eventBus');
      const logger = c.resolve('logger');
      const hasher = c.resolve<typeof mockPasswordHasher>('passwordHasher');

      return new UserManagementService(userRepo, eventBus, logger, hasher);
    });
  });

  afterEach(() => {
    container.clear();
  });

  describe('Container + Repository Integration', () => {
    it('should resolve repository from container', () => {
      const userRepo = container.resolve<UserRepository>('repository.user');

      expect(userRepo).toBeInstanceOf(UserRepository);
      expect(typeof userRepo.findById).toBe('function');
      expect(typeof userRepo.create).toBe('function');
    });

    it('should return same repository instance (singleton)', () => {
      const repo1 = container.resolve<UserRepository>('repository.user');
      const repo2 = container.resolve<UserRepository>('repository.user');

      expect(repo1).toBe(repo2);
    });

    it('should inject database pool into repository', () => {
      const userRepo = container.resolve<UserRepository>('repository.user');

      // Repository should use the injected pool
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      userRepo.findById(1);

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('Container + Service Integration', () => {
    it('should resolve service from container with all dependencies', () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      expect(service).toBeInstanceOf(UserManagementService);
      expect(typeof service.createUser).toBe('function');
    });

    it('should inject all dependencies into service', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      // Setup mock responses
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // usernameExists
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // emailExists
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'testuser', email: 'test@example.com' }],
        rowCount: 1,
      }); // create

      await service.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      // Verify all dependencies were used
      expect(mockPool.query).toHaveBeenCalled(); // Repository
      expect(mockPasswordHasher).toHaveBeenCalled(); // Password hasher
      expect(mockLogger.info).toHaveBeenCalled(); // Logger
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(true); // EventBus
    });
  });

  describe('Service + EventBus Integration', () => {
    it('should emit events through injected EventBus', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'testuser', email: 'test@example.com' }],
        rowCount: 1,
      });

      const result = await service.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      // Verify event was emitted
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(true);
      expect(mockEventBus.getEventData('user:created')).toMatchObject({
        userId: 1,
        username: 'testuser',
      });
    });

    it('should emit user-specific events', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 123, username: 'testuser' }],
        rowCount: 1,
      }); // findById
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 123 }], rowCount: 1 }); // updatePassword

      await service.changePassword(123, 'newpassword');

      expect(mockEventBus.wasEventEmittedToUser(123, 'password:changed')).toBe(true);
    });
  });

  describe('Service + Repository Integration', () => {
    it('should use repository methods through service', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'testuser', email: 'test@example.com' }],
        rowCount: 1,
      });

      const user = await service.getUserById(1);

      expect(user).toMatchObject({
        id: 1,
        username: 'testuser',
      });
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1]
      );
    });

    it('should handle repository errors in service', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      mockPool.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.getUserById(1)).rejects.toThrow('Database connection failed');

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Full Stack Integration', () => {
    it('should complete full user creation flow', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      // Setup all database responses
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // usernameExists
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 }); // emailExists
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'newuser',
          email: 'new@example.com',
          created_at: new Date(),
        }],
        rowCount: 1,
      }); // create

      const result = await service.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: 'SecurePass123',
      });

      // Verify result
      expect(result.id).toBe(1);
      expect(result.username).toBe('newuser');

      // Verify password was hashed
      expect(mockPasswordHasher).toHaveBeenCalledWith('SecurePass123');

      // Verify database queries
      expect(mockPool.query).toHaveBeenCalledTimes(3);

      // Verify event emitted
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(true);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new user',
        { username: 'newuser' }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User created successfully',
        { userId: 1 }
      );
    });

    it('should handle validation errors appropriately', async () => {
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      // Username already exists
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 });

      await expect(
        service.createUser({
          username: 'existinguser',
          email: 'new@example.com',
          password: 'password',
        })
      ).rejects.toThrow('Username already exists');

      // Verify no user was created
      expect(mockEventBus.wasEventEmitted('user:created')).toBe(false);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Dependency Graph', () => {
    it('should resolve complex dependency chains', () => {
      // Service depends on Repository, EventBus, Logger, PasswordHasher
      // Repository depends on Database Pool
      // All should resolve correctly

      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );
      const userRepo = container.resolve<UserRepository>('repository.user');
      const eventBus = container.resolve<MockEventBus>('eventBus');

      expect(service).toBeInstanceOf(UserManagementService);
      expect(userRepo).toBeInstanceOf(UserRepository);
      expect(eventBus).toBeInstanceOf(MockEventBus);
    });

    it('should maintain singleton instances across dependency graph', () => {
      const service1 = container.resolve<UserManagementService>(
        'service.userManagement'
      );
      const service2 = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      // Both should be the same instance
      expect(service1).toBe(service2);

      // Both should use the same repository instance
      const repo = container.resolve<UserRepository>('repository.user');
      expect(repo).toBeInstanceOf(UserRepository);
    });
  });

  describe('Testing Benefits', () => {
    it('should make testing easy with mock dependencies', async () => {
      // This test demonstrates how easy it is to test with DI
      const service = container.resolve<UserManagementService>(
        'service.userManagement'
      );

      // Simply setup mock responses
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'testuser' }],
        rowCount: 1,
      });

      // Execute
      const user = await service.getUserById(1);

      // Verify
      expect(user.username).toBe('testuser');

      // No real database needed!
      // No real Socket.io needed!
      // Everything is mocked and testable!
    });
  });
});
