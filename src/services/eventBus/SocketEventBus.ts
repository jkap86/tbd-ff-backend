/**
 * Socket.io Event Bus Implementation
 * Wraps Socket.io for event emission while maintaining abstraction
 */

import { Server } from "socket.io";
import { IEventBus } from "../../interfaces/IEventBus";
import { logger } from "../../utils/logger";

export class SocketEventBus implements IEventBus {
  constructor(private io: Server) {}

  emit<T = any>(event: string, data: T): void {
    try {
      this.io.emit(event, data);
      logger.debug(`[EventBus] Emitted event: ${event}`, {
        event,
        dataKeys: data ? Object.keys(data as any) : [],
      });
    } catch (error) {
      logger.error(`[EventBus] Failed to emit event: ${event}`, {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  emitToRoom<T = any>(room: string, event: string, data: T): void {
    try {
      this.io.to(room).emit(event, data);
      logger.debug(`[EventBus] Emitted to room ${room}: ${event}`, {
        room,
        event,
        dataKeys: data ? Object.keys(data as any) : [],
      });
    } catch (error) {
      logger.error(`[EventBus] Failed to emit to room ${room}: ${event}`, {
        room,
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  emitToUser<T = any>(userId: number, event: string, data: T): void {
    try {
      const userRoom = `user_${userId}`;
      this.io.to(userRoom).emit(event, data);
      logger.debug(`[EventBus] Emitted to user ${userId}: ${event}`, {
        userId,
        event,
        dataKeys: data ? Object.keys(data as any) : [],
      });
    } catch (error) {
      logger.error(`[EventBus] Failed to emit to user ${userId}: ${event}`, {
        userId,
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  joinRoom(socketId: string, room: string): void {
    try {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(room);
        logger.debug(`[EventBus] Socket ${socketId} joined room ${room}`, {
          socketId,
          room,
        });
      } else {
        logger.warn(`[EventBus] Socket ${socketId} not found for joining room ${room}`, {
          socketId,
          room,
        });
      }
    } catch (error) {
      logger.error(`[EventBus] Failed to join room ${room}`, {
        socketId,
        room,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  leaveRoom(socketId: string, room: string): void {
    try {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(room);
        logger.debug(`[EventBus] Socket ${socketId} left room ${room}`, {
          socketId,
          room,
        });
      } else {
        logger.warn(`[EventBus] Socket ${socketId} not found for leaving room ${room}`, {
          socketId,
          room,
        });
      }
    } catch (error) {
      logger.error(`[EventBus] Failed to leave room ${room}`, {
        socketId,
        room,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the underlying Socket.io instance
   * Only use when Socket.io-specific features are needed
   */
  getSocketIOInstance(): Server {
    return this.io;
  }
}
