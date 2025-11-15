/**
 * Mock Dependency Injection Container for Testing
 *
 * Provides a simple mock container for unit tests.
 * Allows easy registration of test doubles.
 */

import { IContainer, ServiceFactory } from '../interfaces/IContainer';

export class MockContainer implements IContainer {
  private services: Map<string, any> = new Map();

  registerSingleton<T>(name: string, factory: ServiceFactory<T>): void {
    this.services.set(name, factory(this));
  }

  registerFactory<T>(name: string, factory: ServiceFactory<T>): void {
    this.services.set(name, () => factory(this));
  }

  registerInstance<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' is not registered in MockContainer`);
    }
    return typeof service === 'function' ? service() : service;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  clear(): void {
    this.services.clear();
  }

  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Register a mock/stub for testing
   * This is a convenience method for tests
   */
  registerMock<T>(name: string, mock: T): void {
    this.registerInstance(name, mock);
  }
}
