/**
 * Dependency Injection Container Interface
 *
 * Provides a centralized container for managing service dependencies.
 * Supports both singleton and factory registrations.
 */

export type ServiceFactory<T> = (container: IContainer) => T;
export type ServiceInstance<T> = T;

export interface IContainer {
  /**
   * Register a singleton service
   * The factory function will be called once, and the result cached
   *
   * @param name - Unique service identifier
   * @param factory - Function that creates the service instance
   */
  registerSingleton<T>(name: string, factory: ServiceFactory<T>): void;

  /**
   * Register a factory service
   * The factory function will be called every time the service is resolved
   *
   * @param name - Unique service identifier
   * @param factory - Function that creates the service instance
   */
  registerFactory<T>(name: string, factory: ServiceFactory<T>): void;

  /**
   * Register an existing instance as a singleton
   *
   * @param name - Unique service identifier
   * @param instance - The service instance
   */
  registerInstance<T>(name: string, instance: ServiceInstance<T>): void;

  /**
   * Resolve a service by name
   *
   * @param name - Service identifier
   * @returns The service instance
   * @throws Error if service not registered
   */
  resolve<T>(name: string): T;

  /**
   * Check if a service is registered
   *
   * @param name - Service identifier
   * @returns True if service is registered
   */
  has(name: string): boolean;

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void;

  /**
   * Get all registered service names
   */
  getRegisteredServices(): string[];
}
