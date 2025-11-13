/**
 * TimerManager Utility
 *
 * A reusable class for managing Node.js timers (setTimeout/setInterval)
 * Eliminates duplicate timer management code across services.
 *
 * Features:
 * - Type-safe timer storage
 * - Automatic cleanup
 * - Support for both timeouts and intervals
 * - Graceful error handling
 * - Memory leak prevention
 *
 * Usage:
 * ```typescript
 * const timers = new TimerManager<number>(); // number = key type (e.g., draftId)
 *
 * // Schedule a one-time action
 * timers.setTimeout(123, () => console.log('Draft 123 expired'), 5000);
 *
 * // Schedule a recurring action
 * timers.setInterval(123, () => console.log('Checking draft 123'), 1000);
 *
 * // Clear a specific timer
 * timers.clear(123);
 *
 * // Clear all timers
 * timers.clearAll();
 * ```
 */

export class TimerManager<K = string | number> {
  private timeouts: Map<K, NodeJS.Timeout> = new Map();
  private intervals: Map<K, NodeJS.Timeout> = new Map();
  private readonly name: string;

  /**
   * Create a new TimerManager instance
   * @param name Optional name for logging purposes (e.g., "DraftAutoPickTimers")
   */
  constructor(name?: string) {
    this.name = name || 'TimerManager';
  }

