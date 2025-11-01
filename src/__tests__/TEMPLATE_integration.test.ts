/**
 * INTEGRATION TEST TEMPLATE
 *
 * Purpose: Test multiple components working together (API + Database)
 * Use for: API endpoints, service interactions, database operations
 *
 * Copy this file and rename to: [feature-name]-integration.test.ts
 */

import request from 'supertest';
import { app } from '../app';
import { pool } from '../db';
import jwt from 'jsonwebtoken';

describe('[Feature] Integration Tests', () => {

  // Test data that persists across tests
  let testUserId: number;
  let testToken: string;
  let testLeagueId: number;

  // ========================================
  // SETUP & TEARDOWN
  // ========================================

  beforeAll(async () => {
    // Run ONCE before all tests
    // Create test user and auth token
    const userResult = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
      ['testuser', 'test@test.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Generate JWT token for authenticated requests
    testToken = jwt.sign(
      { userId: testUserId },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Run ONCE after all tests
    // Clean up test data
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Run BEFORE EACH test
    // Reset specific tables to clean state
    // await pool.query('TRUNCATE TABLE [specific_table] CASCADE');
  });

  afterEach(async () => {
    // Run AFTER EACH test
    // Clean up test-specific data
  });

  // ========================================
  // API ENDPOINT TESTS
  // ========================================

  describe('POST /api/[endpoint]', () => {

    test('should create resource with valid data', async () => {
      // Arrange: Prepare request data
      const requestData = {
        name: 'Test Resource',
        // ... other fields
      };

      // Act: Make API request
      const response = await request(app)
        .post('/api/[endpoint]')
        .set('Authorization', `Bearer ${testToken}`)
        .send(requestData);

      // Assert: Check response
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(Number),
        name: 'Test Resource',
        // ... other expected fields
      });

      // Assert: Verify database state
      const dbResult = await pool.query(
        'SELECT * FROM [table] WHERE id = $1',
        [response.body.id]
      );
      expect(dbResult.rows[0].name).toBe('Test Resource');
    });

    test('should return 400 with missing required fields', async () => {
      const invalidData = {
        // Missing required field
      };

      const response = await request(app)
        .post('/api/[endpoint]')
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('required');
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/[endpoint]')
        .send({ name: 'Test' });

      expect(response.status).toBe(401);
    });

    test('should return 403 for unauthorized user', async () => {
      // Create another user's resource
      const otherUserToken = jwt.sign(
        { userId: 99999 },
        process.env.JWT_SECRET || 'test-secret'
      );

      const response = await request(app)
        .post('/api/[endpoint]')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/[endpoint]/:id', () => {

    let resourceId: number;

    beforeEach(async () => {
      // Create test resource
      const result = await pool.query(
        'INSERT INTO [table] (name, user_id) VALUES ($1, $2) RETURNING id',
        ['Test Resource', testUserId]
      );
      resourceId = result.rows[0].id;
    });

    afterEach(async () => {
      // Clean up
      await pool.query('DELETE FROM [table] WHERE id = $1', [resourceId]);
    });

    test('should retrieve resource by id', async () => {
      const response = await request(app)
        .get(`/api/[endpoint]/${resourceId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: resourceId,
        name: 'Test Resource'
      });
    });

    test('should return 404 for non-existent resource', async () => {
      const response = await request(app)
        .get('/api/[endpoint]/99999')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/[endpoint]/:id', () => {

    test('should update resource with valid data', async () => {
      // First create a resource
      const createResponse = await request(app)
        .post('/api/[endpoint]')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Original Name' });

      const resourceId = createResponse.body.id;

      // Then update it
      const updateResponse = await request(app)
        .put(`/api/[endpoint]/${resourceId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Updated Name' });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.name).toBe('Updated Name');

      // Verify in database
      const dbResult = await pool.query(
        'SELECT name FROM [table] WHERE id = $1',
        [resourceId]
      );
      expect(dbResult.rows[0].name).toBe('Updated Name');
    });
  });

  describe('DELETE /api/[endpoint]/:id', () => {

    test('should delete resource', async () => {
      // Create resource
      const createResponse = await request(app)
        .post('/api/[endpoint]')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'To Delete' });

      const resourceId = createResponse.body.id;

      // Delete it
      const deleteResponse = await request(app)
        .delete(`/api/[endpoint]/${resourceId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(deleteResponse.status).toBe(200);

      // Verify deleted from database
      const dbResult = await pool.query(
        'SELECT * FROM [table] WHERE id = $1',
        [resourceId]
      );
      expect(dbResult.rows.length).toBe(0);
    });
  });
});

// ============================================
// EXAMPLE: Draft Integration Tests
// ============================================

/*
import request from 'supertest';
import { app } from '../app';
import { pool } from '../db';
import jwt from 'jsonwebtoken';

describe('Draft Integration Tests', () => {
  let userId: number;
  let authToken: string;
  let leagueId: number;
  let draftId: number;
  let teamId: number;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
      ['draftuser', 'draft@test.com', 'hashedpassword']
    );
    userId = userResult.rows[0].id;
    authToken = jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');

    // Create test league
    const leagueResult = await pool.query(
      'INSERT INTO leagues (name, owner_id, num_teams, draft_type) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Draft Test League', userId, 10, 'snake']
    );
    leagueId = leagueResult.rows[0].id;

    // Create team
    const teamResult = await pool.query(
      'INSERT INTO teams (league_id, user_id, team_name) VALUES ($1, $2, $3) RETURNING id',
      [leagueId, userId, 'Test Team']
    );
    teamId = teamResult.rows[0].id;

    // Create draft
    const draftResult = await pool.query(
      'INSERT INTO drafts (league_id, status, current_pick) VALUES ($1, $2, $3) RETURNING id',
      [leagueId, 'in_progress', 1]
    );
    draftId = draftResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM drafts WHERE id = $1', [draftId]);
    await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
    await pool.query('DELETE FROM leagues WHERE id = $1', [leagueId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  describe('POST /api/draft/:leagueId/pick', () => {

    test('should successfully make a draft pick', async () => {
      const response = await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          playerId: 4046, // Patrick Mahomes
          pickNumber: 1
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        pick: {
          playerId: 4046,
          teamId: teamId,
          pickNumber: 1
        }
      });

      // Verify player added to roster
      const rosterResult = await pool.query(
        'SELECT * FROM rosters WHERE team_id = $1 AND player_id = $2',
        [teamId, 4046]
      );
      expect(rosterResult.rows.length).toBe(1);
      expect(rosterResult.rows[0].player_id).toBe(4046);

      // Verify draft advanced
      const draftResult = await pool.query(
        'SELECT current_pick FROM drafts WHERE id = $1',
        [draftId]
      );
      expect(draftResult.rows[0].current_pick).toBe(2);
    });

    test('should reject drafting already-drafted player', async () => {
      // First, draft a player
      await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ playerId: 4866, pickNumber: 1 });

      // Try to draft same player again
      const response = await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ playerId: 4866, pickNumber: 2 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already drafted');
    });

    test('should reject pick when not on the clock', async () => {
      // Update draft to pick 5 (different team)
      await pool.query(
        'UPDATE drafts SET current_pick = $1 WHERE id = $2',
        [5, draftId]
      );

      const response = await request(app)
        .post(`/api/draft/${leagueId}/pick`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ playerId: 4984, pickNumber: 5 });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('not on the clock');
    });
  });

  describe('GET /api/draft/:leagueId/status', () => {

    test('should return current draft status', async () => {
      const response = await request(app)
        .get(`/api/draft/${leagueId}/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        draftId: draftId,
        status: 'in_progress',
        currentPick: expect.any(Number),
        onTheClock: expect.any(Object)
      });
    });
  });

  describe('POST /api/draft/:leagueId/start', () => {

    test('should start draft successfully', async () => {
      // Create new league for this test
      const newLeagueResult = await pool.query(
        'INSERT INTO leagues (name, owner_id, num_teams) VALUES ($1, $2, $3) RETURNING id',
        ['New Draft League', userId, 10]
      );
      const newLeagueId = newLeagueResult.rows[0].id;

      const response = await request(app)
        .post(`/api/draft/${newLeagueId}/start`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        draftId: expect.any(Number)
      });

      // Verify draft created in database
      const draftResult = await pool.query(
        'SELECT * FROM drafts WHERE league_id = $1',
        [newLeagueId]
      );
      expect(draftResult.rows.length).toBe(1);
      expect(draftResult.rows[0].status).toBe('in_progress');

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE league_id = $1', [newLeagueId]);
      await pool.query('DELETE FROM leagues WHERE id = $1', [newLeagueId]);
    });

    test('should reject starting draft if already started', async () => {
      const response = await request(app)
        .post(`/api/draft/${leagueId}/start`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already started');
    });
  });
});
*/
