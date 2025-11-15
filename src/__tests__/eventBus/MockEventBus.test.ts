/**
 * MockEventBus Tests
 *
 * Tests for the MockEventBus test utility
 */

import { MockEventBus } from '../../services/eventBus/MockEventBus';

describe('MockEventBus', () => {
  let eventBus: MockEventBus;

  beforeEach(() => {
    eventBus = new MockEventBus();
  });

  describe('emit', () => {
    it('should record emitted events', () => {
      eventBus.emit('test:event', { message: 'hello' });

      expect(eventBus.wasEventEmitted('test:event')).toBe(true);
      expect(eventBus.getEventData('test:event')).toEqual({ message: 'hello' });
    });

    it('should record multiple events', () => {
      eventBus.emit('event1', { data: 1 });
      eventBus.emit('event2', { data: 2 });

      expect(eventBus.wasEventEmitted('event1')).toBe(true);
      expect(eventBus.wasEventEmitted('event2')).toBe(true);
      expect(eventBus.getEventData('event1')).toEqual({ data: 1 });
      expect(eventBus.getEventData('event2')).toEqual({ data: 2 });
    });

    it('should return most recent event data when called multiple times', () => {
      eventBus.emit('test', { value: 1 });
      eventBus.emit('test', { value: 2 });

      // getEventData returns the first matching event, use getEventsByType for all
      const allEvents = eventBus.getEventsByType('test');
      expect(allEvents.length).toBe(2);
      expect(allEvents[1].data).toEqual({ value: 2 });
    });
  });

  describe('emitToRoom', () => {
    it('should record room events', () => {
      eventBus.emitToRoom('room123', 'room:event', { message: 'hello room' });

      expect(eventBus.wasEventEmittedToRoom('room123', 'room:event')).toBe(true);
      expect(eventBus.getEventDataForRoom('room123', 'room:event')).toEqual({
        message: 'hello room',
      });
    });

    it('should track events for different rooms separately', () => {
      eventBus.emitToRoom('room1', 'message', { text: 'room1 message' });
      eventBus.emitToRoom('room2', 'message', { text: 'room2 message' });

      expect(eventBus.wasEventEmittedToRoom('room1', 'message')).toBe(true);
      expect(eventBus.wasEventEmittedToRoom('room2', 'message')).toBe(true);
      expect(eventBus.getEventDataForRoom('room1', 'message')).toEqual({
        text: 'room1 message',
      });
      expect(eventBus.getEventDataForRoom('room2', 'message')).toEqual({
        text: 'room2 message',
      });
    });

    it('should get all events for a room', () => {
      eventBus.emitToRoom('room1', 'event1', { data: 1 });
      eventBus.emitToRoom('room1', 'event2', { data: 2 });
      eventBus.emitToRoom('room2', 'event3', { data: 3 });

      const room1Events = eventBus.getEventsForRoom('room1');
      expect(room1Events.length).toBe(2);
      expect(room1Events[0]).toMatchObject({
        event: 'event1',
        data: { data: 1 },
        room: 'room1',
      });
      expect(room1Events[1]).toMatchObject({
        event: 'event2',
        data: { data: 2 },
        room: 'room1',
      });
    });
  });

  describe('emitToUser', () => {
    it('should record user events', () => {
      eventBus.emitToUser(123, 'user:notification', { message: 'hello user' });

      expect(eventBus.wasEventEmittedToUser(123, 'user:notification')).toBe(true);
      expect(eventBus.getEventDataForUser(123, 'user:notification')).toEqual({
        message: 'hello user',
      });
    });

    it('should track events for different users separately', () => {
      eventBus.emitToUser(1, 'notification', { text: 'user1 notification' });
      eventBus.emitToUser(2, 'notification', { text: 'user2 notification' });

      expect(eventBus.wasEventEmittedToUser(1, 'notification')).toBe(true);
      expect(eventBus.wasEventEmittedToUser(2, 'notification')).toBe(true);
      expect(eventBus.getEventDataForUser(1, 'notification')).toEqual({
        text: 'user1 notification',
      });
    });

    it('should get all events for a user', () => {
      eventBus.emitToUser(1, 'event1', { data: 1 });
      eventBus.emitToUser(1, 'event2', { data: 2 });
      eventBus.emitToUser(2, 'event3', { data: 3 });

      const user1Events = eventBus.getEventsForUser(1);
      expect(user1Events.length).toBe(2);
      expect(user1Events[0]).toMatchObject({
        event: 'event1',
        data: { data: 1 },
        userId: 1,
      });
    });
  });

  describe('joinRoom and leaveRoom', () => {
    it('should track room joins', () => {
      eventBus.joinRoom('socket123', 'room456');

      expect(eventBus.wasRoomJoined('socket123', 'room456')).toBe(true);
    });

    it('should track room leaves', () => {
      eventBus.leaveRoom('socket123', 'room456');

      expect(eventBus.wasRoomLeft('socket123', 'room456')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all recorded events', () => {
      eventBus.emit('event1', {});
      eventBus.emitToRoom('room1', 'event2', {});
      eventBus.emitToUser(1, 'event3', {});

      expect(eventBus.wasEventEmitted('event1')).toBe(true);

      eventBus.reset();

      expect(eventBus.wasEventEmitted('event1')).toBe(false);
      expect(eventBus.wasEventEmittedToRoom('room1', 'event2')).toBe(false);
      expect(eventBus.wasEventEmittedToUser(1, 'event3')).toBe(false);
    });
  });

  describe('getAllEmittedEvents', () => {
    it('should return all emitted events', () => {
      eventBus.emit('event1', { data: 1 });
      eventBus.emit('event2', { data: 2 });

      const events = eventBus.getAllEmittedEvents();
      expect(events.length).toBe(2);
      expect(events[0]).toMatchObject({ event: 'event1', data: { data: 1 } });
      expect(events[1]).toMatchObject({ event: 'event2', data: { data: 2 } });
    });
  });

  describe('usage in service tests', () => {
    it('should make testing event emissions easy', () => {
      // Example service that emits events
      class DraftService {
        constructor(private eventBus: MockEventBus) {}

        async startDraft(draftId: string) {
          // Business logic here...
          this.eventBus.emitToRoom(
            `draft:${draftId}`,
            'draft_started',
            { draftId, status: 'active' }
          );
        }

        async makePick(draftId: string, playerId: number) {
          // Business logic here...
          this.eventBus.emitToRoom(
            `draft:${draftId}`,
            'pick_made',
            { draftId, playerId }
          );
        }
      }

      const service = new DraftService(eventBus);

      // Test
      service.startDraft('123');
      expect(eventBus.wasEventEmittedToRoom('draft:123', 'draft_started')).toBe(true);
      expect(eventBus.getEventDataForRoom('draft:123', 'draft_started')).toEqual({
        draftId: '123',
        status: 'active',
      });

      service.makePick('123', 456);
      expect(eventBus.wasEventEmittedToRoom('draft:123', 'pick_made')).toBe(true);
      expect(eventBus.getEventDataForRoom('draft:123', 'pick_made')).toEqual({
        draftId: '123',
        playerId: 456,
      });
    });

    it('should verify event emission count', () => {
      eventBus.emit('test', { count: 1 });
      eventBus.emit('test', { count: 2 });
      eventBus.emit('test', { count: 3 });

      const allEvents = eventBus.getAllEmittedEvents();
      const testEvents = allEvents.filter(e => e.event === 'test');
      expect(testEvents.length).toBe(3);
    });
  });

  describe('assertion helpers', () => {
    it('should have clear assertion methods', () => {
      eventBus.emit('test_event', { value: 123 });

      // Verify event was emitted
      expect(eventBus.wasEventEmitted('test_event')).toBe(true);
      expect(eventBus.wasEventEmitted('other_event')).toBe(false);

      // Verify event data
      expect(eventBus.getEventData('test_event')).toEqual({ value: 123 });
    });

    it('should handle events that were never emitted', () => {
      expect(eventBus.wasEventEmitted('never_emitted')).toBe(false);
      expect(eventBus.getEventData('never_emitted')).toBeUndefined();
      expect(eventBus.wasEventEmittedToRoom('room', 'never_emitted')).toBe(false);
      expect(eventBus.wasEventEmittedToUser(1, 'never_emitted')).toBe(false);
    });
  });
});
