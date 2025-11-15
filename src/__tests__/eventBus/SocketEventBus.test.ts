/**
 * SocketEventBus Tests
 *
 * Tests for the SocketEventBus implementation
 */

import { SocketEventBus } from '../../services/eventBus/SocketEventBus';
import { Server } from 'socket.io';

// Mock Socket.io
jest.mock('socket.io');

describe('SocketEventBus', () => {
  let mockIo: jest.Mocked<Server>;
  let eventBus: SocketEventBus;

  beforeEach(() => {
    // Create mock Socket.io server
    mockIo = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      sockets: {
        in: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      },
    } as any;

    eventBus = new SocketEventBus(mockIo);
  });

  describe('emit', () => {
    it('should emit event to all clients', () => {
      eventBus.emit('test:event', { message: 'hello' });

      expect(mockIo.emit).toHaveBeenCalledWith('test:event', { message: 'hello' });
    });

    it('should handle errors gracefully', () => {
      mockIo.emit = jest.fn().mockImplementation(() => {
        throw new Error('Socket error');
      });

      // Should not throw
      expect(() => {
        eventBus.emit('test:event', {});
      }).not.toThrow();
    });
  });

  describe('emitToRoom', () => {
    it('should emit event to specific room', () => {
      const mockRoomEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockRoomEmit,
      }) as any;

      eventBus.emitToRoom('room123', 'room:event', { data: 'test' });

      expect(mockIo.to).toHaveBeenCalledWith('room123');
      expect(mockRoomEmit).toHaveBeenCalledWith('room:event', { data: 'test' });
    });

    it('should handle errors gracefully', () => {
      mockIo.to = jest.fn().mockImplementation(() => {
        throw new Error('Room error');
      });

      expect(() => {
        eventBus.emitToRoom('room123', 'event', {});
      }).not.toThrow();
    });
  });

  describe('emitToUser', () => {
    it('should emit event to user-specific room', () => {
      const mockUserEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockUserEmit,
      }) as any;

      eventBus.emitToUser(123, 'user:notification', { message: 'hello' });

      expect(mockIo.to).toHaveBeenCalledWith('user:123');
      expect(mockUserEmit).toHaveBeenCalledWith('user:notification', { message: 'hello' });
    });

    it('should handle numeric and string user IDs', () => {
      const mockUserEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockUserEmit,
      }) as any;

      eventBus.emitToUser(456, 'notification', {});

      expect(mockIo.to).toHaveBeenCalledWith('user:456');
    });
  });

  describe('joinRoom', () => {
    it('should join socket to room', () => {
      const mockSocket = {
        join: jest.fn(),
      };

      mockIo.sockets = {
        sockets: {
          get: jest.fn().mockReturnValue(mockSocket),
        },
      } as any;

      eventBus.joinRoom('socket123', 'room456');

      expect(mockSocket.join).toHaveBeenCalledWith('room456');
    });

    it('should handle missing socket gracefully', () => {
      mockIo.sockets = {
        sockets: {
          get: jest.fn().mockReturnValue(undefined),
        },
      } as any;

      expect(() => {
        eventBus.joinRoom('nonexistent', 'room');
      }).not.toThrow();
    });
  });

  describe('leaveRoom', () => {
    it('should remove socket from room', () => {
      const mockSocket = {
        leave: jest.fn(),
      };

      mockIo.sockets = {
        sockets: {
          get: jest.fn().mockReturnValue(mockSocket),
        },
      } as any;

      eventBus.leaveRoom('socket123', 'room456');

      expect(mockSocket.leave).toHaveBeenCalledWith('room456');
    });

    it('should handle missing socket gracefully', () => {
      mockIo.sockets = {
        sockets: {
          get: jest.fn().mockReturnValue(undefined),
        },
      } as any;

      expect(() => {
        eventBus.leaveRoom('nonexistent', 'room');
      }).not.toThrow();
    });
  });

  describe('getSocketIOInstance', () => {
    it('should return the underlying Socket.io instance', () => {
      const io = eventBus.getSocketIOInstance();
      expect(io).toBe(mockIo);
    });
  });

  describe('integration scenarios', () => {
    it('should handle draft events', () => {
      const mockDraftEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockDraftEmit,
      }) as any;

      // Simulate draft started event
      eventBus.emitToRoom('draft:123', 'draft_started', {
        draftId: 123,
        status: 'active',
      });

      expect(mockIo.to).toHaveBeenCalledWith('draft:123');
      expect(mockDraftEmit).toHaveBeenCalledWith('draft_started', {
        draftId: 123,
        status: 'active',
      });
    });

    it('should handle trade notifications', () => {
      const mockTradeEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockTradeEmit,
      }) as any;

      // Simulate trade proposed event
      eventBus.emitToRoom('league:456', 'trade_proposed', {
        tradeId: 789,
        initiatorRosterId: 1,
        receiverRosterId: 2,
      });

      expect(mockIo.to).toHaveBeenCalledWith('league:456');
      expect(mockTradeEmit).toHaveBeenCalledWith('trade_proposed', {
        tradeId: 789,
        initiatorRosterId: 1,
        receiverRosterId: 2,
      });
    });

    it('should handle user notifications', () => {
      const mockNotificationEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockNotificationEmit,
      }) as any;

      eventBus.emitToUser(123, 'notification', {
        title: 'Draft Starting Soon',
        message: 'Your draft starts in 10 minutes',
      });

      expect(mockIo.to).toHaveBeenCalledWith('user:123');
      expect(mockNotificationEmit).toHaveBeenCalledWith('notification', {
        title: 'Draft Starting Soon',
        message: 'Your draft starts in 10 minutes',
      });
    });
  });

  describe('error handling', () => {
    it('should log errors but not crash on emit failures', () => {
      mockIo.emit = jest.fn().mockImplementation(() => {
        throw new Error('Network error');
      });

      // Should handle error gracefully
      eventBus.emit('test', {});

      // Event bus should still be functional
      mockIo.emit = jest.fn();
      eventBus.emit('test2', {});
      expect(mockIo.emit).toHaveBeenCalledWith('test2', {});
    });

    it('should handle malformed room names', () => {
      const mockRoomEmit = jest.fn();
      mockIo.to = jest.fn().mockReturnValue({
        emit: mockRoomEmit,
      }) as any;

      eventBus.emitToRoom('', 'event', {});
      eventBus.emitToRoom('room:with:colons', 'event', {});

      // Should still attempt to emit
      expect(mockIo.to).toHaveBeenCalled();
    });
  });
});
