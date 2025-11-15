/**
 * Mock Event Bus for Testing
 * Records all emitted events for assertions in tests
 */

import { IEventBus } from "../../interfaces/IEventBus";

export interface EmittedEvent {
  event: string;
  data: any;
  room?: string;
  userId?: number;
  timestamp: Date;
}

export class MockEventBus implements IEventBus {
  private events: EmittedEvent[] = [];
  private rooms: Map<string, Set<string>> = new Map();

  emit<T = any>(event: string, data: T): void {
    this.events.push({
      event,
      data,
      timestamp: new Date(),
    });
  }

  emitToRoom<T = any>(room: string, event: string, data: T): void {
    this.events.push({
      event,
      data,
      room,
      timestamp: new Date(),
    });
  }

  emitToUser<T = any>(userId: number, event: string, data: T): void {
    this.events.push({
      event,
      data,
      userId,
      timestamp: new Date(),
    });
  }

  joinRoom(socketId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socketId);
  }

  leaveRoom(socketId: string, room: string): void {
    const roomSockets = this.rooms.get(room);
    if (roomSockets) {
      roomSockets.delete(socketId);
    }
  }

  // Test Helper Methods

  /**
   * Get all emitted events
   */
  getEmittedEvents(): EmittedEvent[] {
    return [...this.events];
  }

  /**
   * Check if specific event was emitted
   */
  wasEventEmitted(event: string): boolean {
    return this.events.some((e) => e.event === event);
  }

  /**
   * Get data from specific event
   */
  getEventData<T = any>(event: string): T | undefined {
    const found = this.events.find((e) => e.event === event);
    return found?.data as T | undefined;
  }

  /**
   * Get all events emitted to a specific room
   */
  getEventsForRoom(room: string): EmittedEvent[] {
    return this.events.filter((e) => e.room === room);
  }

  /**
   * Get all events emitted to a specific user
   */
  getEventsForUser(userId: number): EmittedEvent[] {
    return this.events.filter((e) => e.userId === userId);
  }

  /**
   * Count how many times an event was emitted
   */
  getEventCount(event: string): number {
    return this.events.filter((e) => e.event === event).length;
  }

  /**
   * Get the last emitted event
   */
  getLastEvent(): EmittedEvent | undefined {
    return this.events[this.events.length - 1];
  }

  /**
   * Check if socket is in room
   */
  isSocketInRoom(socketId: string, room: string): boolean {
    return this.rooms.get(room)?.has(socketId) || false;
  }

  /**
   * Clear all recorded events
   */
  clear(): void {
    this.events = [];
    this.rooms.clear();
  }

  /**
   * Get all events of a specific type
   */
  getEventsByType(event: string): EmittedEvent[] {
    return this.events.filter((e) => e.event === event);
  }

  /**
   * Assert that an event was emitted (throws if not)
   */
  assertEventEmitted(event: string): void {
    if (!this.wasEventEmitted(event)) {
      throw new Error(`Expected event "${event}" to be emitted, but it wasn't`);
    }
  }

  /**
   * Assert that an event was NOT emitted (throws if it was)
   */
  assertEventNotEmitted(event: string): void {
    if (this.wasEventEmitted(event)) {
      throw new Error(`Expected event "${event}" NOT to be emitted, but it was`);
    }
  }

  /**
   * Check if event was emitted to specific room
   */
  wasEventEmittedToRoom(room: string, event: string): boolean {
    return this.events.some((e) => e.room === room && e.event === event);
  }

  /**
   * Get event data for specific room and event
   */
  getEventDataForRoom<T = any>(room: string, event: string): T | undefined {
    const found = this.events.find((e) => e.room === room && e.event === event);
    return found?.data as T | undefined;
  }

  /**
   * Check if event was emitted to specific user
   */
  wasEventEmittedToUser(userId: number, event: string): boolean {
    return this.events.some((e) => e.userId === userId && e.event === event);
  }

  /**
   * Get event data for specific user and event
   */
  getEventDataForUser<T = any>(userId: number, event: string): T | undefined {
    const found = this.events.find((e) => e.userId === userId && e.event === event);
    return found?.data as T | undefined;
  }

  /**
   * Check if room was joined
   */
  wasRoomJoined(socketId: string, room: string): boolean {
    return this.isSocketInRoom(socketId, room);
  }

  /**
   * Check if room was left
   */
  wasRoomLeft(socketId: string, room: string): boolean {
    // Since we don't track "leave" events separately, check if socket is NOT in room
    return !this.isSocketInRoom(socketId, room);
  }

  /**
   * Reset all events (alias for clear)
   */
  reset(): void {
    this.clear();
  }

  /**
   * Get all emitted events (alias)
   */
  getAllEmittedEvents(): EmittedEvent[] {
    return this.getEmittedEvents();
  }
}
