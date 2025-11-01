/**
 * Draft Derby Integration Tests
 * Tests the complete derby flow from creation to selection
 */

import request from 'supertest';
import app from '../index';
import pool from '../config/database';
import { generateToken } from '../utils/jwt';

describe('Draft Derby - Integration Tests', () => {
  let authToken: string;
  let testUserId: number;
  let testLeagueId: number;
  let testDraftId: number;
  let testRosterIds: number[] = [];
  let testUserIds: number[] = [];

  beforeAll(async () => {
    // Generate unique invite code for this test run
    const uniqueInviteCode = `DERBY${Date.now().toString().slice(-5)}`;

    // Cleanup any leftover test data
    await pool.query(`DELETE FROM users WHERE username LIKE 'derbytest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'DERBY%'`);

    // Create test users (4 users for 4 rosters)
    for (let i = 1; i <= 4; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`derbytestuser${i}`, `derby${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    testUserId = testUserIds[0]; // Commissioner is first user
    authToken = generateToken({ userId: testUserId, username: 'derbytestuser1' });

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Derby Test League',
        'pre_draft',
        '2025',
        'regular',
        'redraft',
        4,
        JSON.stringify({ commissioner_id: testUserId }),
        JSON.stringify({}),
        JSON.stringify([]),
        uniqueInviteCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test rosters (4 teams, each with different user)
    for (let i = 1; i <= 4; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          testLeagueId,
          testUserIds[i - 1], // Use different user for each roster
          i,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({ team_name: `Team ${i}` })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    // Cleanup
    if (testLeagueId) {
      await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
    }
    // Delete all test users
    for (const userId of testUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  describe('POST /api/v1/drafts/create - with derby enabled', () => {
    it('should create a draft with derby enabled', async () => {
      const response = await request(app)
        .post('/api/v1/drafts/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          league_id: testLeagueId,
          draft_type: 'snake',
          rounds: 15,
          pick_time_seconds: 90,
          third_round_reversal: false,
          derby_enabled: true,
          derby_time_limit_seconds: 120,
          derby_timeout_behavior: 'auto'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.derby_enabled).toBe(true);
      expect(response.body.data.derby_time_limit_seconds).toBe(120);
      expect(response.body.data.derby_timeout_behavior).toBe('auto');

      testDraftId = response.body.data.id;
    });

    it('should have derby_enabled=false by default', async () => {
      // Create a second league for this test
      const uniqueCode = `DERBY${Date.now().toString().slice(-5)}`;
      const leagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'No Derby League',
          'pre_draft',
          '2025',
          'regular',
          'redraft',
          4,
          JSON.stringify({ commissioner_id: testUserId }),
          JSON.stringify({}),
          JSON.stringify([]),
          uniqueCode
        ]
      );
      const noDerbyLeagueId = leagueResult.rows[0].id;

      const response = await request(app)
        .post('/api/v1/drafts/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          league_id: noDerbyLeagueId,
          draft_type: 'snake',
          rounds: 15,
          pick_time_seconds: 90
        });

      expect(response.status).toBe(201);
      expect(response.body.data.derby_enabled).toBe(false);

      // Cleanup
      await pool.query('DELETE FROM leagues WHERE id = $1', [noDerbyLeagueId]);
    });
  });

  describe('POST /api/v1/drafts/:draftId/order - randomize order', () => {
    it('should randomize draft order', async () => {
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/order`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ randomize: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(4);

      // Verify each roster has a unique position
      const positions = response.body.data.map((order: any) => order.draft_position);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(4);
    });
  });

  describe('POST /api/v1/drafts/:draftId/derby/start - start derby', () => {
    it('should start the derby after order is randomized', async () => {
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/derby/start`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('derby');
      expect(response.body.data.derby.status).toBe('in_progress');
      expect(response.body.data.derby.draft_id).toBe(testDraftId);
      expect(response.body.data).toHaveProperty('current_turn_roster');
    });

    it('should fail to start derby without authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/derby/start`);

      expect(response.status).toBe(401);
    });

    it('should fail to start derby for non-existent draft', async () => {
      const response = await request(app)
        .post('/api/v1/drafts/999999/derby/start')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/drafts/:draftId/derby - get derby state', () => {
    it('should retrieve derby state', async () => {
      const response = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/derby`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('derby');
      expect(response.body.data.derby.status).toBe('in_progress');
      expect(response.body.data).toHaveProperty('available_positions');
      expect(response.body.data.available_positions).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/v1/drafts/:draftId/derby/select - make selection', () => {
    let currentTurnRosterId: number;

    beforeEach(async () => {
      // Get current turn roster
      const derbyResponse = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/derby`)
        .set('Authorization', `Bearer ${authToken}`);

      currentTurnRosterId = derbyResponse.body.data.current_turn_roster.id;
    });

    it('should allow current roster to select a position', async () => {
      // Get available positions
      const derbyResponse = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/derby`)
        .set('Authorization', `Bearer ${authToken}`);

      const availablePositions = derbyResponse.body.data.available_positions;
      expect(availablePositions.length).toBeGreaterThan(0);

      const selectedPosition = availablePositions[0];

      const response = await request(app)
        .post(`/api/v1/drafts/${testDraftId}/derby/select`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roster_id: currentTurnRosterId,
          draft_position: selectedPosition
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('derby');
      expect(response.body.data).toHaveProperty('selection');
      expect(response.body.data.selection.roster_id).toBe(currentTurnRosterId);
      expect(response.body.data.selection.draft_position).toBe(selectedPosition);
    });

    it('should fail if selecting an already-taken position', async () => {
      // Get a taken position from previous selection
      const derbyResponse = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/derby`)
        .set('Authorization', `Bearer ${authToken}`);

      const takenPositions = [1, 2, 3, 4].filter(
        pos => !derbyResponse.body.data.available_positions.includes(pos)
      );

      if (takenPositions.length > 0) {
        const response = await request(app)
          .post(`/api/v1/drafts/${testDraftId}/derby/select`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roster_id: derbyResponse.body.data.current_turn_roster.id,
            draft_position: takenPositions[0]
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('not available');
      }
    });
  });

  describe('Derby completion', () => {
    it('should complete derby when all positions are selected', async () => {
      // Keep selecting positions until derby is complete
      let derbyComplete = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!derbyComplete && attempts < maxAttempts) {
        attempts++;

        // Get derby state
        const derbyResponse = await request(app)
          .get(`/api/v1/drafts/${testDraftId}/derby`)
          .set('Authorization', `Bearer ${authToken}`);

        if (derbyResponse.body.data.derby.status === 'completed') {
          derbyComplete = true;
          break;
        }

        const availablePositions = derbyResponse.body.data.available_positions;
        if (availablePositions.length === 0) {
          derbyComplete = true;
          break;
        }

        const currentRosterId = derbyResponse.body.data.current_turn_roster.id;
        const selectedPosition = availablePositions[0];

        // Make selection
        await request(app)
          .post(`/api/v1/drafts/${testDraftId}/derby/select`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roster_id: currentRosterId,
            draft_position: selectedPosition
          });
      }

      expect(derbyComplete).toBe(true);

      // Verify final state
      const finalResponse = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/derby`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalResponse.body.data.derby.status).toBe('completed');
      expect(finalResponse.body.data.available_positions).toHaveLength(0);
    });

    it('should have assigned all draft positions', async () => {
      const orderResponse = await request(app)
        .get(`/api/v1/drafts/${testDraftId}/order`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(orderResponse.status).toBe(200);
      expect(orderResponse.body.data).toHaveLength(4);

      // Verify all positions are unique and in range 1-4
      const positions = orderResponse.body.data.map((order: any) => order.draft_position);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(4);

      positions.forEach((pos: number) => {
        expect(pos).toBeGreaterThanOrEqual(1);
        expect(pos).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('Derby with auction draft type', () => {
    it('should not allow derby for auction drafts', async () => {
      // Create a second league for auction test
      const uniqueCode = `DERBY${Date.now().toString().slice(-5)}`;
      const leagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'Auction Derby Test',
          'pre_draft',
          '2025',
          'regular',
          'redraft',
          4,
          JSON.stringify({ commissioner_id: testUserId }),
          JSON.stringify({}),
          JSON.stringify([]),
          uniqueCode
        ]
      );
      const auctionLeagueId = leagueResult.rows[0].id;

      // Try to create auction draft with derby
      const response = await request(app)
        .post('/api/v1/drafts/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          league_id: auctionLeagueId,
          draft_type: 'auction',
          starting_budget: 200,
          min_bid: 1,
          derby_enabled: true  // Should be ignored or fail
        });

      // Derby should either be disabled or creation should fail
      if (response.status === 201) {
        expect(response.body.data.derby_enabled).toBe(false);
      } else {
        expect(response.status).toBe(400);
      }

      // Cleanup
      await pool.query('DELETE FROM leagues WHERE id = $1', [auctionLeagueId]);
    });
  });
});
