/**
 * Record Service Tests (with Dependency Injection)
 *
 * This is an EXAMPLE test file showing how to test services refactored with DI.
 * This demonstrates testing the refactored version in recordService.refactored.ts
 *
 * Key Testing Improvements with DI:
 * 1. No need for actual database connection
 * 2. Easy to mock database responses
 * 3. Can test error scenarios easily
 * 4. Tests run faster (no I/O)
 * 5. Better isolation between tests
 */

import RecordService from '../../services/recordService.refactored';
import {
  createMockDb,
  createMockLogger,
  createFailingDb,
  createMockDbWithSequence,
  mockData,
  createQueryResult,
} from '../helpers/mocks';

// Mock the external dependency
jest.mock('../../services/sleeperScheduleService', () => ({
  isWeekComplete: jest.fn(),
}));

import { isWeekComplete } from '../../services/sleeperScheduleService';

describe('RecordService (with DI)', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let recordService: RecordService;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create fresh mock instances
    mockDb = createMockDb();
    mockLogger = createMockLogger();

    // Create service instance with mocked dependencies
    recordService = new RecordService(mockDb, mockLogger);
  });

  describe('finalizeWeekScores', () => {
    it('should skip finalization if week is not complete', async () => {
      // Setup: Week is not complete
      (isWeekComplete as jest.Mock).mockResolvedValue(false);

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify week completion was checked
      expect(isWeekComplete).toHaveBeenCalledWith('2025', 5, 'regular');

      // Verify no database queries were made (since week not complete)
      expect(mockDb.querySpy).not.toHaveBeenCalled();

      // Verify appropriate logging
      expect(mockLogger.infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Week 5 is not complete yet')
      );
    });

    it('should skip finalization if no matchups found', async () => {
      // Setup: Week is complete but no matchups to finalize
      (isWeekComplete as jest.Mock).mockResolvedValue(true);
      mockDb.querySpy.mockResolvedValue(createQueryResult([]));

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify query was made
      expect(mockDb.querySpy).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, roster1_id, roster2_id'),
        [1, 5, '2025']
      );

      // Verify logging
      expect(mockLogger.infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('All matchups for week 5 already finalized')
      );
    });

    it('should finalize matchups and update roster records', async () => {
      // Setup: Week is complete with matchups
      (isWeekComplete as jest.Mock).mockResolvedValue(true);

      const mockMatchups = [
        mockData.matchup({
          id: 1,
          roster1_id: 10,
          roster2_id: 11,
          roster1_score: 120.5,
          roster2_score: 95.3,
        }),
      ];

      const mockRosters = [
        {
          id: 10,
          settings: {
            wins: 3,
            losses: 2,
            ties: 0,
            points_for: 500,
            points_against: 450,
          },
        },
        {
          id: 11,
          settings: {
            wins: 2,
            losses: 3,
            ties: 0,
            points_for: 480,
            points_against: 520,
          },
        },
      ];

      // Setup sequential responses for multiple queries
      const dbWithSequence = createMockDbWithSequence([
        createQueryResult(mockMatchups), // First call: get matchups
        createQueryResult(mockRosters), // Second call: get rosters
        createQueryResult([]), // Third call: batch update rosters
        createQueryResult([]), // Fourth call: batch update matchups
      ]);

      recordService = new RecordService(dbWithSequence, mockLogger);

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify all database calls were made
      expect(dbWithSequence.querySpy).toHaveBeenCalledTimes(4);

      // Verify roster update was called with correct data
      const rosterUpdateCall = dbWithSequence.querySpy.mock.calls[2];
      expect(rosterUpdateCall[0]).toContain('UPDATE rosters');

      // Should update wins (roster 10 won, roster 11 lost)
      const [, rosterIds, wins, losses] = rosterUpdateCall[1] as any[];
      expect(rosterIds).toContain(10);
      expect(rosterIds).toContain(11);
      expect(wins[rosterIds.indexOf(10)]).toBe(4); // 3 + 1 win
      expect(losses[rosterIds.indexOf(11)]).toBe(4); // 3 + 1 loss

      // Verify matchups were marked as finalized
      const matchupUpdateCall = dbWithSequence.querySpy.mock.calls[3];
      expect(matchupUpdateCall[0]).toContain('UPDATE matchups');
      expect(matchupUpdateCall[0]).toContain('finalized = TRUE');

      // Verify success logging
      expect(mockLogger.infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully finalized week 5 scores')
      );
    });

    it('should handle bye weeks correctly (no opponent)', async () => {
      // Setup: Matchup with bye week (roster2_id is null)
      (isWeekComplete as jest.Mock).mockResolvedValue(true);

      const mockMatchups = [
        mockData.matchup({
          id: 1,
          roster1_id: 10,
          roster2_id: null, // Bye week
          roster1_score: 120.5,
          roster2_score: 0,
        }),
      ];

      const mockRosters = [
        {
          id: 10,
          settings: {
            wins: 3,
            losses: 2,
            ties: 0,
            points_for: 500,
            points_against: 450,
          },
        },
      ];

      const dbWithSequence = createMockDbWithSequence([
        createQueryResult(mockMatchups),
        createQueryResult(mockRosters),
        createQueryResult([]),
        createQueryResult([]),
      ]);

      recordService = new RecordService(dbWithSequence, mockLogger);

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify roster stats were updated correctly
      const rosterUpdateCall = dbWithSequence.querySpy.mock.calls[2];
      const [, rosterIds, wins, losses, ties] = rosterUpdateCall[1] as any[];

      // Bye weeks don't affect W-L record (stays same)
      expect(wins[0]).toBe(3); // No change
      expect(losses[0]).toBe(2); // No change
      expect(ties[0]).toBe(0); // No change
    });

    it('should handle database errors gracefully', async () => {
      // Setup: Database error
      (isWeekComplete as jest.Mock).mockResolvedValue(true);
      const dbError = new Error('Database connection failed');
      const failingDb = createFailingDb(dbError);

      recordService = new RecordService(failingDb, mockLogger);

      // Verify error is thrown
      await expect(
        recordService.finalizeWeekScores(1, 5, '2025', 'regular')
      ).rejects.toThrow('Database connection failed');

      // Verify error was logged
      expect(mockLogger.errorSpy).toHaveBeenCalledWith(
        'Error finalizing week scores:',
        { error: dbError }
      );
    });

    it('should calculate ties correctly', async () => {
      // Setup: Matchup with tied score
      (isWeekComplete as jest.Mock).mockResolvedValue(true);

      const mockMatchups = [
        mockData.matchup({
          id: 1,
          roster1_id: 10,
          roster2_id: 11,
          roster1_score: 100.0,
          roster2_score: 100.0, // Tied!
        }),
      ];

      const mockRosters = [
        { id: 10, settings: { wins: 3, losses: 2, ties: 0, points_for: 500, points_against: 450 } },
        { id: 11, settings: { wins: 2, losses: 3, ties: 0, points_for: 480, points_against: 520 } },
      ];

      const dbWithSequence = createMockDbWithSequence([
        createQueryResult(mockMatchups),
        createQueryResult(mockRosters),
        createQueryResult([]),
        createQueryResult([]),
      ]);

      recordService = new RecordService(dbWithSequence, mockLogger);

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify both rosters got a tie
      const rosterUpdateCall = dbWithSequence.querySpy.mock.calls[2];
      const [, , wins, losses, ties] = rosterUpdateCall[1] as any[];

      expect(wins[0]).toBe(3); // No change
      expect(wins[1]).toBe(2); // No change
      expect(losses[0]).toBe(2); // No change
      expect(losses[1]).toBe(3); // No change
      expect(ties[0]).toBe(1); // Increased by 1
      expect(ties[1]).toBe(1); // Increased by 1
    });

    it('should update points for and against correctly', async () => {
      // Setup
      (isWeekComplete as jest.Mock).mockResolvedValue(true);

      const mockMatchups = [
        mockData.matchup({
          id: 1,
          roster1_id: 10,
          roster2_id: 11,
          roster1_score: 125.75,
          roster2_score: 98.25,
        }),
      ];

      const mockRosters = [
        { id: 10, settings: { wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 } },
        { id: 11, settings: { wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 } },
      ];

      const dbWithSequence = createMockDbWithSequence([
        createQueryResult(mockMatchups),
        createQueryResult(mockRosters),
        createQueryResult([]),
        createQueryResult([]),
      ]);

      recordService = new RecordService(dbWithSequence, mockLogger);

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify points were accumulated
      const rosterUpdateCall = dbWithSequence.querySpy.mock.calls[2];
      const [, , , , , pointsFor, pointsAgainst] = rosterUpdateCall[1] as any[];

      // Roster 10: PF = 125.75, PA = 98.25
      expect(pointsFor[0]).toBeCloseTo(125.75, 2);
      expect(pointsAgainst[0]).toBeCloseTo(98.25, 2);

      // Roster 11: PF = 98.25, PA = 125.75
      expect(pointsFor[1]).toBeCloseTo(98.25, 2);
      expect(pointsAgainst[1]).toBeCloseTo(125.75, 2);
    });
  });

  describe('resetAllRosterRecords', () => {
    it('should reset all roster records to zero', async () => {
      mockDb.querySpy.mockResolvedValue(createQueryResult([]));

      await recordService.resetAllRosterRecords(1);

      // Verify reset query was called
      expect(mockDb.querySpy).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rosters'),
        [1]
      );

      // Verify query sets all stats to 0
      const queryString = mockDb.querySpy.mock.calls[0][0];
      expect(queryString).toContain("'{wins}', '0'");
      expect(queryString).toContain("'{losses}', '0'");
      expect(queryString).toContain("'{ties}', '0'");
      expect(queryString).toContain("'{points_for}', '0'");
      expect(queryString).toContain("'{points_against}', '0'");

      // Verify logging
      expect(mockLogger.infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reset all roster records for league 1')
      );
    });

    it('should handle errors gracefully', async () => {
      const dbError = new Error('Reset failed');
      mockDb.querySpy.mockRejectedValue(dbError);

      await expect(recordService.resetAllRosterRecords(1)).rejects.toThrow('Reset failed');

      expect(mockLogger.errorSpy).toHaveBeenCalledWith(
        'Error resetting roster records:',
        { error: dbError }
      );
    });
  });

  describe('recalculateAllRecords', () => {
    it('should recalculate records from all completed matchups', async () => {
      // This test would be similar but more complex
      // Omitted for brevity - see pattern above
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple matchups in one week', async () => {
      (isWeekComplete as jest.Mock).mockResolvedValue(true);

      // 3 matchups in the same week
      const mockMatchups = [
        mockData.matchup({ id: 1, roster1_id: 10, roster2_id: 11, roster1_score: 120, roster2_score: 100 }),
        mockData.matchup({ id: 2, roster1_id: 12, roster2_id: 13, roster1_score: 95, roster2_score: 110 }),
        mockData.matchup({ id: 3, roster1_id: 14, roster2_id: null, roster1_score: 105, roster2_score: 0 }), // Bye
      ];

      const mockRosters = [10, 11, 12, 13, 14].map((id) => ({
        id,
        settings: { wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 },
      }));

      const dbWithSequence = createMockDbWithSequence([
        createQueryResult(mockMatchups),
        createQueryResult(mockRosters),
        createQueryResult([]),
        createQueryResult([]),
      ]);

      recordService = new RecordService(dbWithSequence, mockLogger);

      await recordService.finalizeWeekScores(1, 5, '2025', 'regular');

      // Verify all 5 rosters were updated
      const rosterUpdateCall = dbWithSequence.querySpy.mock.calls[2];
      const [, rosterIds] = rosterUpdateCall[1] as any[];
      expect(rosterIds).toHaveLength(5);
      expect(rosterIds).toContain(10);
      expect(rosterIds).toContain(11);
      expect(rosterIds).toContain(12);
      expect(rosterIds).toContain(13);
      expect(rosterIds).toContain(14);

      // Verify all 3 matchups were finalized
      const matchupUpdateCall = dbWithSequence.querySpy.mock.calls[3];
      const [, matchupIds] = matchupUpdateCall[1] as any[];
      expect(matchupIds).toEqual([1, 2, 3]);
    });
  });
});
