/**
 * Socket Rate Limiter Utility
 *
 * Provides rate limiting for socket event handlers to prevent spam and abuse.
 *
 * Example usage:
 * ```typescript
 * const chatLimiter = new SocketRateLimiter(500); // 500ms cooldown
 *
 * socket.on('send_message', (data) => {
 *   if (!chatLimiter.canProceed(data.userId)) {
 *     socket.emit('rate_limit_error', { message: 'Please slow down' });
 *     return;
 *   }
 *   // Process message
 * });
 * ```
 */
export class SocketRateLimiter {
  private timestamps: Map<string, number> = new Map();
  private cooldownMs: number;

  /**
   * Creates a new SocketRateLimiter
   * @param cooldownMs - Minimum time in milliseconds between allowed actions
   */
  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs;
  }

  /**
   * Checks if a user can proceed with an action
   * @param userId - Unique identifier for the user
   * @returns true if action is allowed, false if rate limited
   */
  canProceed(userId: string | number): boolean {
    const now = Date.now();
    const key = String(userId);
    const lastAction = this.timestamps.get(key) || 0;

    if (now - lastAction < this.cooldownMs) {
      return false;
    }

    this.timestamps.set(key, now);
    return true;
  }

  /**
   * Resets the rate limit for a specific user
   * @param userId - Unique identifier for the user
   */
  reset(userId: string | number): void {
    this.timestamps.delete(String(userId));
  }

  /**
   * Clears all stored timestamps
   * Useful for cleanup or testing
   */
  clear(): void {
    this.timestamps.clear();
  }

  /**
   * Gets the remaining cooldown time for a user
   * @param userId - Unique identifier for the user
   * @returns remaining cooldown in milliseconds, or 0 if no cooldown
   */
  getRemainingCooldown(userId: string | number): number {
    const now = Date.now();
    const key = String(userId);
    const lastAction = this.timestamps.get(key) || 0;
    const timeSinceLastAction = now - lastAction;

    if (timeSinceLastAction >= this.cooldownMs) {
      return 0;
    }

    return this.cooldownMs - timeSinceLastAction;
  }
}

/**
 * Throttle Map Utility
 *
 * Manages throttled functions for multiple entities (e.g., different draft rooms)
 *
 * Example usage:
 * ```typescript
 * import { throttle } from 'lodash';
 *
 * const broadcastThrottlers = new ThrottleMap<number, Function>(1000);
 *
 * function broadcastUpdate(draftId: number, data: any) {
 *   const throttled = broadcastThrottlers.getOrCreate(
 *     draftId,
 *     () => throttle((d: any) => {
 *       io.to(`draft_${draftId}`).emit('update', d);
 *     }, 1000)
 *   );
 *   throttled(data);
 * }
 * ```
 */
export class ThrottleMap<K, V> {
  private map: Map<K, V> = new Map();

  /**
   * Gets an existing value or creates a new one
   * @param key - Map key
   * @param factory - Function to create value if key doesn't exist
   * @returns The value associated with the key
   */
  getOrCreate(key: K, factory: () => V): V {
    if (!this.map.has(key)) {
      this.map.set(key, factory());
    }
    return this.map.get(key)!;
  }

  /**
   * Checks if a key exists in the map
   */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Gets a value from the map
   */
  get(key: K): V | undefined {
    return this.map.get(key);
  }

  /**
   * Deletes a key from the map
   */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /**
   * Clears all entries
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Gets the number of entries
   */
  get size(): number {
    return this.map.size;
  }
}
