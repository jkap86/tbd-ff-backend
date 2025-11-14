/**
 * Draft Pick API Integration Tests
 *
 * Tests full HTTP request/response cycle for draft pick execution
 * Verifies database state, draft state machine, authorization, and error handling
 *
 * Endpoints tested:
 * - POST /api/v1/drafts/create - Create a draft
 * - POST /api/v1/drafts/:draftId/order - Set draft order
 * - POST /api/v1/drafts/:draftId/start - Start draft
 * - POST /api/v1/drafts/:draftId/pick - Make a draft pick
 * - GET /api/v1/drafts/:draftId/picks - Get all draft picks
 */

import request from 'supertest';
import app from '../../index';
import pool from '../../config/database';
import jwt from 'jsonwebtoken';

describe('Draft Pick API Integration Tests', () => {
  let testUser1Id: number;
  let testUser2Id: number;
  let testUser1Token: string;
  let testUser2Token: string;
  let testLeagueId: number;
  let testRoster1Id: number;
  let testRoster2Id: number;
  let testDraftId: number;
  let testPlayerIds: number[] = [];

  // ========================================
  // SETUP & TEARDOWN
  // ========================================

  beforeAll(async () => {
    // Create test users
    const user1Result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['drafttest_user1', 'drafttest1@test.com', 'hashedpassword']
    );
    testUser1Id = user1Result.rows[0].id;

    const user2Result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['drafttest_user2', 'drafttest2@test.com', 'hashedpassword']
    );
    testUser2Id = user2Result.rows[0].id;

    // Generate JWT tokens
    testUser1Token = jwt.sign(
      { userId: testUser1Id, username: 'drafttest_user1', isAdmin: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    testUser2Token = jwt.sign(
      { userId: testUser2Id, username: 'drafttest_user2', isAdmin: false },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test league
    const uniqueInviteCode = `D${Date.now().toString().slice(-8)}`;
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters, settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Draft Test League',
        'pre_draft',
        '2025',
        'regular',
        'redraft',
        2,
        JSON.stringify({ commissioner_id: testUser1Id, start_week: 1, playoff_week_start: 15 }),
        JSON.stringify({}),
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
      [testLeagueId, testUser1Id, 1, JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify({})]
    );
    testRoster1Id = roster1Result.rows[0].id;

    const roster2Result = await pool.query(
      `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testLeagueId, testUser2Id, 2, JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify({})]
    );
    testRoster2Id = roster2Result.rows[0].id;

    // Get or create test players
    const playersResult = await pool.query('SELECT id FROM players LIMIT 10');

    if (playersResult.rows.length < 10) {
      // Create test players if not enough exist
      for (let i = playersResult.rows.length; i < 10; i++) {
        const playerResult = await pool.query(
          `INSERT INTO players (player_id, full_name, position, team)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [`DTEST${i}`, `Draft Test Player ${i}`, i % 3 === 0 ? 'QB' : i % 3 === 1 ? 'RB' : 'WR', 'TST']
        );
        testPlayerIds.push(playerResult.rows[0].id);
      }
    } else {
      testPlayerIds = playersResult.rows.map(r => r.id);
    }
  });

  afterAll(async () => {
    // Clean up in reverse order of creation
    if (testDraftId) {
      await pool.query('DELETE FROM drafts WHERE id = $1', [testDraftId]);
    }
    await pool.query('DELETE FROM rosters WHERE id IN ($1, $2)', [testRoster1Id, testRoster2Id]);
    await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUser1Id, testUser2Id]);
    await pool.query(`DELETE FROM players WHERE player_id LIKE 'DTEST%'`);
    await pool.end();
  });

  // ========================================
  // POST /api/v1/drafts/create
  // ========================================

  describe('POST /api/v1/drafts/create', () => {

    test('should create draft with valid data', async () => {
      const draftData = {
        league_id: testLeagueId,
        draft_type: 'snake',
        rounds: 10,
        pick_time_seconds: 90,
        timer_mode: 'traditional',
      };

      const response = await request(app)
        .post('/api/v1/drafts/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(draftData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.draft).toMatchObject({
        id: expect.any(Number),
        league_id: testLeagueId,
        draft_type: 'snake',
        status: 'not_started',
        rounds: 10,
      });

      testDraftId = response.body.data.draft.id;

      // Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM drafts WHERE id = $1',
        [testDraftId]
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].status).toBe('not_started');
    });

    test('should return 400 when league already has a draft', async () => {
      const draftData = {
        league_id: testLeagueId,
        draft_type: 'linear',
        rounds: 10,
      };

      const response = await request(app)
        .post('/api/v1/drafts/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(draftData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already has a draft');
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/drafts/create')
        .send({ league_id: testLeagueId });

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // POST /api/v1/drafts/:draftId/order
  // ========================================

  describe('POST /api/v1/drafts/:draftId/order', () => {

    test('should set draft order successfully', async () => {
      const orderData = {
        draft_order: [
          { roster_id: testRoster1Id, draft_position: 1 },
          { roster_id: testRoster2Id, draft_position: 2 },
        ],
      };

      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/order`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(orderData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM draft_order WHERE draft_id = $1 ORDER BY draft_position',
        [testDraftId]
      );
      expect(dbResult.rows.length).toBe(2);
      expect(dbResult.rows[0].roster_id).toBe(testRoster1Id);
      expect(dbResult.rows[0].draft_position).toBe(1);
      expect(dbResult.rows[1].roster_id).toBe(testRoster2Id);
      expect(dbResult.rows[1].draft_position).toBe(2);
    });

    test('should return 403 if non-commissioner tries to set order', async () => {
      const orderData = {
        draft_order: [
          { roster_id: testRoster2Id, draft_position: 1 },
          { roster_id: testRoster1Id, draft_position: 2 },
        ],
      };

      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/order`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send(orderData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // POST /api/v1/drafts/:draftId/start
  // ========================================

  describe('POST /api/v1/drafts/:draftId/start', () => {

    test('should start draft successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/start`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM drafts WHERE id = $1',
        [testDraftId]
      );
      expect(dbResult.rows[0].status).toBe('in_progress');
      expect(dbResult.rows[0].current_pick).toBe(1);
      expect(dbResult.rows[0].current_roster_id).toBe(testRoster1Id);
    });

    test('should return 400 if draft already started', async () => {
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/start`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // POST /api/v1/drafts/:draftId/pick
  // ========================================

  describe('POST /api/v1/drafts/:draftId/pick', () => {

    test('should make draft pick successfully for roster on the clock', async () => {
      const pickData = {
        roster_id: testRoster1Id,
        player_id: testPlayerIds[0],
      };

      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(pickData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pick).toMatchObject({
        draft_id: testDraftId,
        roster_id: testRoster1Id,
        player_id: testPlayerIds[0],
        pick_number: 1,
      });

      // Verify database state
      const pickResult = await pool.query(
        'SELECT * FROM draft_picks WHERE draft_id = $1 AND pick_number = $2',
        [testDraftId, 1]
      );
      expect(pickResult.rows.length).toBe(1);
      expect(pickResult.rows[0].player_id).toBe(testPlayerIds[0]);

      // Verify draft advanced to next pick
      const draftResult = await pool.query(
        'SELECT * FROM drafts WHERE id = $1',
        [testDraftId]
      );
      expect(draftResult.rows[0].current_pick).toBe(2);
      expect(draftResult.rows[0].current_roster_id).toBe(testRoster2Id); // Snake draft reverses
    });

    test('should return 400 if not the roster\'s turn', async () => {
      // Current roster on clock should be testRoster2Id (pick 2)
      const pickData = {
        roster_id: testRoster1Id, // Wrong roster
        player_id: testPlayerIds[1],
      };

      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send(pickData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not this roster\'s turn');
    });

    test('should return 400 if player already drafted', async () => {
      // First, make a valid pick for testRoster2Id
      await request(app)
        .post(`/api/v1/drafts/${testDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ roster_id: testRoster2Id, player_id: testPlayerIds[1] });

      // Now on pick 3, back to testRoster1Id (snake reverses)
      // Try to draft the same player
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ roster_id: testRoster1Id, player_id: testPlayerIds[0] }); // Already drafted in pick 1

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already drafted');
    });

    test('should return 403 if user does not own the roster', async () => {
      // testUser2 trying to pick for testRoster1Id
      const pickData = {
        roster_id: testRoster1Id,
        player_id: testPlayerIds[2],
      };

      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send(pickData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/pick`)
        .send({ roster_id: testRoster1Id, player_id: testPlayerIds[2] });

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // GET /api/v1/drafts/:draftId/picks
  // ========================================

  describe('GET /api/v1/drafts/:draftId/picks', () => {

    test('should retrieve all draft picks', async () => {
      const response = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/picks`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.picks)).toBe(true);
      expect(response.body.data.picks.length).toBeGreaterThanOrEqual(2);

      // Verify picks are in order
      const picks = response.body.data.picks;
      expect(picks[0].pick_number).toBe(1);
      expect(picks[0].player_id).toBe(testPlayerIds[0]);
      expect(picks[1].pick_number).toBe(2);
      expect(picks[1].player_id).toBe(testPlayerIds[1]);
    });

    test('should return 404 for non-existent draft', async () => {
      const response = await request(app)
        .get('/api/v1/drafts/999999/picks')
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // MULTI-ENDPOINT WORKFLOW TEST
  // ========================================

  describe('Complete Draft Flow', () => {

    test('should complete full draft creation to completion', async () => {
      // Create a separate league for this workflow test
      const uniqueInviteCode = `W${Date.now().toString().slice(-8)}`;
      const leagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters, settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'Workflow Draft League',
          'pre_draft',
          '2025',
          'regular',
          'redraft',
          2,
          JSON.stringify({ commissioner_id: testUser1Id }),
          JSON.stringify({}),
          JSON.stringify([{ position: 'QB', count: 1 }]),
          uniqueInviteCode
        ]
      );
      const workflowLeagueId = leagueResult.rows[0].id;

      // Create rosters
      const wRoster1 = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, 1, '[]', '[]', '[]', '[]', '{}') RETURNING id`,
        [workflowLeagueId, testUser1Id]
      );
      const wRoster2 = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, 2, '[]', '[]', '[]', '[]', '{}') RETURNING id`,
        [workflowLeagueId, testUser2Id]
      );

      // Step 1: Create draft
      const createDraftResponse = await request(app)
        .post('/api/v1/drafts/create')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({
          league_id: workflowLeagueId,
          draft_type: 'linear',
          rounds: 2,
        });

      expect(createDraftResponse.status).toBe(201);
      const workflowDraftId = createDraftResponse.body.data.draft.id;

      // Step 2: Set draft order
      const setOrderResponse = await request(app)
        .post(`/api/v1/drafts/${workflowDraftId}/order`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({
          draft_order: [
            { roster_id: wRoster1.rows[0].id, draft_position: 1 },
            { roster_id: wRoster2.rows[0].id, draft_position: 2 },
          ],
        });

      expect(setOrderResponse.status).toBe(200);

      // Step 3: Start draft
      const startResponse = await request(app)
        .post(`/api/v1/drafts/${workflowDraftId}/start`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(startResponse.status).toBe(200);

      // Step 4: Make picks (linear draft, 2 rounds, 2 teams = 4 picks)
      const pick1 = await request(app)
        .post(`/api/v1/drafts/${workflowDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ roster_id: wRoster1.rows[0].id, player_id: testPlayerIds[5] });
      expect(pick1.status).toBe(200);

      const pick2 = await request(app)
        .post(`/api/v1/drafts/${workflowDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ roster_id: wRoster2.rows[0].id, player_id: testPlayerIds[6] });
      expect(pick2.status).toBe(200);

      const pick3 = await request(app)
        .post(`/api/v1/drafts/${workflowDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser1Token}`)
        .send({ roster_id: wRoster1.rows[0].id, player_id: testPlayerIds[7] });
      expect(pick3.status).toBe(200);

      const pick4 = await request(app)
        .post(`/api/v1/drafts/${workflowDraftId}/pick`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({ roster_id: wRoster2.rows[0].id, player_id: testPlayerIds[8] });
      expect(pick4.status).toBe(200);

      // Step 5: Verify draft status is completing or completed
      const draftCheck = await pool.query(
        'SELECT * FROM drafts WHERE id = $1',
        [workflowDraftId]
      );
      expect(['completing', 'completed']).toContain(draftCheck.rows[0].status);

      // Step 6: Verify all picks were recorded
      const picksResponse = await request(app)
        .get(`/api/v1/drafts/${workflowDraftId}/picks`)
        .set('Authorization', `Bearer ${testUser1Token}`);

      expect(picksResponse.body.data.picks.length).toBe(4);

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [workflowDraftId]);
      await pool.query('DELETE FROM leagues WHERE id = $1', [workflowLeagueId]);
    });
  });
});
