/**
 * Record Service Tests
 *
 * Tests record finalization and tracking including:
 * - Finalizing week scores (W-L-T record updates)
 * - Handling wins, losses, and ties
 * - Bye week processing
 * - Points accumulation (PF/PA)
 * - Record reset functionality
 * - Recalculation from completed matchups
 */

import {
  finalizeWeekScores,
  resetAllRosterRecords,
  recalculateAllRecords,
} from '../../services/recordService';
import pool from '../../config/database';
import * as sleeperScheduleService from '../../services/sleeperScheduleService';

// Mock the isWeekComplete function
jest.mock('../../services/sleeperScheduleService', () => ({
  isWeekComplete: jest.fn(),
}));

describe('Record Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];
  let testMatchupIds: number[] = [];

  beforeAll(async () => {
    const uniqueCode = `RC${Date.now().toString().slice(-8)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'recordtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'RC%'`);

    // Create test users
    for (let i = 1; i <= 4; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`recordtest${i}`, `record${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Record Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        4,
        JSON.stringify({ commissioner_id: testUserIds[0], start_week: 1 }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'BN', count: 5 }
        ]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test rosters with initial 0-0 records
    for (let i = 0; i < 4; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          testLeagueId,
          testUserIds[i],
          i + 1,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({
            wins: 0,
            losses: 0,
            ties: 0,
            points_for: 0,
            points_against: 0
          })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'recordtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'RC%'`);
  });

  beforeEach(async () => {
    // Clear matchups and reset records before each test
    await pool.query(`DELETE FROM matchups WHERE league_id = $1`, [testLeagueId]);
    await resetAllRosterRecords(testLeagueId);
    testMatchupIds = [];

    // Reset mock
    jest.clearAllMocks();
  });

  describe('finalizeWeekScores', () => {
    it('should update records when week is complete with a win', async () => {
      // Mock week as complete
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(true);

      // Create matchup: Roster 1 (120.5) beats Roster 2 (95.3)
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 120.5, 95.3, 'completed', false]
      );
      testMatchupIds.push(matchupResult.rows[0].id);

      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Check roster 1 (winner)
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(1);
      expect(roster1.rows[0].settings.losses).toBe(0);
      expect(roster1.rows[0].settings.ties).toBe(0);
      expect(roster1.rows[0].settings.points_for).toBe(120.5);
      expect(roster1.rows[0].settings.points_against).toBe(95.3);

      // Check roster 2 (loser)
      const roster2 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[1]]);
      expect(roster2.rows[0].settings.wins).toBe(0);
      expect(roster2.rows[0].settings.losses).toBe(1);
      expect(roster2.rows[0].settings.ties).toBe(0);
      expect(roster2.rows[0].settings.points_for).toBe(95.3);
      expect(roster2.rows[0].settings.points_against).toBe(120.5);

      // Verify matchup marked as finalized
      const matchup = await pool.query('SELECT finalized, status FROM matchups WHERE id = $1', [testMatchupIds[0]]);
      expect(matchup.rows[0].finalized).toBe(true);
      expect(matchup.rows[0].status).toBe('completed');
    });

    it('should handle ties correctly', async () => {
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(true);

      // Create matchup: Roster 1 (100.0) ties Roster 2 (100.0)
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', false]
      );

      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Check both rosters have ties
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(0);
      expect(roster1.rows[0].settings.losses).toBe(0);
      expect(roster1.rows[0].settings.ties).toBe(1);

      const roster2 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[1]]);
      expect(roster2.rows[0].settings.ties).toBe(1);
    });

    it('should handle bye weeks correctly', async () => {
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(true);

      // Create bye week matchup: Roster 1 has bye (roster2_id is null)
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], null, 0, 0, 'completed', false]
      );

      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Roster 1 should have no W/L/T change (bye week)
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(0);
      expect(roster1.rows[0].settings.losses).toBe(0);
      expect(roster1.rows[0].settings.ties).toBe(0);
      expect(roster1.rows[0].settings.points_for).toBe(0);
      expect(roster1.rows[0].settings.points_against).toBe(0);
    });

    it('should skip finalization if week is not complete', async () => {
      // Mock week as incomplete
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(false);

      // Create matchup
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 90.0, 'in_progress', false]
      );

      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Records should not be updated
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(0);
    });

    it('should skip already finalized matchups', async () => {
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(true);

      // Create already finalized matchup
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 90.0, 'completed', true]
      );

      // Manually set roster 1 to 1-0 (simulating already processed)
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(settings, '{wins}', '1') WHERE id = $1`,
        [testRosterIds[0]]
      );

      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Record should remain unchanged (still 1-0, not 2-0)
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(1);
    });

    it('should accumulate points over multiple weeks', async () => {
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(true);

      // Week 1: Roster 1 scores 120.5, opponent scores 95.3
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 120.5, 95.3, 'completed', false]
      );
      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Week 2: Roster 1 scores 105.2, opponent scores 110.8
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 2, '2025', testRosterIds[0], testRosterIds[2], 105.2, 110.8, 'completed', false]
      );
      await finalizeWeekScores(testLeagueId, 2, '2025', 'regular');

      // Check accumulated points
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(1);
      expect(roster1.rows[0].settings.losses).toBe(1);
      expect(roster1.rows[0].settings.points_for).toBeCloseTo(225.7, 1); // 120.5 + 105.2
      expect(roster1.rows[0].settings.points_against).toBeCloseTo(206.1, 1); // 95.3 + 110.8
    });

    it('should handle multiple matchups in same week', async () => {
      (sleeperScheduleService.isWeekComplete as jest.Mock).mockResolvedValue(true);

      // Create two matchups for week 1
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 120.0, 100.0, 'completed', false]
      );
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[2], testRosterIds[3], 95.5, 110.2, 'completed', false]
      );

      await finalizeWeekScores(testLeagueId, 1, '2025', 'regular');

      // Verify all four rosters updated correctly
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(1);

      const roster2 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[1]]);
      expect(roster2.rows[0].settings.losses).toBe(1);

      const roster3 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[2]]);
      expect(roster3.rows[0].settings.losses).toBe(1);

      const roster4 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[3]]);
      expect(roster4.rows[0].settings.wins).toBe(1);
    });
  });

  describe('resetAllRosterRecords', () => {
    it('should reset all rosters to 0-0-0 with zero points', async () => {
      // Set some rosters to have records
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '5'),
            '{losses}', '3'
          ),
          '{points_for}', '800.5'
        ) WHERE id = $1`,
        [testRosterIds[0]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(settings, '{wins}', '7'),
          '{ties}', '2'
        ) WHERE id = $1`,
        [testRosterIds[1]]
      );

      // Reset all records
      await resetAllRosterRecords(testLeagueId);

      // Verify all rosters reset to 0
      for (const rosterId of testRosterIds) {
        const roster = await pool.query('SELECT settings FROM rosters WHERE id = $1', [rosterId]);
        expect(roster.rows[0].settings.wins).toBe(0);
        expect(roster.rows[0].settings.losses).toBe(0);
        expect(roster.rows[0].settings.ties).toBe(0);
        expect(roster.rows[0].settings.points_for).toBe(0);
        expect(roster.rows[0].settings.points_against).toBe(0);
      }
    });

    it('should preserve other settings when resetting', async () => {
      // Set roster with custom settings
      await pool.query(
        `UPDATE rosters SET settings = $1 WHERE id = $2`,
        [
          JSON.stringify({
            wins: 5,
            losses: 2,
            custom_field: 'test_value',
            another_setting: 123
          }),
          testRosterIds[0]
        ]
      );

      await resetAllRosterRecords(testLeagueId);

      const roster = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster.rows[0].settings.wins).toBe(0);
      expect(roster.rows[0].settings.custom_field).toBe('test_value');
      expect(roster.rows[0].settings.another_setting).toBe(123);
    });
  });

  describe('recalculateAllRecords', () => {
    beforeEach(async () => {
      // Reset league settings to start_week = 1
      await pool.query(
        `UPDATE leagues SET settings = jsonb_set(settings, '{start_week}', '1') WHERE id = $1`,
        [testLeagueId]
      );

      // Create completed matchups for weeks 1-3
      // Week 1
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 120.0, 100.0, 'completed', true]
      );
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[2], testRosterIds[3], 95.0, 95.0, 'completed', true]
      );

      // Week 2
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 2, '2025', testRosterIds[0], testRosterIds[2], 110.5, 105.2, 'completed', true]
      );
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 2, '2025', testRosterIds[1], testRosterIds[3], 100.0, 115.0, 'completed', true]
      );

      // Week 3
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 3, '2025', testRosterIds[0], testRosterIds[3], 125.0, 105.0, 'completed', true]
      );
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 3, '2025', testRosterIds[1], testRosterIds[2], 90.0, 100.0, 'completed', true]
      );
    });

    it('should recalculate all records from completed matchups', async () => {
      // Manually corrupt roster 1's record
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(settings, '{wins}', '10'),
          '{points_for}', '5000'
        ) WHERE id = $1`,
        [testRosterIds[0]]
      );

      // Recalculate
      await recalculateAllRecords(testLeagueId, '2025');

      // Verify roster 1's record is correct
      // Week 1: W vs R2 (120-100)
      // Week 2: W vs R3 (110.5-105.2)
      // Week 3: W vs R4 (125-105)
      // Expected: 3-0-0, PF=355.5, PA=310.2
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(3);
      expect(roster1.rows[0].settings.losses).toBe(0);
      expect(roster1.rows[0].settings.ties).toBe(0);
      expect(roster1.rows[0].settings.points_for).toBeCloseTo(355.5, 1);
      expect(roster1.rows[0].settings.points_against).toBeCloseTo(310.2, 1);
    });

    it('should handle all roster records correctly', async () => {
      await recalculateAllRecords(testLeagueId, '2025');

      // Roster 1: 3-0-0 (W W W)
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(3);
      expect(roster1.rows[0].settings.losses).toBe(0);

      // Roster 2: 0-3-0 (L L L) - Week 1: L vs R1, Week 2: L vs R4, Week 3: L vs R3
      const roster2 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[1]]);
      expect(roster2.rows[0].settings.wins).toBe(0);
      expect(roster2.rows[0].settings.losses).toBe(3);
      expect(roster2.rows[0].settings.ties).toBe(0);

      // Roster 3: 1-1-1 (T L W)
      const roster3 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[2]]);
      expect(roster3.rows[0].settings.wins).toBe(1);
      expect(roster3.rows[0].settings.losses).toBe(1);
      expect(roster3.rows[0].settings.ties).toBe(1);

      // Roster 4: 1-2-0 (T W L)
      const roster4 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[3]]);
      expect(roster4.rows[0].settings.wins).toBe(1);
      expect(roster4.rows[0].settings.losses).toBe(2);
      expect(roster4.rows[0].settings.ties).toBe(0);
    });

    it('should respect start_week setting', async () => {
      // Update league to start at week 2
      await pool.query(
        `UPDATE leagues SET settings = jsonb_set(settings, '{start_week}', '2') WHERE id = $1`,
        [testLeagueId]
      );

      await recalculateAllRecords(testLeagueId, '2025');

      // Roster 1 should only have weeks 2-3 counted (not week 1)
      // Week 2: W vs R3 (110.5-105.2)
      // Week 3: W vs R4 (125-105)
      // Expected: 2-0-0, PF=235.5, PA=210.2
      const roster1 = await pool.query('SELECT settings FROM rosters WHERE id = $1', [testRosterIds[0]]);
      expect(roster1.rows[0].settings.wins).toBe(2);
      expect(roster1.rows[0].settings.points_for).toBeCloseTo(235.5, 1);
    });

    it('should mark all matchups as finalized after recalculation', async () => {
      // Mark some as not finalized
      await pool.query(
        `UPDATE matchups SET finalized = FALSE WHERE league_id = $1`,
        [testLeagueId]
      );

      await recalculateAllRecords(testLeagueId, '2025');

      // All should be finalized
      const matchups = await pool.query(
        'SELECT COUNT(*) as count FROM matchups WHERE league_id = $1 AND finalized = TRUE',
        [testLeagueId]
      );
      expect(parseInt(matchups.rows[0].count)).toBe(6); // 6 total matchups
    });
  });
});