  /**
   * Schedule a one-time callback after a delay
   * If a timeout already exists for this key, it will be cleared first
   *
   * @param key Unique identifier for this timer
   * @param callback Function to execute after delay
   * @param delayMs Delay in milliseconds
   */
  setTimeout(key: K, callback: () => void | Promise<void>, delayMs: number): void {
    // Clear existing timeout if present
    this.clearTimeout(key);

    const timer = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        console.error(`[${this.name}] Error in timeout callback for key ${key}:`, error);
      } finally {
        // Auto-cleanup: remove from map after execution
        this.timeouts.delete(key);
      }
    }, delayMs);

    this.timeouts.set(key, timer);
  }

  /**
   * Schedule a recurring callback at a fixed interval
   * If an interval already exists for this key, it will be cleared first
   *
   * @param key Unique identifier for this timer
   * @param callback Function to execute on each interval
   * @param intervalMs Interval in milliseconds
   */
  setInterval(key: K, callback: () => void | Promise<void>, intervalMs: number): void {
    // Clear existing interval if present
    this.clearInterval(key);

    const timer = setInterval(async () => {
      try {
        await callback();
      } catch (error) {
        console.error(`[${this.name}] Error in interval callback for key ${key}:`, error);
      }
    }, intervalMs);

    this.intervals.set(key, timer);
  }

  /**
   * Clear a specific timeout
   * @param key Identifier of the timeout to clear
   * @returns true if a timeout was cleared, false if none existed
   */
  clearTimeout(key: K): boolean {
    const timer = this.timeouts.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Clear a specific interval
   * @param key Identifier of the interval to clear
   * @returns true if an interval was cleared, false if none existed
   */
  clearInterval(key: K): boolean {
    const timer = this.intervals.get(key);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Clear both timeout and interval for a given key
   * @param key Identifier of the timer(s) to clear
   * @returns true if any timer was cleared
   */
  clear(key: K): boolean {
    const timeoutCleared = this.clearTimeout(key);
    const intervalCleared = this.clearInterval(key);
    return timeoutCleared || intervalCleared;
  }

  /**
   * Clear all timeouts and intervals
   * Call this on service shutdown to prevent memory leaks
   * @returns Number of timers cleared
   */
  clearAll(): number {
    let count = 0;

    // Clear all timeouts
    for (const [key, timer] of this.timeouts.entries()) {
      clearTimeout(timer);
      count++;
    }
    this.timeouts.clear();

    // Clear all intervals
    for (const [key, timer] of this.intervals.entries()) {
      clearInterval(timer);
      count++;
    }
    this.intervals.clear();

    if (count > 0) {
      console.log(`[${this.name}] Cleared ${count} timer(s)`);
    }

    return count;
  }

  /**
   * Check if a timeout exists for a given key
   */
  hasTimeout(key: K): boolean {
    return this.timeouts.has(key);
  }

  /**
   * Check if an interval exists for a given key
   */
  hasInterval(key: K): boolean {
    return this.intervals.has(key);
  }

  /**
   * Check if any timer (timeout or interval) exists for a given key
   */
  has(key: K): boolean {
    return this.hasTimeout(key) || this.hasInterval(key);
  }

  /**
   * Get the number of active timeouts
   */
  get timeoutCount(): number {
    return this.timeouts.size;
  }

  /**
   * Get the number of active intervals
   */
  get intervalCount(): number {
    return this.intervals.size;
  }

  /**
   * Get the total number of active timers
   */
  get totalCount(): number {
    return this.timeouts.size + this.intervals.size;
  }

  /**
   * Get all keys with active timers (for debugging)
   */
  getActiveKeys(): K[] {
    const timeoutKeys = Array.from(this.timeouts.keys());
    const intervalKeys = Array.from(this.intervals.keys());
    return [...new Set([...timeoutKeys, ...intervalKeys])];
  }
}

/**
 * Example: Multiple timer types per key
 *
 * Use case: Auction service needs multiple timer types per nomination
 * (nomination expiry timer, bid timer, tick interval)
 */
export class MultiTimerManager<K = string | number> {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly name: string;

  constructor(name?: string) {
    this.name = name || 'MultiTimerManager';
  }

  /**
   * Create a composite key from a primary key and timer type
   */
  private makeKey(key: K, type: string): string {
    return `${key}:${type}`;
  }

  /**
   * Schedule a timeout with a specific type
   * @param key Primary identifier
   * @param type Timer type (e.g., 'expiry', 'bid', 'tick')
   * @param callback Function to execute
   * @param delayMs Delay in milliseconds
   */
  setTimeout(key: K, type: string, callback: () => void | Promise<void>, delayMs: number): void {
    const compositeKey = this.makeKey(key, type);
    this.clearTimer(compositeKey);

    const timer = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        console.error(`[${this.name}] Error in ${type} timeout for key ${key}:`, error);
      } finally {
        this.timers.delete(compositeKey);
      }
    }, delayMs);

    this.timers.set(compositeKey, timer);
  }

  /**
   * Schedule an interval with a specific type
   */
  setInterval(key: K, type: string, callback: () => void | Promise<void>, intervalMs: number): void {
    const compositeKey = this.makeKey(key, type);
    this.clearTimer(compositeKey);

    const timer = setInterval(async () => {
      try {
        await callback();
      } catch (error) {
        console.error(`[${this.name}] Error in ${type} interval for key ${key}:`, error);
      }
    }, intervalMs);

    this.timers.set(compositeKey, timer);
  }

  /**
   * Clear a specific timer by key and type
   */
  clear(key: K, type: string): boolean {
    const compositeKey = this.makeKey(key, type);
    return this.clearTimer(compositeKey);
  }

  /**
   * Clear all timers for a given key (all types)
   */
  clearAll(key: K): number {
    let count = 0;
    const prefix = `${key}:`;

    for (const [compositeKey, timer] of this.timers.entries()) {
      if (compositeKey.startsWith(prefix)) {
        this.clearTimer(compositeKey);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear ALL timers across all keys
   */
  clearAllTimers(): number {
    let count = 0;

    for (const [key, timer] of this.timers.entries()) {
      clearTimeout(timer); // works for both setTimeout and setInterval
      count++;
    }

    this.timers.clear();

    if (count > 0) {
      console.log(`[${this.name}] Cleared ${count} timer(s)`);
    }

    return count;
  }

  /**
   * Internal method to clear a timer by composite key
   */
  private clearTimer(compositeKey: string): boolean {
    const timer = this.timers.get(compositeKey);
    if (timer) {
      clearTimeout(timer); // works for both setTimeout and setInterval
      this.timers.delete(compositeKey);
      return true;
    }
    return false;
  }

  /**
   * Check if a specific timer exists
   */
  has(key: K, type: string): boolean {
    return this.timers.has(this.makeKey(key, type));
  }

  /**
   * Get count of active timers
   */
  get count(): number {
    return this.timers.size;
  }
}
