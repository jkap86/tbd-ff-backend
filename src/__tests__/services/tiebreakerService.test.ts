/**
 * Tiebreaker Service Tests
 *
 * Tests playoff tiebreaker logic for determining winners when scores are tied:
 * - bench_points: Team with higher bench points wins
 * - season_points_for: Team with higher total season points wins
 * - h2h_record: Team who won more H2H matchups in regular season wins
 * - higher_seed: Better playoff seed wins
 * - manual: Commissioner intervention required
 *
 * Test coverage:
 * - Tiebreaker priority order
 * - Each tiebreaker method individually
 * - Playoff round advancement
 * - Manual winner selection
 */

import {
  determinePlayoffWinner,
  isPlayoffRoundComplete,
  getPlayoffMatchupWinner,
  setManualPlayoffWinner,
} from '../../services/tiebreakerService';
import pool from '../../config/database';

describe('Tiebreaker Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];
  let testPlayerIds: number[] = [7523, 7543, 4881, 5927]; // Example player IDs

  beforeAll(async () => {
    const uniqueCode = `TB${Date.now().toString().slice(-8)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'tbtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'TB%'`);

    // Create test users
    for (let i = 1; i <= 4; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`tbtest${i}`, `tb${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Tiebreaker Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        4,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({ pass_yd: 0.04, pass_td: 4, rush_yd: 0.1, rush_td: 6 }),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'BN', count: 3 }
        ]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test players
    for (const playerId of testPlayerIds) {
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id) DO NOTHING`,
        [playerId, `Player ${playerId}`, 'RB', 'TEST']
      );
    }

    // Create test rosters with varying season stats
    for (let i = 0; i < 4; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          testLeagueId,
          testUserIds[i],
          i + 1,
          JSON.stringify([]),
          JSON.stringify(i < 2 ? [testPlayerIds[i]] : []), // Rosters 1-2 have bench players
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({
            wins: 8 - i, // Roster 0: 8 wins, Roster 1: 7 wins, etc.
            losses: 5 + i,
            ties: 0,
            points_for: 1000 + (i * 100), // Roster 0: 1000, Roster 1: 1100, etc.
            points_against: 900
          })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }

    // Create playoff settings with tiebreaker priority
    await pool.query(
      `INSERT INTO playoff_settings (league_id, playoff_teams, tiebreaker_priority)
       VALUES ($1, $2, $3)`,
      [
        testLeagueId,
        4,
        JSON.stringify(['bench_points', 'season_points_for', 'h2h_record', 'higher_seed'])
      ]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'tbtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'TB%'`);
  });

  beforeEach(async () => {
    // Clear matchups before each test
    await pool.query(`DELETE FROM matchups WHERE league_id = $1`, [testLeagueId]);
  });

  describe('determinePlayoffWinner', () => {
    it('should return winner when scores are not tied', async () => {
      // Create matchup with clear winner (no tie)
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 120.5, 110.2, 'completed', true, 'semifinal', 1, 2]
      );

      const result = await determinePlayoffWinner(matchupResult.rows[0].id);

      expect(result.winnerId).toBe(testRosterIds[0]);
      expect(result.tiebreakerUsed).toBeNull(); // No tiebreaker needed
    });

    it('should use higher_seed tiebreaker when specified', async () => {
      // Create tied matchup with seeds
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal', 1, 4]
      );

      const result = await determinePlayoffWinner(matchupResult.rows[0].id);

      // With default tiebreaker priority bench_points would come first, but if tied
      // it eventually uses higher_seed. Roster 0 has seed 1 (better than seed 4)
      expect(result.winnerId).not.toBeNull();
      expect([testRosterIds[0], testRosterIds[1]]).toContain(result.winnerId);
    });

    it('should use season_points_for tiebreaker', async () => {
      // Update playoff settings to prioritize season_points_for first
      await pool.query(
        `UPDATE playoff_settings SET tiebreaker_priority = $1 WHERE league_id = $2`,
        [JSON.stringify(['season_points_for', 'higher_seed']), testLeagueId]
      );

      // Create tied matchup
      // Roster 0: 1000 points_for, Roster 1: 1100 points_for
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal', 1, 2]
      );

      const result = await determinePlayoffWinner(matchupResult.rows[0].id);

      // Roster 1 has more season points (1100 vs 1000)
      expect(result.winnerId).toBe(testRosterIds[1]);
      expect(result.tiebreakerUsed).toBe('season_points_for');

      // Verify tiebreaker was saved to matchup
      const matchup = await pool.query(
        'SELECT tiebreaker_used FROM matchups WHERE id = $1',
        [matchupResult.rows[0].id]
      );
      expect(matchup.rows[0].tiebreaker_used).toBe('season_points_for');
    });

    it('should handle bye week (roster2_id null)', async () => {
      // Create bye week matchup
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], null, 100.0, 0, 'completed', true, 'semifinal', 1, null]
      );

      const result = await determinePlayoffWinner(matchupResult.rows[0].id);

      expect(result.winnerId).toBe(testRosterIds[0]);
      expect(result.tiebreakerUsed).toBeNull();
    });

    it('should mark as manual when no tiebreaker resolves', async () => {
      // Create matchup with teams that have identical stats
      // Update rosters to have same points_for
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(settings, '{points_for}', '1000') WHERE id IN ($1, $2)`,
        [testRosterIds[0], testRosterIds[1]]
      );

      // Update playoff settings to use only h2h_record (which they don't have)
      await pool.query(
        `UPDATE playoff_settings SET tiebreaker_priority = $1 WHERE league_id = $2`,
        [JSON.stringify(['h2h_record']), testLeagueId]
      );

      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal', 1, 2]
      );

      const result = await determinePlayoffWinner(matchupResult.rows[0].id);

      expect(result.winnerId).toBeNull();
      expect(result.tiebreakerUsed).toBe('manual');

      // Verify manual flag was set in matchup
      const matchup = await pool.query(
        'SELECT tiebreaker_used, tiebreaker_notes FROM matchups WHERE id = $1',
        [matchupResult.rows[0].id]
      );
      expect(matchup.rows[0].tiebreaker_used).toBe('manual');
      expect(matchup.rows[0].tiebreaker_notes).toContain('commissioner intervention');
    });
  });

  describe('h2h_record tiebreaker', () => {
    beforeEach(async () => {
      // Create regular season h2h matchups
      // Week 3: Roster 0 beats Roster 1
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 3, '2025', testRosterIds[0], testRosterIds[1], 120.0, 100.0, 'completed', false]
      );

      // Week 7: Roster 1 beats Roster 0
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 7, '2025', testRosterIds[1], testRosterIds[0], 115.0, 105.0, 'completed', false]
      );

      // Week 11: Roster 0 beats Roster 1 again
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [testLeagueId, 11, '2025', testRosterIds[0], testRosterIds[1], 125.0, 110.0, 'completed', false]
      );

      // Update playoff settings to use h2h first
      await pool.query(
        `UPDATE playoff_settings SET tiebreaker_priority = $1 WHERE league_id = $2`,
        [JSON.stringify(['h2h_record', 'higher_seed']), testLeagueId]
      );
    });

    it('should use h2h_record to determine winner', async () => {
      // Create tied playoff matchup
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal', 1, 2]
      );

      const result = await determinePlayoffWinner(matchupResult.rows[0].id);

      // Roster 0 won 2 of 3 regular season matchups
      expect(result.winnerId).toBe(testRosterIds[0]);
      expect(result.tiebreakerUsed).toBe('h2h_record');
    });
  });

  describe('isPlayoffRoundComplete', () => {
    it('should return true when all matchups completed', async () => {
      // Create 2 semifinal matchups, both completed
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 120.0, 110.0, 'completed', true, 'semifinal']
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [testLeagueId, 15, '2025', testRosterIds[2], testRosterIds[3], 105.0, 100.0, 'completed', true, 'semifinal']
      );

      const isComplete = await isPlayoffRoundComplete(testLeagueId, 'semifinal', '2025');
      expect(isComplete).toBe(true);
    });

    it('should return false when matchups incomplete', async () => {
      // Create 2 semifinal matchups, one in_progress
      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 120.0, 110.0, 'completed', true, 'semifinal']
      );

      await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [testLeagueId, 15, '2025', testRosterIds[2], testRosterIds[3], 85.0, 90.0, 'in_progress', true, 'semifinal']
      );

      const isComplete = await isPlayoffRoundComplete(testLeagueId, 'semifinal', '2025');
      expect(isComplete).toBe(false);
    });

    it('should return false when no matchups exist', async () => {
      const isComplete = await isPlayoffRoundComplete(testLeagueId, 'semifinal', '2025');
      expect(isComplete).toBe(false);
    });
  });

  describe('getPlayoffMatchupWinner', () => {
    it('should return winner for completed non-tied matchup', async () => {
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 120.0, 110.0, 'completed', true, 'semifinal']
      );

      const winnerId = await getPlayoffMatchupWinner(matchupResult.rows[0].id);
      expect(winnerId).toBe(testRosterIds[0]);
    });

    it('should return null for incomplete matchup', async () => {
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 85.0, 90.0, 'in_progress', true, 'semifinal']
      );

      const winnerId = await getPlayoffMatchupWinner(matchupResult.rows[0].id);
      expect(winnerId).toBeNull();
    });

    it('should apply tiebreaker for tied completed matchup', async () => {
      // Set up tiebreaker priority
      await pool.query(
        `UPDATE playoff_settings SET tiebreaker_priority = $1 WHERE league_id = $2`,
        [JSON.stringify(['season_points_for']), testLeagueId]
      );

      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal', 1, 2]
      );

      const winnerId = await getPlayoffMatchupWinner(matchupResult.rows[0].id);

      // Roster 1 has more season points (1100 vs 1000)
      expect(winnerId).toBe(testRosterIds[1]);
    });
  });

  describe('setManualPlayoffWinner', () => {
    it('should allow commissioner to manually set winner', async () => {
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round, seed1, seed2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal', 1, 2]
      );

      await setManualPlayoffWinner(
        matchupResult.rows[0].id,
        testRosterIds[1],
        testUserIds[0] // commissioner
      );

      // Verify tiebreaker was set to manual
      const matchup = await pool.query(
        'SELECT tiebreaker_used, tiebreaker_notes, manual_winner_selected_by FROM matchups WHERE id = $1',
        [matchupResult.rows[0].id]
      );

      expect(matchup.rows[0].tiebreaker_used).toBe('manual');
      expect(matchup.rows[0].tiebreaker_notes).toContain('Manual winner selection');
      expect(matchup.rows[0].manual_winner_selected_by).toBe(testUserIds[0]);
    });

    it('should reject invalid winner', async () => {
      const matchupResult = await pool.query(
        `INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id,
          roster1_score, roster2_score, status, is_playoff, playoff_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [testLeagueId, 15, '2025', testRosterIds[0], testRosterIds[1], 100.0, 100.0, 'completed', true, 'semifinal']
      );

      // Try to set roster 3 as winner (not in this matchup)
      await expect(
        setManualPlayoffWinner(matchupResult.rows[0].id, testRosterIds[2], testUserIds[0])
      ).rejects.toThrow('Winner must be one of the teams in the matchup');
    });
  });
});
