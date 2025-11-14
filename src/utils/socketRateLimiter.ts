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

