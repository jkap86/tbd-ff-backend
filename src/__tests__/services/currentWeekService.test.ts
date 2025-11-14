/**
 * Current Week Service Tests
 *
 * Tests NFL current week detection:
 * - Schedule-based week detection (checks for upcoming/live games)
 * - Caching mechanism (1-hour TTL)
 * - Date-based fallback estimation
 * - Cache refresh functionality
 *
 * The service determines which NFL week is currently active by examining
 * game statuses from the Sleeper API.
 */

import {
  getCurrentNFLWeek,
  refreshCurrentWeekCache,
} from '../../services/currentWeekService';
import * as sleeperScheduleService from '../../services/sleeperScheduleService';

// Mock the sleeperScheduleService
jest.mock('../../services/sleeperScheduleService');

describe('Current Week Service Tests', () => {
  beforeEach(() => {
    // Clear cache before each test
    refreshCurrentWeekCache();
    jest.clearAllMocks();
  });

  describe('getCurrentNFLWeek', () => {
    it('should detect week 1 when it has upcoming games', async () => {
      // Mock week 1 with upcoming games
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockResolvedValue([
        { game_id: '1', status: 'pre_game' },
        { game_id: '2', status: 'pre_game' }
      ]);

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBe(1);
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledWith('2025', 1, 'regular');
    });

    it('should detect week 5 when weeks 1-4 are complete', async () => {
      // Mock schedule calls
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([
          { game_id: '1', status: 'complete' }
        ]) // Week 1 complete
        .mockResolvedValueOnce([
          { game_id: '2', status: 'complete' }
        ]) // Week 2 complete
        .mockResolvedValueOnce([
          { game_id: '3', status: 'complete' }
        ]) // Week 3 complete
        .mockResolvedValueOnce([
          { game_id: '4', status: 'complete' }
        ]) // Week 4 complete
        .mockResolvedValueOnce([
          { game_id: '5', status: 'pre_game' }
        ]); // Week 5 upcoming

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBe(5);
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledTimes(5);
    });

    it('should detect current week with in-progress games', async () => {
      // Mock weeks 1-2 complete, week 3 in progress
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([
          { game_id: '1', status: 'complete' }
        ])
        .mockResolvedValueOnce([
          { game_id: '2', status: 'complete' }
        ])
        .mockResolvedValueOnce([
          { game_id: '3', status: 'in_progress' },
          { game_id: '4', status: 'pre_game' }
        ]);

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBe(3);
    });

    it('should return week 1 if schedule is empty from start', async () => {
      // Mock empty schedule for all weeks
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockResolvedValue([]);

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBe(1); // Returns previous week (max(1, 1-1) = 1)
    });

    it('should return previous week when encountering empty schedule', async () => {
      // Mock weeks 1-8 with games, then empty schedule
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([{ game_id: '1', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '2', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '3', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '4', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '5', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '6', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '7', status: 'complete' }])
        .mockResolvedValueOnce([{ game_id: '8', status: 'complete' }])
        .mockResolvedValueOnce([]); // Week 9 has no games (postseason started)

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBe(8); // Returns previous week
    });

    it('should use cache for subsequent calls within TTL', async () => {
      // Mock week 3 upcoming
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'pre_game' }]);

      // First call - should fetch from API
      const week1 = await getCurrentNFLWeek('2025', 'regular');
      expect(week1).toBe(3);
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledTimes(3);

      // Second call within TTL - should use cache
      const week2 = await getCurrentNFLWeek('2025', 'regular');
      expect(week2).toBe(3);
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledTimes(3); // No additional calls
    });

    it('should refresh cache after clearing', async () => {
      // First call
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'pre_game' }]);

      const week1 = await getCurrentNFLWeek('2025', 'regular');
      expect(week1).toBe(2);

      // Clear cache
      refreshCurrentWeekCache();

      // Second call - should fetch again
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'pre_game' }]);

      const week2 = await getCurrentNFLWeek('2025', 'regular');
      expect(week2).toBe(3);
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalled();
    });

    it('should fall back to date estimation on API error', async () => {
      // Mock API error
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      const week = await getCurrentNFLWeek('2025', 'regular');

      // Should return some week (date-based estimation)
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(18);
    });

    it('should handle different season types', async () => {
      // Test with postseason
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockResolvedValue([
        { game_id: '1', status: 'pre_game' }
      ]);

      const week = await getCurrentNFLWeek('2025', 'post');

      expect(week).toBe(1);
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledWith('2025', 1, 'post');
    });

    it('should detect week correctly when mix of complete and upcoming games', async () => {
      // Mock week 6 with mix of games
      (sleeperScheduleService.getWeekSchedule as jest.Mock)
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([{ status: 'complete' }])
        .mockResolvedValueOnce([
          { game_id: '1', status: 'complete' },
          { game_id: '2', status: 'complete' },
          { game_id: '3', status: 'pre_game' }, // Sunday/Monday games still upcoming
        ]);

      const week = await getCurrentNFLWeek('2025', 'regular');

      // Week 6 is current because it has upcoming games
      expect(week).toBe(6);
    });
  });

  describe('date-based estimation fallback', () => {
    it('should estimate week 1 for future seasons', async () => {
      // Mock API error to trigger fallback
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      // Test with a future season
      const futureYear = (new Date().getFullYear() + 1).toString();
      const week = await getCurrentNFLWeek(futureYear, 'regular');

      expect(week).toBe(1); // Default to week 1 for non-current seasons
    });

    it('should estimate week based on current date for current season', async () => {
      // Mock API error to trigger fallback
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      const currentYear = new Date().getFullYear().toString();
      const week = await getCurrentNFLWeek(currentYear, 'regular');

      // Should be between 1-18 based on date calculation
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(18);
    });
  });

  describe('refreshCurrentWeekCache', () => {
    it('should clear the cache', async () => {
      // Set up cache with first call
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockResolvedValue([
        { status: 'pre_game' }
      ]);

      await getCurrentNFLWeek('2025', 'regular');
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledTimes(1);

      // Call again - should use cache
      await getCurrentNFLWeek('2025', 'regular');
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledTimes(1);

      // Clear cache
      refreshCurrentWeekCache();

      // Call again - should fetch new data
      await getCurrentNFLWeek('2025', 'regular');
      expect(sleeperScheduleService.getWeekSchedule).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle week 18 as maximum', async () => {
      // Mock all 18 weeks as complete
      const completeWeek = [{ game_id: '1', status: 'complete' }];
      for (let i = 0; i < 18; i++) {
        (sleeperScheduleService.getWeekSchedule as jest.Mock).mockResolvedValueOnce(completeWeek);
      }

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBe(18);
    });

    it('should handle empty status array', async () => {
      (sleeperScheduleService.getWeekSchedule as jest.Mock).mockResolvedValue([]);

      const week = await getCurrentNFLWeek('2025', 'regular');

      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(18);
    });
  });
});
