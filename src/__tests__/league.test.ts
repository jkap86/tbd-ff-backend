/**
 * League and Roster Integration Tests
 * Tests league creation, roster management, and team operations
 */

import { Request, Response } from 'express';
import {
  createLeague,
  getLeagueDetails,
  updateLeagueSettings,
} from '../controllers/leagueController';
import { createRoster, getRostersByLeague } from '../controllers/rosterController';
import pool from '../config/database';
import { mockRequest, mockResponse, mockAuthUser } from './setup';

describe('League and Roster Management', () => {
  let testLeagueId: number;
  let testRosterId: number;

  afterEach(async () => {
    // Cleanup test data
    if (testRosterId) {
      await pool.query('DELETE FROM rosters WHERE id = $1', [testRosterId]);
      testRosterId = null as any;
    }
    if (testLeagueId) {
      await pool.query('DELETE FROM rosters WHERE league_id = $1', [testLeagueId]);
      await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
      testLeagueId = null as any;
    }
  });

  describe('League Creation', () => {
    it('should create a new league with valid settings', async () => {
      const req = mockRequest({
        body: {
          name: 'Test League',
          description: 'Test Description',
          season: '2025',
          maxTeams: 12,
          scoringType: 'ppr',
          draftType: 'snake',
          settings: {
            roster_positions: [
              { position: 'QB', count: 1 },
              { position: 'RB', count: 2 },
              { position: 'WR', count: 2 },
              { position: 'TE', count: 1 },
              { position: 'FLEX', count: 1 },
              { position: 'BN', count: 5 },
            ],
          },
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createLeague(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data).toMatchObject({
        name: 'Test League',
        commissioner_id: mockAuthUser.userId,
        max_teams: 12,
        scoring_type: 'ppr',
        draft_type: 'snake',
      });

      testLeagueId = responseData.data.id;
    });

    it('should reject league with invalid max_teams', async () => {
      const req = mockRequest({
        body: {
          name: 'Invalid League',
          season: '2025',
          maxTeams: 50, // Too many
          scoringType: 'ppr',
          draftType: 'snake',
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createLeague(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should create a commissioner roster automatically', async () => {
      const req = mockRequest({
        body: {
          name: 'Auto Roster League',
          season: '2025',
          maxTeams: 10,
          scoringType: 'ppr',
          draftType: 'snake',
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createLeague(req as Request, res as Response);

      const leagueId = res.json.mock.calls[0][0].data.id;
      testLeagueId = leagueId;

      // Check if roster was created
      const rostersReq = mockRequest({
        params: { leagueId },
        user: mockAuthUser,
      });
      const rostersRes = mockResponse();

      await getRostersByLeague(rostersReq as Request, rostersRes as Response);

      const rosters = rostersRes.json.mock.calls[0][0].data;
      expect(rosters).toHaveLength(1);
      expect(rosters[0].user_id).toBe(mockAuthUser.userId);
    });
  });

  describe('League Details', () => {
    beforeEach(async () => {
      // Create test league
      const result = await pool.query(
        `INSERT INTO leagues (name, commissioner_id, season, max_teams, scoring_type, draft_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['Detail Test League', mockAuthUser.userId, '2025', 10, 'ppr', 'snake']
      );
      testLeagueId = result.rows[0].id;
    });

    it('should retrieve league details', async () => {
      const req = mockRequest({
        params: { id: testLeagueId },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await getLeagueDetails(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data).toMatchObject({
        id: testLeagueId,
        name: 'Detail Test League',
        commissioner_id: mockAuthUser.userId,
      });
    });

    it('should return 404 for non-existent league', async () => {
      const req = mockRequest({
        params: { id: 99999 },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await getLeagueDetails(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('League Settings', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO leagues (name, commissioner_id, season, max_teams, scoring_type, draft_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['Settings Test League', mockAuthUser.userId, '2025', 10, 'ppr', 'snake']
      );
      testLeagueId = result.rows[0].id;
    });

    it('should allow commissioner to update settings', async () => {
      const req = mockRequest({
        params: { leagueId: testLeagueId },
        body: {
          settings: {
            roster_positions: [
              { position: 'QB', count: 2 },
              { position: 'RB', count: 3 },
            ],
            scoring_settings: {
              passing_td: 6,
              rushing_td: 6,
            },
          },
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await updateLeagueSettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
    });

    it('should not allow non-commissioner to update settings', async () => {
      const nonCommissioner = {
        userId: 999,
        username: 'noncommish',
        isAdmin: false,
      };

      const req = mockRequest({
        params: { leagueId: testLeagueId },
        body: {
          settings: { roster_positions: [] },
        },
        user: nonCommissioner,
      });
      const res = mockResponse();

      await updateLeagueSettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Roster Management', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO leagues (name, commissioner_id, season, max_teams, scoring_type, draft_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['Roster Test League', mockAuthUser.userId, '2025', 10, 'ppr', 'snake']
      );
      testLeagueId = result.rows[0].id;
    });

    it('should create a roster for a league', async () => {
      const req = mockRequest({
        body: {
          leagueId: testLeagueId,
          teamName: 'Test Team',
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createRoster(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data).toMatchObject({
        league_id: testLeagueId,
        team_name: 'Test Team',
        user_id: mockAuthUser.userId,
      });

      testRosterId = responseData.data.id;
    });

    it('should not allow more rosters than max_teams', async () => {
      // Create a league with max 2 teams
      const smallLeagueResult = await pool.query(
        `INSERT INTO leagues (name, commissioner_id, season, max_teams, scoring_type, draft_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['Small League', mockAuthUser.userId, '2025', 2, 'ppr', 'snake']
      );
      const smallLeagueId = smallLeagueResult.rows[0].id;

      // Create 2 rosters
      await pool.query(
        `INSERT INTO rosters (league_id, team_name, user_id) VALUES ($1, $2, $3)`,
        [smallLeagueId, 'Team 1', mockAuthUser.userId]
      );
      await pool.query(
        `INSERT INTO rosters (league_id, team_name, user_id) VALUES ($1, $2, $3)`,
        [smallLeagueId, 'Team 2', null]
      );

      // Try to create a 3rd
      const req = mockRequest({
        body: {
          leagueId: smallLeagueId,
          teamName: 'Team 3',
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createRoster(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('maximum'),
        })
      );

      // Cleanup
      await pool.query('DELETE FROM rosters WHERE league_id = $1', [smallLeagueId]);
      await pool.query('DELETE FROM leagues WHERE id = $1', [smallLeagueId]);
    });

    it('should retrieve all rosters for a league', async () => {
      // Create 3 rosters
      await pool.query(
        `INSERT INTO rosters (league_id, team_name, user_id) VALUES ($1, $2, $3)`,
        [testLeagueId, 'Team A', mockAuthUser.userId]
      );
      await pool.query(
        `INSERT INTO rosters (league_id, team_name, user_id) VALUES ($1, $2, $3)`,
        [testLeagueId, 'Team B', null]
      );
      await pool.query(
        `INSERT INTO rosters (league_id, team_name, user_id) VALUES ($1, $2, $3)`,
        [testLeagueId, 'Team C', null]
      );

      const req = mockRequest({
        params: { leagueId: testLeagueId },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await getRostersByLeague(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveLength(3);
    });
  });
});
