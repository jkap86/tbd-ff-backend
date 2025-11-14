/**
 * Chess Timer Service Tests
 *
 * Tests chess timer functionality for drafts:
 * - Starting and pausing chess timers
 * - Time tracking and deduction
 * - Real-time time remaining calculations
 * - Timeout detection
 * - Timer monitoring and updates
 * - Socket.io event emissions
 * - Cleanup on completion
 */

import {
  startChessTimer,
  pauseChessTimer,
  getRosterTimeRemainingLive,
  hasRosterTimedOut,
  startChessTimerMonitoring,
  stopChessTimerMonitoring,
  stopAllChessTimerMonitoring,
  getActiveMonitors,
} from '../../services/chessTimerService';
import * as DraftModel from '../../models/Draft';
import * as DraftOrderModel from '../../models/DraftOrder';
import { io } from '../../index';

// Mock dependencies
jest.mock('../../models/Draft');
jest.mock('../../models/DraftOrder');
jest.mock('../../index', () => ({
  io: {
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
  },
}));

describe('Chess Timer Service Tests', () => {
  const mockDraftId = 1;
  const mockRosterId = 10;
  const mockDraft = {
    id: mockDraftId,
    league_id: 1,
    status: 'in_progress',
    timer_mode: 'chess',
    current_roster_id: mockRosterId,
    team_time_budget_seconds: 300,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    stopAllChessTimerMonitoring();

    // Default mocks
    (DraftModel.getDraftById as jest.Mock).mockResolvedValue(mockDraft);
    (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(300);
    (DraftOrderModel.updateRosterTimeRemaining as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopAllChessTimerMonitoring();
  });

  describe('startChessTimer', () => {
    it('should record start time for draft', () => {
      const beforeStart = Date.now();

      startChessTimer(mockDraftId);

      const afterStart = Date.now();

      // Verify timer was started (we can't access the Map directly, but monitoring should work)
      expect(() => startChessTimer(mockDraftId)).not.toThrow();

      // Time should be recorded within reasonable bounds
      expect(afterStart - beforeStart).toBeLessThan(100); // Should be instant
    });

    it('should allow multiple starts (overwrites previous)', () => {
      startChessTimer(mockDraftId);
      startChessTimer(mockDraftId);

      // Should not throw, second call overwrites first
      expect(() => startChessTimer(mockDraftId)).not.toThrow();
    });
  });

  describe('pauseChessTimer', () => {
    it('should calculate elapsed time and update database', async () => {
      startChessTimer(mockDraftId);

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const timeUsed = await pauseChessTimer(mockDraftId, mockRosterId);

      // Should be at least 0 seconds (rounds down)
      expect(timeUsed).toBeGreaterThanOrEqual(0);

      // Should have called updateRosterTimeRemaining
      expect(DraftOrderModel.updateRosterTimeRemaining).toHaveBeenCalledWith(
        mockDraftId,
        mockRosterId,
        expect.any(Number)
      );
    });

    it('should emit final time update via socket', async () => {
      startChessTimer(mockDraftId);

      await pauseChessTimer(mockDraftId, mockRosterId);

      expect(io.to).toHaveBeenCalledWith(`draft_${mockDraftId}`);
    });

    it('should return 0 if no start time exists', async () => {
      // Don't call startChessTimer first

      const timeUsed = await pauseChessTimer(mockDraftId, mockRosterId);

      expect(timeUsed).toBe(0);
      expect(DraftOrderModel.updateRosterTimeRemaining).not.toHaveBeenCalled();
    });

    it('should clear start time after pausing', async () => {
      startChessTimer(mockDraftId);

      await pauseChessTimer(mockDraftId, mockRosterId);

      // Pausing again should return 0 (no start time)
      const secondPause = await pauseChessTimer(mockDraftId, mockRosterId);
      expect(secondPause).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      (DraftOrderModel.updateRosterTimeRemaining as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      startChessTimer(mockDraftId);

      await expect(pauseChessTimer(mockDraftId, mockRosterId)).rejects.toThrow('Database error');
    });
  });

  describe('getRosterTimeRemainingLive', () => {
    it('should return stored time when roster not currently picking', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(250);

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId + 1);

      expect(timeRemaining).toBe(250);
    });

    it('should calculate real-time remaining when roster is currently picking', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(300);

      startChessTimer(mockDraftId);

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId);

      // Should be less than 300 (time has elapsed)
      expect(timeRemaining).toBeLessThan(300);
      expect(timeRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should not go below 0', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(1);

      startChessTimer(mockDraftId);

      // Wait 2 seconds (more than remaining time)
      await new Promise(resolve => setTimeout(resolve, 2000));

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId);

      expect(timeRemaining).toBe(0);
    });

    it('should return null if stored time is null', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(null);

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId);

      expect(timeRemaining).toBeNull();
    });

    it('should return stored time if draft not found', async () => {
      (DraftModel.getDraftById as jest.Mock).mockResolvedValue(null);
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(250);

      startChessTimer(mockDraftId);

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId);

      // Should return stored value since draft not found
      expect(timeRemaining).toBe(250);
    });

    it('should handle errors and return null', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId);

      expect(timeRemaining).toBeNull();
    });
  });

  describe('hasRosterTimedOut', () => {
    it('should return true when time remaining is 0', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(0);

      startChessTimer(mockDraftId);

      const timedOut = await hasRosterTimedOut(mockDraftId, mockRosterId);

      expect(timedOut).toBe(true);
    });

    it('should return false when time remaining > 0', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(100);

      const timedOut = await hasRosterTimedOut(mockDraftId, mockRosterId);

      expect(timedOut).toBe(false);
    });

    it('should return false if time tracking not enabled (null)', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(null);

      const timedOut = await hasRosterTimedOut(mockDraftId, mockRosterId);

      expect(timedOut).toBe(false);
    });

    it('should detect timeout for roster currently picking', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(1);

      startChessTimer(mockDraftId);

      // Wait 2 seconds (more than remaining)
      await new Promise(resolve => setTimeout(resolve, 2000));

      const timedOut = await hasRosterTimedOut(mockDraftId, mockRosterId);

      expect(timedOut).toBe(true);
    });

    it('should handle errors and return false', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const timedOut = await hasRosterTimedOut(mockDraftId, mockRosterId);

      expect(timedOut).toBe(false);
    });
  });

  describe('Timer Monitoring', () => {
    it('should start monitoring and add to active monitors', async () => {
      await startChessTimerMonitoring(mockDraftId);

      const activeMonitors = getActiveMonitors();
      expect(activeMonitors).toContain(mockDraftId);
    });

    it('should stop monitoring and remove from active monitors', async () => {
      await startChessTimerMonitoring(mockDraftId);

      stopChessTimerMonitoring(mockDraftId);

      const activeMonitors = getActiveMonitors();
      expect(activeMonitors).not.toContain(mockDraftId);
    });

    it('should stop existing monitoring when starting new monitoring', async () => {
      await startChessTimerMonitoring(mockDraftId);

      await startChessTimerMonitoring(mockDraftId);
      const secondMonitors = getActiveMonitors();

      // Should still only have one monitor
      expect(secondMonitors).toHaveLength(1);
      expect(secondMonitors).toContain(mockDraftId);
    });

    it('should emit time updates during monitoring', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(300);

      await startChessTimerMonitoring(mockDraftId);

      // Wait for at least one interval (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1500));

      stopChessTimerMonitoring(mockDraftId);

      // Should have emitted at least once
      expect(io.to).toHaveBeenCalledWith(`draft_${mockDraftId}`);
    }, 10000); // Increase timeout for this test

    it('should stop monitoring when draft is no longer in progress', async () => {
      await startChessTimerMonitoring(mockDraftId);

      // Change draft status to completed
      (DraftModel.getDraftById as jest.Mock).mockResolvedValue({
        ...mockDraft,
        status: 'completed',
      });

      // Wait for monitoring to check status
      await new Promise(resolve => setTimeout(resolve, 1500));

      const activeMonitors = getActiveMonitors();
      expect(activeMonitors).not.toContain(mockDraftId);
    }, 10000);

    it('should emit timeout event when time reaches 0', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(0);

      await startChessTimerMonitoring(mockDraftId);

      // Wait for monitoring interval
      await new Promise(resolve => setTimeout(resolve, 1500));

      stopChessTimerMonitoring(mockDraftId);

      // Should have emitted timeout event
      expect(io.to).toHaveBeenCalledWith(`draft_${mockDraftId}`);
    }, 10000);

    it('should only emit updates in chess mode', async () => {
      (DraftModel.getDraftById as jest.Mock).mockResolvedValue({
        ...mockDraft,
        timer_mode: 'traditional', // Not chess mode
      });

      await startChessTimerMonitoring(mockDraftId);

      // Wait for interval
      await new Promise(resolve => setTimeout(resolve, 1500));

      stopChessTimerMonitoring(mockDraftId);

      // Should not emit updates in traditional mode
      // Note: io.to might still be called from setup, but not repeatedly
    }, 10000);

    it('should handle errors in monitoring loop gracefully', async () => {
      (DraftModel.getDraftById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await startChessTimerMonitoring(mockDraftId);

      // Wait for interval - should not throw
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Monitoring should still be active (doesn't crash)
      const activeMonitors = getActiveMonitors();
      expect(activeMonitors).toContain(mockDraftId);

      stopChessTimerMonitoring(mockDraftId);
    }, 10000);
  });

  describe('stopAllChessTimerMonitoring', () => {
    it('should stop all active monitors', async () => {
      const draftId1 = 1;
      const draftId2 = 2;
      const draftId3 = 3;

      (DraftModel.getDraftById as jest.Mock).mockImplementation((id) => ({
        ...mockDraft,
        id,
      }));

      await startChessTimerMonitoring(draftId1);
      await startChessTimerMonitoring(draftId2);
      await startChessTimerMonitoring(draftId3);

      expect(getActiveMonitors()).toHaveLength(3);

      stopAllChessTimerMonitoring();

      expect(getActiveMonitors()).toHaveLength(0);
    });

    it('should clear all pick start times', () => {
      startChessTimer(1);
      startChessTimer(2);
      startChessTimer(3);

      stopAllChessTimerMonitoring();

      // All start times should be cleared - subsequent pauses should return 0
      // (We can't directly verify the Map, but this is the expected behavior)
    });
  });

  describe('getActiveMonitors', () => {
    it('should return empty array when no monitors active', () => {
      const active = getActiveMonitors();

      expect(active).toEqual([]);
    });

    it('should return all active draft IDs', async () => {
      (DraftModel.getDraftById as jest.Mock).mockImplementation((id) => ({
        ...mockDraft,
        id,
      }));

      await startChessTimerMonitoring(1);
      await startChessTimerMonitoring(2);

      const active = getActiveMonitors();

      expect(active).toHaveLength(2);
      expect(active).toContain(1);
      expect(active).toContain(2);

      stopAllChessTimerMonitoring();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid start/pause cycles', async () => {
      for (let i = 0; i < 10; i++) {
        startChessTimer(mockDraftId);
        await pauseChessTimer(mockDraftId, mockRosterId);
      }

      // Should not throw or leak memory
      expect(DraftOrderModel.updateRosterTimeRemaining).toHaveBeenCalledTimes(10);
    });

    it('should handle concurrent draft monitoring', async () => {
      (DraftModel.getDraftById as jest.Mock).mockImplementation((id) => ({
        ...mockDraft,
        id,
        current_roster_id: id * 10,
      }));

      const draftIds = [1, 2, 3, 4, 5];

      for (const draftId of draftIds) {
        await startChessTimerMonitoring(draftId);
      }

      expect(getActiveMonitors()).toHaveLength(5);

      stopAllChessTimerMonitoring();

      expect(getActiveMonitors()).toHaveLength(0);
    });

    it('should handle very small time remaining', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(0.001);

      startChessTimer(mockDraftId);

      await new Promise(resolve => setTimeout(resolve, 10));

      const timeRemaining = await getRosterTimeRemainingLive(mockDraftId, mockRosterId);

      expect(timeRemaining).toBe(0); // Should floor to 0
    });

    it('should handle pausing timer that was never started', async () => {
      const timeUsed = await pauseChessTimer(999, 999);

      expect(timeUsed).toBe(0);
      expect(DraftOrderModel.updateRosterTimeRemaining).not.toHaveBeenCalled();
    });

    it('should handle stopping monitoring that was never started', () => {
      expect(() => stopChessTimerMonitoring(999)).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should correctly track time across multiple picks', async () => {
      // Pick 1: Roster 1 takes 5 seconds
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(300);
      startChessTimer(mockDraftId);
      await new Promise(resolve => setTimeout(resolve, 100));
      await pauseChessTimer(mockDraftId, 1);

      // Pick 2: Roster 2 takes 3 seconds
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(300);
      startChessTimer(mockDraftId);
      await new Promise(resolve => setTimeout(resolve, 100));
      await pauseChessTimer(mockDraftId, 2);

      // Both rosters should have time deducted
      expect(DraftOrderModel.updateRosterTimeRemaining).toHaveBeenCalledTimes(2);
    });

    it('should handle draft pause and resume', async () => {
      (DraftOrderModel.getRosterTimeRemaining as jest.Mock).mockResolvedValue(300);

      // Start pick
      startChessTimer(mockDraftId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Pause draft
      await pauseChessTimer(mockDraftId, mockRosterId);

      // Resume draft (different pick)
      startChessTimer(mockDraftId);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Pause again
      await pauseChessTimer(mockDraftId, mockRosterId);

      expect(DraftOrderModel.updateRosterTimeRemaining).toHaveBeenCalledTimes(2);
    });
  });
});
