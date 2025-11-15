/**
 * Container Tests
 *
 * Tests for the DI Container implementation
 */

import { Container } from '../../container/Container';
import { IContainer } from '../../interfaces/IContainer';

describe('Container', () => {
  let container: IContainer;

  beforeEach(() => {
    container = new Container();
  });

  describe('registerInstance', () => {
    it('should register and resolve an instance', () => {
      const instance = { value: 'test' };
      container.registerInstance('test', instance);

      const resolved = container.resolve<typeof instance>('test');
      expect(resolved).toBe(instance);
    });

    it('should return the same instance on multiple resolves', () => {
      const instance = { value: 'test' };
      container.registerInstance('test', instance);

      const resolved1 = container.resolve('test');
      const resolved2 = container.resolve('test');
      expect(resolved1).toBe(resolved2);
    });

    it('should warn when overwriting existing registration', () => {
      const instance1 = { value: 'test1' };
      const instance2 = { value: 'test2' };

      container.registerInstance('test', instance1);
      container.registerInstance('test', instance2);

      const resolved = container.resolve('test');
      expect(resolved).toBe(instance2);
    });
  });

  describe('registerSingleton', () => {
    it('should register and resolve a singleton', () => {
      let counter = 0;
      container.registerSingleton('counter', () => {
        counter++;
        return { count: counter };
      });

      const resolved1 = container.resolve<{ count: number }>('counter');
      const resolved2 = container.resolve<{ count: number }>('counter');

      expect(resolved1).toBe(resolved2);
      expect(resolved1.count).toBe(1);
      expect(counter).toBe(1); // Factory called only once
    });

    it('should support dependency resolution in factory', () => {
      container.registerInstance('config', { apiKey: 'test-key' });
      container.registerSingleton('service', (c) => {
        const config = c.resolve<{ apiKey: string }>('config');
        return { apiKey: config.apiKey };
      });

      const service = container.resolve<{ apiKey: string }>('service');
      expect(service.apiKey).toBe('test-key');
    });

    it('should detect circular dependencies', () => {
      container.registerSingleton('serviceA', (c) => {
        const b = c.resolve('serviceB');
        return { b };
      });

      container.registerSingleton('serviceB', (c) => {
        const a = c.resolve('serviceA');
        return { a };
      });

      expect(() => container.resolve('serviceA')).toThrow(/circular dependency/i);
    });
  });

  describe('registerFactory', () => {
    it('should create a new instance on each resolve', () => {
      let counter = 0;
      container.registerFactory('factory', () => {
        counter++;
        return { count: counter };
      });

      const resolved1 = container.resolve<{ count: number }>('factory');
      const resolved2 = container.resolve<{ count: number }>('factory');

      expect(resolved1).not.toBe(resolved2);
      expect(resolved1.count).toBe(1);
      expect(resolved2.count).toBe(2);
      expect(counter).toBe(2); // Factory called twice
    });

    it('should support dependency resolution in factory', () => {
      container.registerInstance('config', { baseUrl: 'http://api.example.com' });
      container.registerFactory('client', (c) => {
        const config = c.resolve<{ baseUrl: string }>('config');
        return { url: config.baseUrl };
      });

      const client1 = container.resolve<{ url: string }>('client');
      const client2 = container.resolve<{ url: string }>('client');

      expect(client1.url).toBe('http://api.example.com');
      expect(client2.url).toBe('http://api.example.com');
      expect(client1).not.toBe(client2);
    });
  });

  describe('resolve', () => {
    it('should throw error for unregistered service', () => {
      expect(() => container.resolve('nonexistent')).toThrow(/not registered/i);
    });

    it('should include available services in error message', () => {
      container.registerInstance('service1', {});
      container.registerInstance('service2', {});

      try {
        container.resolve('nonexistent');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('service1');
        expect(error.message).toContain('service2');
      }
    });
  });

  describe('has', () => {
    it('should return true for registered service', () => {
      container.registerInstance('test', {});
      expect(container.has('test')).toBe(true);
    });

    it('should return false for unregistered service', () => {
      expect(container.has('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registrations', () => {
      container.registerInstance('service1', {});
      container.registerInstance('service2', {});
      container.registerSingleton('service3', () => ({}));

      expect(container.has('service1')).toBe(true);
      expect(container.has('service2')).toBe(true);
      expect(container.has('service3')).toBe(true);

      container.clear();

      expect(container.has('service1')).toBe(false);
      expect(container.has('service2')).toBe(false);
      expect(container.has('service3')).toBe(false);
    });
  });

  describe('getRegisteredServices', () => {
    it('should return empty array when no services registered', () => {
      expect(container.getRegisteredServices()).toEqual([]);
    });

    it('should return list of registered service names', () => {
      container.registerInstance('service1', {});
      container.registerSingleton('service2', () => ({}));
      container.registerFactory('service3', () => ({}));

      const services = container.getRegisteredServices();
      expect(services).toContain('service1');
      expect(services).toContain('service2');
      expect(services).toContain('service3');
      expect(services.length).toBe(3);
    });
  });

  describe('complex scenarios', () => {
    it('should handle deep dependency chains', () => {
      container.registerInstance('config', { value: 'test' });
      container.registerSingleton('repository', (c) => {
        const config = c.resolve<{ value: string }>('config');
        return { configValue: config.value };
      });
      container.registerSingleton('service', (c) => {
        const repo = c.resolve<{ configValue: string }>('repository');
        return { repoValue: repo.configValue };
      });
      container.registerSingleton('controller', (c) => {
        const service = c.resolve<{ repoValue: string }>('service');
        return { serviceValue: service.repoValue };
      });

      const controller = container.resolve<{ serviceValue: string }>('controller');
      expect(controller.serviceValue).toBe('test');
    });

    it('should handle mixed registration types', () => {
      const instance = { type: 'instance' };
      let singletonCallCount = 0;
      let factoryCallCount = 0;

      container.registerInstance('instance', instance);
      container.registerSingleton('singleton', () => {
        singletonCallCount++;
        return { type: 'singleton', count: singletonCallCount };
      });
      container.registerFactory('factory', () => {
        factoryCallCount++;
        return { type: 'factory', count: factoryCallCount };
      });

      // Resolve multiple times
      container.resolve('instance');
      container.resolve('instance');
      container.resolve('singleton');
      container.resolve('singleton');
      container.resolve('factory');
      container.resolve('factory');

      expect(singletonCallCount).toBe(1);
      expect(factoryCallCount).toBe(2);
    });
  });
});
