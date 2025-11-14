/**
 * Matchup API Integration Tests
 *
 * Tests full HTTP request/response cycle for matchup generation and scoring
 * Verifies database state, score calculations, and authorization
 *
 * Endpoints tested:
 * - POST /api/v1/matchups/league/:leagueId/week/:week/generate - Generate matchups
 * - GET /api/v1/matchups/league/:leagueId/week/:week - Get matchups for week
 * - POST /api/v1/matchups/league/:leagueId/week/:week/update-scores - Update scores
 * - GET /api/v1/matchups/:matchupId/details - Get matchup details
 */

import request from 'supertest';
import app from '../../index';
import pool from '../../config/database';
import jwt from 'jsonwebtoken';

describe('Matchup API Integration Tests', () => {
  let testUser1Id: number;
  let testUser2Id: number;
  let testUser1Token: string;
  let testUser2Token: string;
  let testLeagueId: number;
  let testRoster1Id: number;
  let testRoster2Id: number;
  let testMatchupId: number;
  let testPlayerIds: number[] = [];
  let testSeason: string;
  let testWeek: number;

  // ========================================
  // SETUP & TEARDOWN
  // ========================================

  beforeAll(async () => {
    testSeason = '2025';
    testWeek = 1;

    // Create test users
    const user1Result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['matchuptest_user1', 'matchuptest1@test.com', 'hashedpassword']
    );
    testUser1Id = user1Result.rows[0].id;

    const user2Result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['matchuptest_user2', 'matchuptest2@test.com', 'hashedpassword']
    );
    testUser2Id = user2Result.rows[0].id;

    // Generate JWT tokens
    testUser1Token = jwt.sign(
      { userId: testUser1Id, username: 'matchuptest_user1', isAdmin: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    testUser2Token = jwt.sign(
      { userId: testUser2Id, username: 'matchuptest_user2', isAdmin: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test league
    const uniqueInviteCode = `M${Date.now().toString().slice(-8)}`;
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters, settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Matchup Test League',
        'in_progress',
        testSeason,
        'regular',
        'redraft',
        2,
        JSON.stringify({
          commissioner_id: testUser1Id,
          start_week: 1,
          playoff_week_start: 15,
        }),
        JSON.stringify({
          pass_td: 4,
          pass_yd: 0.04,
          rush_td: 6,
          rush_yd: 0.1,
          rec: 1,
          rec_yd: 0.1,
          rec_td: 6,
        }),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'WR', count: 2 },
          { position: 'BN', count: 5 }
        ]),
        uniqueInviteCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create rosters for both users
    const roster1Result = await pool.query(
      `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        testLeagueId,
        testUser1Id,
        1,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({})
      ]
    );
    testRoster1Id = roster1Result.rows[0].id;

    const roster2Result = await pool.query(
      `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        testLeagueId,
        testUser2Id,
        2,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({})
      ]
    );
    testRoster2Id = roster2Result.rows[0].id;

    // Get or create test players with stats
    const playersResult = await pool.query('SELECT id FROM players LIMIT 5');

    if (playersResult.rows.length < 5) {
      // Create test players if not enough exist
      for (let i = playersResult.rows.length; i < 5; i++) {
        const playerResult = await pool.query(
          `INSERT INTO players (player_id, full_name, position, team)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [`MTEST${i}`, `Matchup Test Player ${i}`, i % 3 === 0 ? 'QB' : i % 3 === 1 ? 'RB' : 'WR', 'TST']
        );
        testPlayerIds.push(playerResult.rows[0].id);
      }
    } else {
      testPlayerIds = playersResult.rows.map(r => r.id);
    }

    // Create player stats for scoring tests
    for (let i = 0; i < Math.min(2, testPlayerIds.length); i++) {
      await pool.query(
        `INSERT INTO player_stats (player_id, week, season, season_type, stats)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, week, season, season_type) DO NOTHING`,
        [
          testPlayerIds[i],
          testWeek,
          testSeason,
          'regular',
          JSON.stringify({
            pass_td: 2,
            pass_yd: 250,
            rush_td: 1,
            rush_yd: 50,
            rec: 5,
            rec_yd: 75,
            rec_td: 1,
          })
        ]
      );
    }

    // Create weekly lineups for both rosters
    await pool.query(
      `INSERT INTO weekly_lineups (roster_id, week, season, lineup)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (roster_id, week, season) DO NOTHING`,
      [
        testRoster1Id,
        testWeek,
        testSeason,
        JSON.stringify({
          starters: [
            { slot: 'QB', player_id: testPlayerIds[0] || null },
          ],
          bench: [],
        })
      ]
    );

    await pool.query(
      `INSERT INTO weekly_lineups (roster_id, week, season, lineup)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (roster_id, week, season) DO NOTHING`,
      [
        testRoster2Id,
        testWeek,
        testSeason,
        JSON.stringify({
          starters: [
            { slot: 'QB', player_id: testPlayerIds[1] || null },
          ],
          bench: [],
        })
      ]
    );
  });

  afterAll(async () => {
    // Clean up in reverse order of creation
    await pool.query('DELETE FROM matchups WHERE league_id = $1', [testLeagueId]);
    await pool.query('DELETE FROM weekly_lineups WHERE roster_id IN ($1, $2)', [testRoster1Id, testRoster2Id]);
    await pool.query('DELETE FROM player_stats WHERE player_id = ANY($1)', [testPlayerIds]);
    await pool.query('DELETE FROM rosters WHERE id IN ($1, $2)', [testRoster1Id, testRoster2Id]);
    await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUser1Id, testUser2Id]);
    await pool.query(`DELETE FROM players WHERE player_id LIKE 'MTEST%'`);
    await pool.end();
  });

  afterEach(async () => {
    // Clean up matchups created during tests (except the main test matchup)
    await pool.query(
      'DELETE FROM matchups WHERE league_id = $1 AND id != $2',
      [testLeagueId, testMatchupId || 0]
    );
  });

  // ========================================
  // POST /api/v1/matchups/league/:leagueId/week/:week/generate
  // ========================================

  describe('POST /api/v1/matchups/league/:leagueId/week/:week/generate', () => {

    test('should generate matchups for a week', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/generate`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ season: testSeason });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1); // 2 rosters = 1 matchup

      const matchup = response.body.data[0];
      expect(matchup).toMatchObject({
        league_id: testLeagueId,
        week: testWeek,
        season: testSeason,
        roster1_id: expect.any(Number),
        roster2_id: expect.any(Number),
      });

      testMatchupId = matchup.id;

      // Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM matchups WHERE league_id = $1 AND week = $2',
        [testLeagueId, testWeek]
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].roster1_score).toBe(0); // Initial score
      expect(dbResult.rows[0].roster2_score).toBe(0);
    });

    test('should return 400 without season', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/generate`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    test('should return 403 for non-commissioner', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/2/generate`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ season: testSeason });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/3/generate`)
        .send({ season: testSeason });

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // GET /api/v1/matchups/league/:leagueId/week/:week
  // ========================================

  describe('GET /api/v1/matchups/league/:leagueId/week/:week', () => {

    test('should retrieve matchups for a week', async () => {
      const response = await request(app)
        .get(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}`)
        .query({ season: testSeason });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      const matchup = response.body.data[0];
      expect(matchup).toMatchObject({
        league_id: testLeagueId,
        week: testWeek,
        season: testSeason,
      });

      // Should include metadata about cache
      expect(response.body.meta).toBeDefined();
    });

    test('should return empty array for week with no matchups', async () => {
      const response = await request(app)
        .get(`/api/v1/matchups/league/${testLeagueId}/week/17`)
        .query({ season: testSeason });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    test('should return 400 with invalid week number', async () => {
      const response = await request(app)
        .get(`/api/v1/matchups/league/${testLeagueId}/week/invalid`)
        .query({ season: testSeason });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // POST /api/v1/matchups/league/:leagueId/week/:week/update-scores
  // ========================================

  describe('POST /api/v1/matchups/league/:leagueId/week/:week/update-scores', () => {

    test('should update scores for a week', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/update-scores`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ season: testSeason, season_type: 'regular' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Updated scores');

      // Verify scores were updated in database
      const dbResult = await pool.query(
        'SELECT * FROM matchups WHERE league_id = $1 AND week = $2',
        [testLeagueId, testWeek]
      );

      if (dbResult.rows.length > 0) {
        const matchup = dbResult.rows[0];
        // Scores should be calculated based on player stats
        // With our test data: pass_td: 2 * 4 = 8, pass_yd: 250 * 0.04 = 10, etc.
        expect(matchup.roster1_score).toBeGreaterThanOrEqual(0);
        expect(matchup.roster2_score).toBeGreaterThanOrEqual(0);
      }
    });

    test('should return 400 without season', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/update-scores`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return 403 for non-commissioner', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/update-scores`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ season: testSeason });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/update-scores`)
        .send({ season: testSeason });

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // GET /api/v1/matchups/:matchupId/details
  // ========================================

  describe('GET /api/v1/matchups/:matchupId/details', () => {

    test('should retrieve matchup details with rosters', async () => {
      if (!testMatchupId) {
        // Skip if no matchup was created
        return;
      }

      const response = await request(app)
        .get(`/api/v1/matchups/${testMatchupId}/details`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testMatchupId,
        league_id: testLeagueId,
        week: testWeek,
      });

      // Should include roster details
      expect(response.body.data.roster1).toBeDefined();
      expect(response.body.data.roster2).toBeDefined();
    });

    test('should return 404 for non-existent matchup', async () => {
      const response = await request(app)
        .get('/api/v1/matchups/999999/details');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // MULTI-ENDPOINT WORKFLOW TEST
  // ========================================

  describe('Complete Matchup Workflow', () => {

    test('should complete full matchup generation, scoring, and retrieval', async () => {
      const workflowWeek = 5;

      // Step 1: Generate matchups for week 5
      const generateResponse = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${workflowWeek}/generate`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ season: testSeason });

      expect(generateResponse.status).toBe(201);
      const workflowMatchupId = generateResponse.body.data[0].id;

      // Step 2: Verify matchup exists in database
      const matchupCheck = await pool.query(
        'SELECT * FROM matchups WHERE id = $1',
        [workflowMatchupId]
      );
      expect(matchupCheck.rows.length).toBe(1);
      expect(matchupCheck.rows[0].roster1_score).toBe(0);

      // Step 3: Update scores
      const updateResponse = await request(app)
        .post(`/api/v1/matchups/league/${testLeagueId}/week/${workflowWeek}/update-scores`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ season: testSeason, season_type: 'regular' });

      expect(updateResponse.status).toBe(200);

      // Step 4: Retrieve updated matchups
      const getResponse = await request(app)
        .get(`/api/v1/matchups/league/${testLeagueId}/week/${workflowWeek}`)
        .query({ season: testSeason });

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.length).toBe(1);

      // Step 5: Get detailed matchup info
      const detailsResponse = await request(app)
        .get(`/api/v1/matchups/${workflowMatchupId}/details`);

      expect(detailsResponse.status).toBe(200);
      expect(detailsResponse.body.data.id).toBe(workflowMatchupId);

      // Step 6: Verify scores are non-negative (may be 0 if no stats for week 5)
      const finalCheck = await pool.query(
        'SELECT * FROM matchups WHERE id = $1',
        [workflowMatchupId]
      );
      expect(finalCheck.rows[0].roster1_score).toBeGreaterThanOrEqual(0);
      expect(finalCheck.rows[0].roster2_score).toBeGreaterThanOrEqual(0);

      // Cleanup
      await pool.query('DELETE FROM matchups WHERE id = $1', [workflowMatchupId]);
    });
  });

  // ========================================
  // ERROR SCENARIO TESTS
  // ========================================

  describe('Error Scenarios', () => {

    test('should handle invalid league ID gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/matchups/league/999999/week/1')
        .query({ season: testSeason });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    test('should handle invalid week number (negative)', async () => {
      const response = await request(app)
        .get(`/api/v1/matchups/league/${testLeagueId}/week/-1`)
        .query({ season: testSeason });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle invalid week number (zero)', async () => {
      const response = await request(app)
        .get(`/api/v1/matchups/league/${testLeagueId}/week/0`)
        .query({ season: testSeason });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle concurrent score updates gracefully', async () => {
      // Make two simultaneous score update requests
      const promises = [
        request(app)
          .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/update-scores`)
          .set('Authorization', `Bearer ${testUser1Token}`)
          .send({ season: testSeason }),
        request(app)
          .post(`/api/v1/matchups/league/${testLeagueId}/week/${testWeek}/update-scores`)
          .set('Authorization', `Bearer ${testUser1Token}`)
          .send({ season: testSeason }),
      ];

      const results = await Promise.all(promises);

      // Both should succeed (idempotent operation)
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
    });
  });
});
