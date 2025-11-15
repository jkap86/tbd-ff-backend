import { Server } from "socket.io";

/**
 * Event Bus Interface
 * Provides abstraction layer for real-time event emission
 * Decouples services from Socket.io implementation
 */

export interface IEventBus {
  /**
   * Emit event to all connected clients
   */
  emit<T = any>(event: string, data: T): void;

  /**
   * Emit event to specific room
   */
  emitToRoom<T = any>(room: string, event: string, data: T): void;

  /**
   * Emit event to specific user
   */
  emitToUser<T = any>(userId: number, event: string, data: T): void;

  /**
   * Join a socket to a room
   */
  joinRoom(socketId: string, room: string): void;

  /**
   * Remove a socket from a room
   */
  leaveRoom(socketId: string, room: string): void;

  /**
   * Get the underlying Socket.IO server instance
   * @deprecated Use IEventBus methods instead
   */
  getSocketIOInstance(): Server;
}

/**
 * Simple event emitter interface for services that only need to emit
 */
export interface IEventEmitter {
  emit<T = any>(event: string, data: T): void;
}
