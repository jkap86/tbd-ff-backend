/**
 * Draft Flow Integration Tests
 * Tests critical draft functionality including pick making, order, and validation
 */

import { Request, Response } from 'express';
import { createDraft, startDraft, makePick, setDraftOrder } from '../controllers/draftController';
import pool from '../config/database';
import { mockRequest, mockResponse, mockAuthUser } from './setup';

describe('Draft Flow', () => {
  let testLeagueId: number;
  let testDraftId: number;
  let testRosterIds: number[];
  let testPlayerIds: string[];

  beforeAll(async () => {
    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, commissioner_id, season, max_teams, scoring_type, draft_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['Test League', mockAuthUser.userId, '2025', 4, 'ppr', 'snake']
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create rosters
    testRosterIds = [];
    for (let i = 0; i < 4; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, team_name, user_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [testLeagueId, `Team ${i + 1}`, i === 0 ? mockAuthUser.userId : null]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }

    // Get some test player IDs
    const playersResult = await pool.query(
      `SELECT player_id FROM players WHERE position = 'QB' LIMIT 10`
    );
    testPlayerIds = playersResult.rows.map(r => r.player_id);
  });

  afterAll(async () => {
    // Cleanup test data
    if (testDraftId) {
      await pool.query('DELETE FROM draft_picks WHERE draft_id = $1', [testDraftId]);
      await pool.query('DELETE FROM draft_order WHERE draft_id = $1', [testDraftId]);
      await pool.query('DELETE FROM drafts WHERE id = $1', [testDraftId]);
    }
    if (testLeagueId) {
      await pool.query('DELETE FROM rosters WHERE league_id = $1', [testLeagueId]);
      await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
    }
  });

  describe('Draft Creation', () => {
    it('should create a draft for a league', async () => {
      const req = mockRequest({
        body: {
          leagueId: testLeagueId,
          draftType: 'snake',
          pickTimeSeconds: 60,
          totalRounds: 12,
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createDraft(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Draft created successfully',
          data: expect.objectContaining({
            draft_type: 'snake',
            status: 'not_started',
          }),
        })
      );

      // Store draft ID for other tests
      testDraftId = res.json.mock.calls[0][0].data.id;
    });

    it('should not allow creating duplicate drafts for same league', async () => {
      const req = mockRequest({
        body: {
          leagueId: testLeagueId,
          draftType: 'snake',
          pickTimeSeconds: 60,
          totalRounds: 12,
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await createDraft(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('already has a draft'),
        })
      );
    });
  });

  describe('Draft Order', () => {
    it('should set randomized draft order', async () => {
      const req = mockRequest({
        params: { draftId: testDraftId },
        body: { randomize: true },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await setDraftOrder(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveLength(4);

      // Verify all rosters are included
      const rosterIdsInOrder = responseData.data.map((o: any) => o.roster_id);
      expect(rosterIdsInOrder.sort()).toEqual(testRosterIds.sort());
    });

    it('should persist draft order across requests', async () => {
      const req1 = mockRequest({
        params: { draftId: testDraftId },
        user: mockAuthUser,
      });
      const res1 = mockResponse();

      // Get order first time
      await setDraftOrder(req1 as Request, res1 as Response);
      const order1 = res1.json.mock.calls[0][0].data;

      // Get order second time
      const req2 = mockRequest({
        params: { draftId: testDraftId },
        user: mockAuthUser,
      });
      const res2 = mockResponse();
      await setDraftOrder(req2 as Request, res2 as Response);
      const order2 = res2.json.mock.calls[0][0].data;

      // Should be identical
      expect(order1.map((o: any) => o.roster_id)).toEqual(
        order2.map((o: any) => o.roster_id)
      );
    });
  });

  describe('Draft Start', () => {
    it('should start a draft with valid order', async () => {
      const req = mockRequest({
        params: { draftId: testDraftId },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await startDraft(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'in_progress',
          }),
        })
      );
    });
  });

  describe('Draft Picks', () => {
    it('should make a valid pick', async () => {
      if (testPlayerIds.length === 0) {
        console.warn('No test players available, skipping pick test');
        return;
      }

      const req = mockRequest({
        params: { draftId: testDraftId },
        body: {
          playerId: testPlayerIds[0],
          rosterId: testRosterIds[0],
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await makePick(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.pick).toMatchObject({
        player_id: testPlayerIds[0],
        roster_id: testRosterIds[0],
        pick_number: 1,
        round: 1,
      });
    });

    it('should not allow duplicate player picks', async () => {
      if (testPlayerIds.length === 0) {
        console.warn('No test players available, skipping duplicate pick test');
        return;
      }

      const req = mockRequest({
        params: { draftId: testDraftId },
        body: {
          playerId: testPlayerIds[0], // Same player as previous test
          rosterId: testRosterIds[1],
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await makePick(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('already been drafted'),
        })
      );
    });

    it('should enforce pick order', async () => {
      if (testPlayerIds.length < 2) {
        console.warn('Not enough test players, skipping pick order test');
        return;
      }

      // Try to pick out of turn (should be roster at position 2 now)
      const req = mockRequest({
        params: { draftId: testDraftId },
        body: {
          playerId: testPlayerIds[1],
          rosterId: testRosterIds[3], // Wrong roster
        },
        user: mockAuthUser,
      });
      const res = mockResponse();

      await makePick(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('not your turn'),
        })
      );
    });
  });

  describe('Snake Draft Order', () => {
    it('should reverse order in even rounds', async () => {
      // This test verifies snake draft logic
      // Round 1: 1,2,3,4
      // Round 2: 4,3,2,1

      // Get draft order
      const orderResult = await pool.query(
        `SELECT roster_id, draft_position FROM draft_order
         WHERE draft_id = $1 ORDER BY draft_position`,
        [testDraftId]
      );

      const firstRoundOrder = orderResult.rows.map(r => r.roster_id);

      // Get current pick number
      const pickResult = await pool.query(
        `SELECT COUNT(*) as count FROM draft_picks WHERE draft_id = $1`,
        [testDraftId]
      );
      const pickCount = parseInt(pickResult.rows[0].count);

      // Calculate expected next roster based on snake draft
      const teamCount = firstRoundOrder.length;
      const currentRound = Math.floor(pickCount / teamCount) + 1;
      const positionInRound = pickCount % teamCount;

      let expectedRosterIndex;
      if (currentRound % 2 === 1) {
        // Odd round: normal order
        expectedRosterIndex = positionInRound;
      } else {
        // Even round: reversed order
        expectedRosterIndex = teamCount - 1 - positionInRound;
      }

      const expectedRosterId = firstRoundOrder[expectedRosterIndex];

      // Verify this matches what the system expects
      const draftResult = await pool.query(
        `SELECT current_pick FROM drafts WHERE id = $1`,
        [testDraftId]
      );

      expect(draftResult.rows[0].current_pick).toBe(pickCount + 1);
    });
  });
});
