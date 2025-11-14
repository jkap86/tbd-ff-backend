/**
 * League Median Service Tests
 *
 * Tests league median scoring variant where teams have TWO matchups per week:
 * 1. Head-to-head vs opponent
 * 2. vs League median (above median = W, below = L)
 *
 * Test coverage:
 * - Median calculation (odd/even number of scores)
 * - Median matchup generation
 * - Median matchup result updates
 * - Season-wide median matchup generation
 */

import {
  calculateWeekMedian,
  generateMedianMatchups,
  updateMedianMatchupResults,
  generateSeasonMedianMatchups,
} from '../../services/leagueMedianService';
import pool from '../../config/database';

describe('League Median Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];

  beforeAll(async () => {
    const uniqueCode = `LM${Date.now().toString().slice(-8)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'mediantest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'LM%'`);

    // Create test users (6 for a good median test)
    for (let i = 1; i <= 6; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`mediantest${i}`, `median${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league with median matchups enabled
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code,
        enable_league_median, median_matchup_week_start, median_matchup_week_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        'Median Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        6,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'BN', count: 5 }
        ]),
        uniqueCode,
        true, // enable_league_median
        1, // median_matchup_week_start
        14 // median_matchup_week_end
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test rosters
    for (let i = 0; i < 6; i++) {
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
          JSON.stringify({ wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'mediantest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'LM%'`);
  });

  beforeEach(async () => {
    // Clear matchups before each test
    await pool.query(`DELETE FROM matchups WHERE league_id = $1`, [testLeagueId]);
  });

  describe('calculateWeekMedian', () => {
    it('should calculate median with odd number of scores', async () => {
      // Create 3 matchups (6 rosters total) with odd number scores
      // Scores: 95.5, 100.0, 105.2, 110.0, 115.8, 120.0
      // Sorted: [95.5, 100.0, 105.2, 110.0, 115.8, 120.0]
      // Median (even count): (105.2 + 110.0) / 2 = 107.6

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 95.5, 'completed', false]
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[2], testRosterIds[3], 105.2, 110.0, 'completed', false]
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[4], testRosterIds[5], 120.0, 115.8, 'completed', false]
      );

      const median = await calculateWeekMedian(testLeagueId, 1);
      expect(median).toBeCloseTo(107.6, 1);
    });

    it('should calculate median with even number of scores (5 teams, one bye)', async () => {
      // Create 2 matchups + 1 bye (5 scores total)
      // Scores: 90.0, 100.0, 110.0, 120.0, 130.0
      // Median (odd count): 110.0

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 90.0, 'completed', false]
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[2], testRosterIds[3], 120.0, 110.0, 'completed', false]
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[4], null, 130.0, 0, 'completed', false]
      );

      const median = await calculateWeekMedian(testLeagueId, 1);
      expect(median).toBeCloseTo(110.0, 1);
    });

    it('should return 0 when no matchups exist', async () => {
      const median = await calculateWeekMedian(testLeagueId, 1);
      expect(median).toBe(0);
    });

    it('should ignore median matchups when calculating median', async () => {
      // Create regular matchups
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 110.0, 'completed', false]
      );

      // Create median matchup (should be ignored)
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup, median_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [testLeagueId, 1, '2025', testRosterIds[0], null, 100.0, null, 'completed', true, 105.0]
      );

      const median = await calculateWeekMedian(testLeagueId, 1);
      // Should be (100 + 110) / 2 = 105, NOT including the median matchup's 100
      expect(median).toBeCloseTo(105.0, 1);
    });
  });

  describe('generateMedianMatchups', () => {
    it('should create median matchups for all rosters', async () => {
      // Create regular matchups first
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 100.0, 95.0, 'completed', false]
      );

      await generateMedianMatchups(testLeagueId, 1, '2025');

      // Verify median matchups created
      const result = await pool.query(
        `SELECT * FROM matchups WHERE league_id = $1 AND week = $2 AND is_median_matchup = TRUE`,
        [testLeagueId, 1]
      );

      expect(result.rows).toHaveLength(6); // One for each roster

      // Verify structure of first median matchup
      const firstMedian = result.rows[0];
      expect(firstMedian.roster2_id).toBeNull(); // roster2 always null for median
      expect(firstMedian.is_median_matchup).toBe(true);
      expect(firstMedian.status).toBe('scheduled');
      expect(firstMedian.median_score).toBeGreaterThanOrEqual(0); // Should have calculated median
    });

    it('should skip if median matchups not enabled', async () => {
      // Create league without median matchups enabled
      const leagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code, enable_league_median)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          'No Median League',
          'in_season',
          '2025',
          'regular',
          'redraft',
          4,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([]),
          `NM${Date.now().toString().slice(-8)}`,
          false
        ]
      );

      const noMedianLeagueId = leagueResult.rows[0].id;

      await expect(
        generateMedianMatchups(noMedianLeagueId, 1, '2025')
      ).rejects.toThrow('League median matchups are not enabled');
    });

    it('should skip weeks outside configured range', async () => {
      // Week 15 is after median_matchup_week_end (14)
      await generateMedianMatchups(testLeagueId, 15, '2025');

      const result = await pool.query(
        `SELECT COUNT(*) as count FROM matchups
         WHERE league_id = $1 AND week = $2 AND is_median_matchup = TRUE`,
        [testLeagueId, 15]
      );

      expect(parseInt(result.rows[0].count)).toBe(0);
    });

    it('should avoid creating duplicates', async () => {
      await generateMedianMatchups(testLeagueId, 1, '2025');
      await generateMedianMatchups(testLeagueId, 1, '2025');

      const result = await pool.query(
        `SELECT COUNT(*) as count FROM matchups
         WHERE league_id = $1 AND week = $2 AND is_median_matchup = TRUE`,
        [testLeagueId, 1]
      );

      expect(parseInt(result.rows[0].count)).toBe(6); // Should still only be 6
    });
  });

  describe('updateMedianMatchupResults', () => {
    beforeEach(async () => {
      // Create regular matchups with scores
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[0], testRosterIds[1], 120.0, 90.0, 'completed', false]
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[2], testRosterIds[3], 100.0, 110.0, 'completed', false]
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 1, '2025', testRosterIds[4], testRosterIds[5], 105.0, 115.0, 'completed', false]
      );

      // Median should be (90 + 100 + 105 + 110 + 115 + 120) / 6 = 640 / 6 = 106.67

      // Generate median matchups
      await generateMedianMatchups(testLeagueId, 1, '2025');
    });

    it('should update median matchup scores from regular matchups', async () => {
      await updateMedianMatchupResults(testLeagueId, 1);

      // Check all median matchups have been updated
      const result = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND week = $2 AND is_median_matchup = TRUE
         ORDER BY roster1_id`,
        [testLeagueId, 1]
      );

      expect(result.rows).toHaveLength(6);

      // Verify all have roster1_score filled
      result.rows.forEach(row => {
        expect(row.roster1_score).not.toBeNull();
        expect(row.status).toBe('completed');
      });
    });

    it('should correctly determine winners (above median = win)', async () => {
      await updateMedianMatchupResults(testLeagueId, 1);

      // Median is ~106.67
      // Roster 0: 120.0 > median => WIN
      // Roster 1: 90.0 < median => LOSS (winner_roster_id = null)
      // Roster 2: 100.0 < median => LOSS
      // Roster 3: 110.0 > median => WIN
      // Roster 4: 105.0 < median => LOSS
      // Roster 5: 115.0 > median => WIN

      const winners = await pool.query(
        `SELECT roster1_id, winner_roster_id, roster1_score, median_score
         FROM matchups
         WHERE league_id = $1 AND week = $2 AND is_median_matchup = TRUE
         ORDER BY roster1_id`,
        [testLeagueId, 1]
      );

      // Roster 0 (120.0) should win
      expect(winners.rows[0].winner_roster_id).toBe(testRosterIds[0]);

      // Roster 1 (90.0) should lose
      expect(winners.rows[1].winner_roster_id).toBeNull();

      // Roster 3 (110.0) should win
      expect(winners.rows[3].winner_roster_id).toBe(testRosterIds[3]);
    });

    it('should handle ties (equal to median = loss)', async () => {
      // Create matchups where score equals median
      await pool.query(`DELETE FROM matchups WHERE league_id = $1`, [testLeagueId]);

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_median_matchup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 2, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', false]
      );

      // Median is 100.0
      await generateMedianMatchups(testLeagueId, 2, '2025');
      await updateMedianMatchupResults(testLeagueId, 2);

      const result = await pool.query(
        `SELECT winner_roster_id FROM matchups
         WHERE league_id = $1 AND week = $2 AND is_median_matchup = TRUE`,
        [testLeagueId, 2]
      );

      // Both rosters tied with median (100.0), so both should lose (winner_roster_id = null)
      result.rows.forEach(row => {
        expect(row.winner_roster_id).toBeNull();
      });
    });
  });

  describe('generateSeasonMedianMatchups', () => {
    it('should generate median matchups for all weeks in range', async () => {
      // League configured for weeks 1-14
      // Should generate 14 weeks * 6 rosters = 84 median matchups
      const result = await generateSeasonMedianMatchups(testLeagueId, '2025');

      expect(result.weeks_generated).toBe(14);
      expect(result.matchups_created).toBe(84); // 14 weeks * 6 rosters

      // Verify in database
      const dbResult = await pool.query(
        `SELECT COUNT(*) as count FROM matchups
         WHERE league_id = $1 AND is_median_matchup = TRUE`,
        [testLeagueId]
      );

      expect(parseInt(dbResult.rows[0].count)).toBe(84);
    });

    it('should fail if median matchups not enabled', async () => {
      // Create league without median matchups
      const leagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code, enable_league_median)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          'No Median League 2',
          'in_season',
          '2025',
          'regular',
          'redraft',
          4,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([]),
          `NM2${Date.now().toString().slice(-7)}`,
          false
        ]
      );

      const noMedianLeagueId = leagueResult.rows[0].id;

      await expect(
        generateSeasonMedianMatchups(noMedianLeagueId, '2025')
      ).rejects.toThrow('League median matchups are not enabled');
    });

    it('should fail if week range not configured', async () => {
      // Create league with median enabled but no week range
      const leagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code, enable_league_median,
          median_matchup_week_start, median_matchup_week_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          'No Range League',
          'in_season',
          '2025',
          'regular',
          'redraft',
          4,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([]),
          `NR${Date.now().toString().slice(-8)}`,
          true,
          null, // No start week
          null  // No end week
        ]
      );

      const noRangeLeagueId = leagueResult.rows[0].id;

      await expect(
        generateSeasonMedianMatchups(noRangeLeagueId, '2025')
      ).rejects.toThrow('Median matchup week range is not configured');
    });
  });
});
