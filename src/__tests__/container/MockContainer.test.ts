/**
 * MockContainer Tests
 *
 * Tests for the MockContainer test utility
 */

import { MockContainer } from '../../container/MockContainer';

describe('MockContainer', () => {
  let container: MockContainer;

  beforeEach(() => {
    container = new MockContainer();
  });

  describe('registerInstance', () => {
    it('should register and resolve an instance', () => {
      const instance = { value: 'test' };
      container.registerInstance('test', instance);

      const resolved = container.resolve<typeof instance>('test');
      expect(resolved).toBe(instance);
    });
  });

  describe('registerMock', () => {
    it('should register a mock object', () => {
      const mock = {
        getData: jest.fn().mockReturnValue({ id: 1 }),
      };

      container.registerMock('service', mock);

      const resolved = container.resolve<typeof mock>('service');
      expect(resolved).toBe(mock);
      expect(resolved.getData()).toEqual({ id: 1 });
    });

    it('should allow mocking complex dependencies', () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };

      const mockRepository = {
        findById: jest.fn().mockResolvedValue({ id: 1, name: 'Test' }),
        save: jest.fn(),
      };

      container.registerMock('logger', mockLogger);
      container.registerMock('repository', mockRepository);

      const logger = container.resolve<typeof mockLogger>('logger');
      const repo = container.resolve<typeof mockRepository>('repository');

      logger.info('test message');
      expect(mockLogger.info).toHaveBeenCalledWith('test message');

      repo.findById(1);
      expect(mockRepository.findById).toHaveBeenCalledWith(1);
    });
  });

  describe('registerSingleton', () => {
    it('should resolve singleton immediately', () => {
      let callCount = 0;
      container.registerSingleton('service', () => {
        callCount++;
        return { count: callCount };
      });

      const resolved1 = container.resolve<{ count: number }>('service');
      const resolved2 = container.resolve<{ count: number }>('service');

      expect(resolved1).toBe(resolved2);
      expect(callCount).toBe(1);
    });
  });

  describe('registerFactory', () => {
    it('should create new instance on each resolve', () => {
      let callCount = 0;
      container.registerFactory('factory', () => {
        callCount++;
        return { count: callCount };
      });

      const resolved1 = container.resolve<{ count: number }>('factory');
      const resolved2 = container.resolve<{ count: number }>('factory');

      expect(resolved1).not.toBe(resolved2);
      expect(resolved1.count).toBe(1);
      expect(resolved2.count).toBe(2);
    });
  });

  describe('has', () => {
    it('should return true for registered service', () => {
      container.registerMock('test', {});
      expect(container.has('test')).toBe(true);
    });

    it('should return false for unregistered service', () => {
      expect(container.has('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registrations', () => {
      container.registerMock('service1', {});
      container.registerMock('service2', {});

      expect(container.has('service1')).toBe(true);
      container.clear();
      expect(container.has('service1')).toBe(false);
    });
  });

  describe('getRegisteredServices', () => {
    it('should return list of registered services', () => {
      container.registerMock('service1', {});
      container.registerMock('service2', {});

      const services = container.getRegisteredServices();
      expect(services).toContain('service1');
      expect(services).toContain('service2');
    });
  });

  describe('usage in tests', () => {
    it('should make testing services easy', () => {
      // Setup mocks
      const mockUserRepo = {
        findById: jest.fn().mockResolvedValue({ id: 1, username: 'test' }),
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };

      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };

      container.registerMock('repository.user', mockUserRepo);
      container.registerMock('logger', mockLogger);

      // Create a service that depends on these
      class UserService {
        constructor(
          private userRepo: any,
          private logger: any
        ) {}

        async getUser(id: number) {
          this.logger.info(`Getting user ${id}`);
          const user = await this.userRepo.findById(id);
          return user;
        }
      }

      const service = new UserService(
        container.resolve('repository.user'),
        container.resolve('logger')
      );

      // Test the service
      return service.getUser(1).then((user) => {
        expect(user).toEqual({ id: 1, username: 'test' });
        expect(mockLogger.info).toHaveBeenCalledWith('Getting user 1');
        expect(mockUserRepo.findById).toHaveBeenCalledWith(1);
      });
    });
  });
});
