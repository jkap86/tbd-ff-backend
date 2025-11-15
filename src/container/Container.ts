/**
 * Dependency Injection Container Implementation
 *
 * A lightweight DI container that manages service registration and resolution.
 * Supports singleton and factory patterns.
 */

import { IContainer, ServiceFactory } from '../interfaces/IContainer';
import { logger } from '../config/logger';

enum RegistrationType {
  Singleton = 'singleton',
  Factory = 'factory',
  Instance = 'instance',
}

interface ServiceRegistration<T> {
  type: RegistrationType;
  factory?: ServiceFactory<T>;
  instance?: T;
}

export class Container implements IContainer {
  private services: Map<string, ServiceRegistration<any>> = new Map();
  private resolving: Set<string> = new Set();

  /**
   * Register a singleton service
   */
  registerSingleton<T>(name: string, factory: ServiceFactory<T>): void {
    if (this.services.has(name)) {
      logger.warn(`Service '${name}' is already registered. Overwriting.`);
    }

    this.services.set(name, {
      type: RegistrationType.Singleton,
      factory,
    });

    logger.debug(`Registered singleton service: ${name}`);
  }

  /**
   * Register a factory service
   */
  registerFactory<T>(name: string, factory: ServiceFactory<T>): void {
    if (this.services.has(name)) {
      logger.warn(`Service '${name}' is already registered. Overwriting.`);
    }

    this.services.set(name, {
      type: RegistrationType.Factory,
      factory,
    });

    logger.debug(`Registered factory service: ${name}`);
  }

  /**
   * Register an existing instance
   */
  registerInstance<T>(name: string, instance: T): void {
    if (this.services.has(name)) {
      logger.warn(`Service '${name}' is already registered. Overwriting.`);
    }

    this.services.set(name, {
      type: RegistrationType.Instance,
      instance,
    });

    logger.debug(`Registered instance service: ${name}`);
  }

  /**
   * Resolve a service by name
   */
  resolve<T>(name: string): T {
    // Check circular dependency
    if (this.resolving.has(name)) {
      throw new Error(
        `Circular dependency detected while resolving '${name}'. ` +
        `Resolution chain: ${Array.from(this.resolving).join(' -> ')} -> ${name}`
      );
    }

    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(
        `Service '${name}' is not registered. ` +
        `Available services: ${this.getRegisteredServices().join(', ')}`
      );
    }

    // If it's an instance, return it directly
    if (registration.type === RegistrationType.Instance) {
      return registration.instance as T;
    }

    // For singleton, check if already instantiated
    if (registration.type === RegistrationType.Singleton && registration.instance) {
      return registration.instance as T;
    }

    // Create new instance
    if (!registration.factory) {
      throw new Error(`Service '${name}' has no factory function`);
    }

    // Track resolution to detect circular dependencies
    this.resolving.add(name);

    try {
      const instance = registration.factory(this);

      // Cache singleton instances
      if (registration.type === RegistrationType.Singleton) {
        registration.instance = instance;
        logger.debug(`Singleton instance created for: ${name}`);
      } else {
        logger.debug(`Factory instance created for: ${name}`);
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    const count = this.services.size;
    this.services.clear();
    this.resolving.clear();
    logger.info(`Cleared ${count} service registrations`);
  }

  /**
   * Get all registered service names
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get registration info for debugging
   */
  getRegistrationInfo(name: string): {
    type: string;
    hasInstance: boolean;
  } | null {
    const registration = this.services.get(name);
    if (!registration) {
      return null;
    }

    return {
      type: registration.type,
      hasInstance: !!registration.instance,
    };
  }
}
