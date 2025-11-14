/**
 * League API Integration Tests
 *
 * Tests full HTTP request/response cycle for league creation and retrieval
 * Verifies database state, authentication, authorization, and error handling
 *
 * Endpoints tested:
 * - POST /api/v1/leagues/create - Create a new league
 * - GET /api/v1/leagues/:leagueId - Get league details
 * - POST /api/v1/leagues/:leagueId/join - Join a league
 */

import request from 'supertest';
import app from '../../index';
import pool from '../../config/database';
import jwt from 'jsonwebtoken';

describe('League API Integration Tests', () => {
  let testUser1Id: number;
  let testUser2Id: number;
  let testUser1Token: string;
  let testUser2Token: string;
  let testLeagueId: number;
  let inviteCode: string;

  // ========================================
  // SETUP & TEARDOWN
  // ========================================

  beforeAll(async () => {
    // Create test users
    const user1Result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['leaguetest_user1', 'leaguetest1@test.com', 'hashedpassword']
    );
    testUser1Id = user1Result.rows[0].id;

    const user2Result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['leaguetest_user2', 'leaguetest2@test.com', 'hashedpassword']
    );
    testUser2Id = user2Result.rows[0].id;

    // Generate JWT tokens
    testUser1Token = jwt.sign(
      { userId: testUser1Id, username: 'leaguetest_user1', isAdmin: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    testUser2Token = jwt.sign(
      { userId: testUser2Id, username: 'leaguetest_user2', isAdmin: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up in reverse order of creation (respecting foreign keys)
    if (testLeagueId) {
      await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
    }
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUser1Id, testUser2Id]);
    await pool.end();
  });

  afterEach(async () => {
    // Clean up leagues created during tests (except the main test league)
    await pool.query(
      `DELETE FROM leagues WHERE name LIKE 'Integration Test League%' AND id != $1`,
      [testLeagueId || 0]
    );
  });

  // ========================================
  // POST /api/v1/leagues/create
  // ========================================

  describe('POST /api/v1/leagues/create', () => {

    test('should create league with valid data', async () => {
      const leagueData = {
        name: 'Integration Test League 1',
        season: '2025',
        season_type: 'regular',
        league_type: 'redraft',
        total_rosters: 10,
        settings: {
          commissioner_id: testUser1Id,
          start_week: 1,
          playoff_week_start: 15,
        },
        scoring_settings: {
          pass_td: 4,
          pass_yd: 0.04,
          rush_td: 6,
          rush_yd: 0.1,
          rec: 1,
          rec_yd: 0.1,
        },
        roster_positions: [
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'WR', count: 2 },
          { position: 'TE', count: 1 },
          { position: 'FLEX', count: 1 },
          { position: 'BN', count: 5 },
        ],
      };

      const response = await request(app)
        .post('/api/v1/leagues/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(leagueData);

      // Assert: Check response
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.league).toMatchObject({
        id: expect.any(Number),
        name: 'Integration Test League 1',
        season: '2025',
        status: 'pre_draft',
        total_rosters: 10,
      });

      testLeagueId = response.body.data.league.id;
      inviteCode = response.body.data.league.invite_code;

      // Assert: Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM leagues WHERE id = $1',
        [testLeagueId]
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].name).toBe('Integration Test League 1');
      expect(dbResult.rows[0].settings.commissioner_id).toBe(testUser1Id);

      // Assert: Verify creator's roster was created
      const rosterResult = await pool.query(
        'SELECT * FROM rosters WHERE league_id = $1 AND user_id = $2',
        [testLeagueId, testUser1Id]
      );
      expect(rosterResult.rows.length).toBe(1);
      expect(rosterResult.rows[0].roster_id).toBe(1); // First roster
    });

    test('should return 400 with missing required fields', async () => {
      const invalidData = {
        // Missing 'name' and 'season'
        total_rosters: 10,
      };

      const response = await request(app)
        .post('/api/v1/leagues/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    test('should return 400 with invalid season format', async () => {
      const invalidData = {
        name: 'Invalid Season League',
        season: 'twenty-twenty-five', // Should be '2025'
      };

      const response = await request(app)
        .post('/api/v1/leagues/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('valid year');
    });

    test('should return 400 with invalid total_rosters', async () => {
      const invalidData = {
        name: 'Invalid Rosters League',
        season: '2025',
        total_rosters: 1, // Must be at least 2
      };

      const response = await request(app)
        .post('/api/v1/leagues/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('between 2 and 100');
    });

    test('should return 401 without authentication', async () => {
      const leagueData = {
        name: 'Unauthenticated League',
        season: '2025',
      };

      const response = await request(app)
        .post('/api/v1/leagues/create')
        .send(leagueData);

      expect(response.status).toBe(401);
    });

    test('should return 400 with invalid JWT token', async () => {
      const leagueData = {
        name: 'Invalid Token League',
        season: '2025',
      };

      const response = await request(app)
        .post('/api/v1/leagues/create')
        .set('Authorization', 'Bearer invalid.token.here')
        .send(leagueData);

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // GET /api/v1/leagues/:leagueId
  // ========================================

  describe('GET /api/v1/leagues/:leagueId', () => {

    test('should retrieve league details for member', async () => {
      const response = await request(app)
        .get(`/api/v1/leagues/${testLeagueId}`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.league).toMatchObject({
        id: testLeagueId,
        name: 'Integration Test League 1',
        season: '2025',
        status: 'pre_draft',
      });

      // Should include rosters
      expect(response.body.data.rosters).toBeDefined();
      expect(Array.isArray(response.body.data.rosters)).toBe(true);
    });

    test('should return 404 for non-existent league', async () => {
      const response = await request(app)
        .get('/api/v1/leagues/999999')
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should return 403 for non-member trying to access league', async () => {
      // testUser2 is not a member of testLeagueId
      const response = await request(app)
        .get(`/api/v1/leagues/${testLeagueId}`)
        .set('Authorization', `Bearer ${testUser2Token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not a member');
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/api/v1/leagues/${testLeagueId}`);

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // POST /api/v1/leagues/:leagueId/join
  // ========================================

  describe('POST /api/v1/leagues/:leagueId/join', () => {

    test('should allow user to join league with valid invite code', async () => {
      const response = await request(app)
        .post(`/api/v1/leagues/${testLeagueId}/join`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ invite_code: inviteCode });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.roster).toMatchObject({
        league_id: testLeagueId,
        user_id: testUser2Id,
        roster_id: 2, // Second roster
      });

      // Verify database state
      const rosterResult = await pool.query(
        'SELECT * FROM rosters WHERE league_id = $1 AND user_id = $2',
        [testLeagueId, testUser2Id]
      );
      expect(rosterResult.rows.length).toBe(1);
    });

    test('should return 400 with invalid invite code', async () => {
      const response = await request(app)
        .post(`/api/v1/leagues/${testLeagueId}/join`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ invite_code: 'INVALID' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return 400 if user already has roster in league', async () => {
      // testUser1 already has a roster in testLeagueId
      const response = await request(app)
        .post(`/api/v1/leagues/${testLeagueId}/join`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ invite_code: inviteCode });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already');
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/leagues/${testLeagueId}/join`)
        .send({ invite_code: inviteCode });

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // MULTI-ENDPOINT WORKFLOW TEST
  // ========================================

  describe('Complete League Workflow', () => {

    test('should complete full league creation and join flow', async () => {
      // Step 1: User1 creates a league
      const createResponse = await request(app)
        .post('/api/v1/leagues/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({
          name: 'Integration Test League - Workflow',
          season: '2025',
          total_rosters: 8,
        });

      expect(createResponse.status).toBe(201);
      const leagueId = createResponse.body.data.league.id;
      const workflowInviteCode = createResponse.body.data.league.invite_code;

      // Step 2: Verify league exists in database
      const leagueCheck = await pool.query(
        'SELECT * FROM leagues WHERE id = $1',
        [leagueId]
      );
      expect(leagueCheck.rows.length).toBe(1);
      expect(leagueCheck.rows[0].status).toBe('pre_draft');

      // Step 3: User1 retrieves league details
      const getResponse = await request(app)
        .get(`/api/v1/leagues/${leagueId}`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.league.id).toBe(leagueId);

      // Step 4: User2 joins the league
      const joinResponse = await request(app)
        .post(`/api/v1/leagues/${leagueId}/join`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ invite_code: workflowInviteCode });

      expect(joinResponse.status).toBe(200);

      // Step 5: Verify both users have rosters
      const rostersCheck = await pool.query(
        'SELECT * FROM rosters WHERE league_id = $1 ORDER BY roster_id',
        [leagueId]
      );
      expect(rostersCheck.rows.length).toBe(2);
      expect(rostersCheck.rows[0].user_id).toBe(testUser1Id);
      expect(rostersCheck.rows[1].user_id).toBe(testUser2Id);

      // Step 6: User2 can now access league details
      const user2GetResponse = await request(app)
        .get(`/api/v1/leagues/${leagueId}`)
        .set('Authorization', `Bearer ${testUser2Token}`);

      expect(user2GetResponse.status).toBe(200);
      expect(user2GetResponse.body.data.rosters.length).toBe(2);

      // Cleanup
      await pool.query('DELETE FROM leagues WHERE id = $1', [leagueId]);
    });
  });
});
