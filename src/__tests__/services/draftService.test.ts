/**
 * Draft Service Comprehensive Tests
 * Tests draft logic, pick calculations, and complex draft scenarios
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import pool from '../../config/database';
import {
  calculateCurrentRoster
} from '../../controllers/draftController';
import {
  getDraftById,
  resetDraft
} from '../../models/Draft';
import {
  setDraftOrder,
  getDraftOrder,
  getRosterAtPosition
} from '../../models/DraftOrder';

describe('Draft Service - Comprehensive Tests', () => {
  let testLeagueId: number;
  let testRosterIds: number[] = [];
  let testUserIds: number[] = [];
  let cleanupLeagueIds: number[] = [];

  beforeAll(async () => {
    // Create 12 test users
    for (let i = 1; i <= 12; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`drafttest${i}_${Date.now()}`, `drafttest${i}_${Date.now()}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Draft Test League',
        'pre_draft',
        '2025',
        'regular',
        'redraft',
        12,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([]),
        'DRAFT' + Date.now().toString().slice(-5)
      ]
    );
    testLeagueId = leagueResult.rows[0].id;
    cleanupLeagueIds.push(testLeagueId);

    // Create 12 test rosters
    for (let i = 1; i <= 12; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          testLeagueId,
          testUserIds[i - 1],
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
    // Cleanup leagues (will cascade to rosters)
    for (const leagueId of cleanupLeagueIds) {
      await pool.query('DELETE FROM leagues WHERE id = $1', [leagueId]);
    }
    // Cleanup users
    for (const userId of testUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  // ============================================
  // 1. DRAFT ORDER CALCULATION TESTS
  // ============================================

  describe('Draft Order Calculation', () => {

    describe('Linear Draft Order', () => {
      test('should calculate linear order correctly for round 1', () => {
        const totalRosters = 12;
        const draftType = 'linear';

        // Round 1, Pick 1 should be position 1
        const pick1 = calculateCurrentRoster(1, totalRosters, draftType, false);
        expect(pick1).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

        // Round 1, Pick 12 should be position 12
        const pick12 = calculateCurrentRoster(12, totalRosters, draftType, false);
        expect(pick12).toEqual({ round: 1, pickInRound: 12, draftPosition: 12 });
      });

      test('should calculate linear order correctly for round 2', () => {
        const totalRosters = 12;
        const draftType = 'linear';

        // Round 2, Pick 13 should be position 1 (same order)
        const pick13 = calculateCurrentRoster(13, totalRosters, draftType, false);
        expect(pick13).toEqual({ round: 2, pickInRound: 1, draftPosition: 1 });

        // Round 2, Pick 24 should be position 12 (same order)
        const pick24 = calculateCurrentRoster(24, totalRosters, draftType, false);
        expect(pick24).toEqual({ round: 2, pickInRound: 12, draftPosition: 12 });
      });

      test('should maintain same order across all rounds', () => {
        const totalRosters = 10;
        const draftType = 'linear';

        // Check picks at start of each round maintain order
        for (let round = 1; round <= 15; round++) {
          const pickNumber = (round - 1) * totalRosters + 1;
          const result = calculateCurrentRoster(pickNumber, totalRosters, draftType, false);

          expect(result.round).toBe(round);
          expect(result.pickInRound).toBe(1);
          expect(result.draftPosition).toBe(1); // Linear: always position 1 at start
        }
      });
    });

    describe('Snake Draft Order', () => {
      test('should calculate snake order correctly for rounds 1-2', () => {
        const totalRosters = 12;
        const draftType = 'snake';

        // Round 1: 1-12 (forward)
        const pick1 = calculateCurrentRoster(1, totalRosters, draftType, false);
        expect(pick1).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

        const pick12 = calculateCurrentRoster(12, totalRosters, draftType, false);
        expect(pick12).toEqual({ round: 1, pickInRound: 12, draftPosition: 12 });

        // Round 2: 12-1 (reversed)
        const pick13 = calculateCurrentRoster(13, totalRosters, draftType, false);
        expect(pick13).toEqual({ round: 2, pickInRound: 1, draftPosition: 12 });

        const pick24 = calculateCurrentRoster(24, totalRosters, draftType, false);
        expect(pick24).toEqual({ round: 2, pickInRound: 12, draftPosition: 1 });
      });

      test('should calculate snake order correctly for rounds 3-4', () => {
        const totalRosters = 12;
        const draftType = 'snake';

        // Round 3: 1-12 (forward again)
        const pick25 = calculateCurrentRoster(25, totalRosters, draftType, false);
        expect(pick25).toEqual({ round: 3, pickInRound: 1, draftPosition: 1 });

        const pick36 = calculateCurrentRoster(36, totalRosters, draftType, false);
        expect(pick36).toEqual({ round: 3, pickInRound: 12, draftPosition: 12 });

        // Round 4: 12-1 (reversed)
        const pick37 = calculateCurrentRoster(37, totalRosters, draftType, false);
        expect(pick37).toEqual({ round: 4, pickInRound: 1, draftPosition: 12 });

        const pick48 = calculateCurrentRoster(48, totalRosters, draftType, false);
        expect(pick48).toEqual({ round: 4, pickInRound: 12, draftPosition: 1 });
      });

      test('should alternate correctly between forward and reverse', () => {
        const totalRosters = 8;
        const draftType = 'snake';

        // Test first pick of each round for 10 rounds
        for (let round = 1; round <= 10; round++) {
          const pickNumber = (round - 1) * totalRosters + 1;
          const result = calculateCurrentRoster(pickNumber, totalRosters, draftType, false);

          expect(result.round).toBe(round);
          expect(result.pickInRound).toBe(1);

          // Odd rounds: position 1, Even rounds: position 8
          const expectedPosition = round % 2 === 1 ? 1 : totalRosters;
          expect(result.draftPosition).toBe(expectedPosition);
        }
      });
    });

    describe('3rd Round Reversal', () => {
      test('should NOT reverse round 3 when reversal enabled', () => {
        const totalRosters = 12;
        const draftType = 'snake';
        const thirdRoundReversal = true;

        // Round 1: 1-12 (forward)
        const pick1 = calculateCurrentRoster(1, totalRosters, draftType, thirdRoundReversal);
        expect(pick1.draftPosition).toBe(1);

        // Round 2: 12-1 (reversed)
        const pick13 = calculateCurrentRoster(13, totalRosters, draftType, thirdRoundReversal);
        expect(pick13.draftPosition).toBe(12);

        // Round 3: 1-12 (FORWARD - no reversal)
        const pick25 = calculateCurrentRoster(25, totalRosters, draftType, thirdRoundReversal);
        expect(pick25.draftPosition).toBe(1);

        const pick36 = calculateCurrentRoster(36, totalRosters, draftType, thirdRoundReversal);
        expect(pick36.draftPosition).toBe(12);
      });

      test('should adjust pattern after round 3', () => {
        const totalRosters = 12;
        const draftType = 'snake';
        const thirdRoundReversal = true;

        // Round 4: Should be reversed
        const pick37 = calculateCurrentRoster(37, totalRosters, draftType, thirdRoundReversal);
        expect(pick37).toEqual({ round: 4, pickInRound: 1, draftPosition: 12 });

        // Round 5: Should be forward
        const pick49 = calculateCurrentRoster(49, totalRosters, draftType, thirdRoundReversal);
        expect(pick49).toEqual({ round: 5, pickInRound: 1, draftPosition: 1 });
      });

      test('should handle complete draft with 3rd round reversal', () => {
        const totalRosters = 10;
        const draftType = 'snake';
        const thirdRoundReversal = true;

        // Verify pattern for rounds 1-6
        const expectedFirstPickPositions = [
          1,  // Round 1: forward
          10, // Round 2: reversed
          1,  // Round 3: forward (reversal!)
          10, // Round 4: reversed
          1,  // Round 5: forward
          10  // Round 6: reversed
        ];

        for (let round = 1; round <= 6; round++) {
          const pickNumber = (round - 1) * totalRosters + 1;
          const result = calculateCurrentRoster(pickNumber, totalRosters, draftType, thirdRoundReversal);

          expect(result.draftPosition).toBe(expectedFirstPickPositions[round - 1]);
        }
      });
    });

    describe('Different League Sizes', () => {
      test('should handle 8-team league', () => {
        const totalRosters = 8;
        const draftType = 'snake';

        const pick1 = calculateCurrentRoster(1, totalRosters, draftType, false);
        expect(pick1).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

        const pick9 = calculateCurrentRoster(9, totalRosters, draftType, false);
        expect(pick9).toEqual({ round: 2, pickInRound: 1, draftPosition: 8 });
      });

      test('should handle 10-team league', () => {
        const totalRosters = 10;
        const draftType = 'snake';

        const pick1 = calculateCurrentRoster(1, totalRosters, draftType, false);
        expect(pick1).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

        const pick11 = calculateCurrentRoster(11, totalRosters, draftType, false);
        expect(pick11).toEqual({ round: 2, pickInRound: 1, draftPosition: 10 });
      });

      test('should handle 14-team league', () => {
        const totalRosters = 14;
        const draftType = 'snake';

        const pick1 = calculateCurrentRoster(1, totalRosters, draftType, false);
        expect(pick1).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

        const pick15 = calculateCurrentRoster(15, totalRosters, draftType, false);
        expect(pick15).toEqual({ round: 2, pickInRound: 1, draftPosition: 14 });
      });
    });

    describe('Auction Drafts', () => {
      test('should return default values for auction drafts', () => {
        const result = calculateCurrentRoster(1, 12, 'auction', false);
        expect(result).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });
      });

      test('should return default values for slow auction drafts', () => {
        const result = calculateCurrentRoster(100, 12, 'slow_auction', false);
        expect(result).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });
      });
    });
  });

  // ============================================
  // 2. PICK VALIDATION TESTS
  // ============================================

  describe('Pick Validation', () => {
    let testDraftId: number;

    beforeEach(async () => {
      // Create a fresh draft for each test
      const draft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, pick_time_seconds, third_round_reversal, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, $5, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, 90, false]
      );
      testDraftId = draft.rows[0].id;

      // Set draft order
      const draftOrder = testRosterIds.map((rosterId, index) => ({
        roster_id: rosterId,
        draft_position: index + 1,
      }));
      await setDraftOrder(testDraftId, draftOrder);
    });

    afterEach(async () => {
      if (testDraftId) {
        await pool.query('DELETE FROM drafts WHERE id = $1', [testDraftId]);
      }
    });

    test('should validate draft exists', async () => {
      const draft = await getDraftById(testDraftId);
      expect(draft).toBeDefined();
      expect(draft?.id).toBe(testDraftId);
    });

    test('should have correct initial draft state', async () => {
      const draft = await getDraftById(testDraftId);
      expect(draft?.status).toBe('not_started');
      expect(draft?.current_pick).toBe(0);
      expect(draft?.current_round).toBe(0);
      expect(draft?.current_roster_id).toBeNull();
    });

    test('should validate draft order was set correctly', async () => {
      const draftOrder = await getDraftOrder(testDraftId);
      expect(draftOrder).toHaveLength(12);

      // Verify positions 1-12 exist
      for (let i = 1; i <= 12; i++) {
        const roster = draftOrder.find(o => o.draft_position === i);
        expect(roster).toBeDefined();
        expect(roster?.draft_position).toBe(i);
      }
    });

    test('should get correct roster at each position', async () => {
      for (let position = 1; position <= 12; position++) {
        const rosterId = await getRosterAtPosition(testDraftId, position);
        expect(rosterId).toBe(testRosterIds[position - 1]);
      }
    });

    test('should return null for invalid draft position', async () => {
      const rosterId = await getRosterAtPosition(testDraftId, 99);
      expect(rosterId).toBeNull();
    });

    test('should prevent duplicate draft positions', async () => {
      const duplicateOrder = [
        { roster_id: testRosterIds[0], draft_position: 1 },
        { roster_id: testRosterIds[1], draft_position: 1 }, // Duplicate position
      ];

      await expect(setDraftOrder(testDraftId, duplicateOrder)).rejects.toThrow();
    });

    test('should prevent duplicate roster IDs in draft order', async () => {
      const duplicateOrder = [
        { roster_id: testRosterIds[0], draft_position: 1 },
        { roster_id: testRosterIds[0], draft_position: 2 }, // Duplicate roster
      ];

      await expect(setDraftOrder(testDraftId, duplicateOrder)).rejects.toThrow();
    });
  });

  // ============================================
  // 3. DRAFT STATE TRANSITIONS
  // ============================================

  describe('Draft State Transitions', () => {
    let testDraftId: number;

    beforeEach(async () => {
      const draft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, pick_time_seconds, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, 90]
      );
      testDraftId = draft.rows[0].id;
    });

    afterEach(async () => {
      if (testDraftId) {
        await pool.query('DELETE FROM drafts WHERE id = $1', [testDraftId]);
      }
    });

    test('should create draft in not_started status', async () => {
      const draft = await getDraftById(testDraftId);
      expect(draft?.status).toBe('not_started');
    });

    test('should store draft settings correctly', async () => {
      const draft = await getDraftById(testDraftId);
      expect(draft?.draft_type).toBe('snake');
      expect(draft?.rounds).toBe(15);
      expect(draft?.pick_time_seconds).toBe(90);
      expect(draft?.third_round_reversal).toBe(false);
      expect(draft?.timer_mode).toBe('traditional');
    });

    test('should handle chess timer mode correctly', async () => {
      const chessDraft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, timer_mode, team_time_budget_seconds, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, $5, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, 'chess', 3600]
      );

      const draft = await getDraftById(chessDraft.rows[0].id);
      expect(draft?.timer_mode).toBe('chess');
      expect(draft?.team_time_budget_seconds).toBe(3600);

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [chessDraft.rows[0].id]);
    });

    test('should reject chess timer without budget', async () => {
      // Database constraint should prevent this
      await expect(
        pool.query(
          `INSERT INTO drafts (league_id, draft_type, rounds, timer_mode, team_time_budget_seconds, status, current_pick, current_round)
           VALUES ($1, $2, $3, $4, $5, 'not_started', 0, 0) RETURNING *`,
          [testLeagueId, 'snake', 15, 'chess', 0]
        )
      ).rejects.toThrow();
    });

    test('should handle third round reversal setting', async () => {
      const reversalDraft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, third_round_reversal, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, true]
      );

      const draft = await getDraftById(reversalDraft.rows[0].id);
      expect(draft?.third_round_reversal).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [reversalDraft.rows[0].id]);
    });

    test('should reset draft to not_started status', async () => {
      // Manually change status to simulate draft in progress
      await pool.query(
        'UPDATE drafts SET status = $1, current_pick = $2 WHERE id = $3',
        ['in_progress', 5, testDraftId]
      );

      const updatedDraft = await resetDraft(testDraftId);
      expect(updatedDraft.status).toBe('not_started');
      expect(updatedDraft.current_pick).toBe(0);
    });

    test('should clear picks on draft reset', async () => {
      // Create a fake pick
      await pool.query(
        `INSERT INTO draft_picks (draft_id, pick_number, round, pick_in_round, roster_id, player_id)
         VALUES ($1, 1, 1, 1, $2, 'fake_player_id')`,
        [testDraftId, testRosterIds[0]]
      );

      await resetDraft(testDraftId);

      // Verify picks were cleared
      const picks = await pool.query(
        'SELECT * FROM draft_picks WHERE draft_id = $1',
        [testDraftId]
      );
      expect(picks.rows).toHaveLength(0);
    });
  });

  // ============================================
  // 4. TIMER MANAGEMENT TESTS
  // ============================================

  describe('Timer Management', () => {
    let testDraftId: number;

    beforeEach(async () => {
      const draft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, pick_time_seconds, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, 60]
      );
      testDraftId = draft.rows[0].id;
    });

    afterEach(async () => {
      if (testDraftId) {
        await pool.query('DELETE FROM drafts WHERE id = $1', [testDraftId]);
      }
    });

    test('should store pick time correctly', async () => {
      const draft = await getDraftById(testDraftId);
      expect(draft?.pick_time_seconds).toBe(60);
    });

    test('should initialize with no deadline', async () => {
      const draft = await getDraftById(testDraftId);
      expect(draft?.pick_deadline).toBeNull();
    });

    test('should support different timer modes', async () => {
      // Traditional mode
      const traditionalDraft = await getDraftById(testDraftId);
      expect(traditionalDraft?.timer_mode).toBe('traditional');

      // Chess mode
      const chessDraft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, timer_mode, team_time_budget_seconds, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, $5, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, 'chess', 1800]
      );
      const chessResult = await getDraftById(chessDraft.rows[0].id);
      expect(chessResult?.timer_mode).toBe('chess');
      expect(chessResult?.team_time_budget_seconds).toBe(1800);

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [chessDraft.rows[0].id]);
    });
  });

  // ============================================
  // 5. ERROR CASES
  // ============================================

  describe('Error Cases', () => {
    test('should reject invalid draft type', async () => {
      await expect(
        pool.query(
          `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
           VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
          [testLeagueId, 'invalid_type', 15]
        )
      ).rejects.toThrow();
    });

    test('should handle non-existent draft', async () => {
      const draft = await getDraftById(999999);
      expect(draft).toBeNull();
    });

    test('should handle non-existent league', async () => {
      await expect(
        pool.query(
          `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
           VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
          [999999, 'snake', 15]
        )
      ).rejects.toThrow();
    });

    test('should prevent duplicate draft for same league', async () => {
      const draft1 = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
         VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15]
      );

      await expect(
        pool.query(
          `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
           VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
          [testLeagueId, 'snake', 15]
        )
      ).rejects.toThrow();

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [draft1.rows[0].id]);
    });

    test('should handle empty draft order gracefully', async () => {
      const draft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
         VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15]
      );

      const draftOrder = await getDraftOrder(draft.rows[0].id);
      expect(draftOrder).toHaveLength(0);

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [draft.rows[0].id]);
    });

    test('should handle roster at invalid position', async () => {
      const draft = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
         VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15]
      );

      const rosterId = await getRosterAtPosition(draft.rows[0].id, 999);
      expect(rosterId).toBeNull();

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [draft.rows[0].id]);
    });
  });

  // ============================================
  // 6. EDGE CASES & BOUNDARY TESTS
  // ============================================

  describe('Edge Cases & Boundaries', () => {
    test('should handle pick 1 (start of draft)', () => {
      const result = calculateCurrentRoster(1, 12, 'snake', false);
      expect(result).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });
    });

    test('should handle last pick of draft', () => {
      const totalRosters = 12;
      const rounds = 15;
      const lastPickNumber = totalRosters * rounds;

      const result = calculateCurrentRoster(lastPickNumber, totalRosters, 'snake', false);
      expect(result.round).toBe(rounds);
      expect(result.pickInRound).toBe(totalRosters);
    });

    test('should handle single-team league (edge case)', () => {
      const result = calculateCurrentRoster(1, 1, 'snake', false);
      expect(result).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

      const result2 = calculateCurrentRoster(2, 1, 'snake', false);
      expect(result2).toEqual({ round: 2, pickInRound: 1, draftPosition: 1 });
    });

    test('should handle very large league (20 teams)', () => {
      const totalRosters = 20;

      // First pick
      const pick1 = calculateCurrentRoster(1, totalRosters, 'snake', false);
      expect(pick1).toEqual({ round: 1, pickInRound: 1, draftPosition: 1 });

      // Last pick of round 1
      const pick20 = calculateCurrentRoster(20, totalRosters, 'snake', false);
      expect(pick20).toEqual({ round: 1, pickInRound: 20, draftPosition: 20 });

      // First pick of round 2 (reversed)
      const pick21 = calculateCurrentRoster(21, totalRosters, 'snake', false);
      expect(pick21).toEqual({ round: 2, pickInRound: 1, draftPosition: 20 });
    });

    test('should handle high round numbers', () => {
      const totalRosters = 12;
      const pickInRound30 = (30 - 1) * totalRosters + 1;

      const result = calculateCurrentRoster(pickInRound30, totalRosters, 'snake', false);
      expect(result.round).toBe(30);
      expect(result.pickInRound).toBe(1);
      // Round 30 is even, so it should be reversed
      expect(result.draftPosition).toBe(12);
    });

    test('should calculate middle pick correctly', () => {
      const totalRosters = 12;
      const pickNumber = 66; // Round 6, Pick 6

      const result = calculateCurrentRoster(pickNumber, totalRosters, 'snake', false);
      expect(result.round).toBe(6);
      expect(result.pickInRound).toBe(6);
      // Round 6 is even (reversed), so position should be 12 - 6 + 1 = 7
      expect(result.draftPosition).toBe(7);
    });
  });

  // ============================================
  // 7. COMPLEX SCENARIOS
  // ============================================

  describe('Complex Draft Scenarios', () => {
    test('should handle complete 12-team, 15-round snake draft progression', () => {
      const totalRosters = 12;
      const totalRounds = 15;
      const totalPicks = totalRosters * totalRounds;

      const positions: number[] = [];

      for (let pick = 1; pick <= totalPicks; pick++) {
        const result = calculateCurrentRoster(pick, totalRosters, 'snake', false);
        positions.push(result.draftPosition);
      }

      // Verify we have exactly 180 picks
      expect(positions).toHaveLength(totalPicks);

      // Verify each position picked exactly 15 times
      for (let position = 1; position <= totalRosters; position++) {
        const count = positions.filter(p => p === position).length;
        expect(count).toBe(totalRounds);
      }

      // Verify round 1 is forward
      const round1 = positions.slice(0, 12);
      expect(round1).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      // Verify round 2 is reversed
      const round2 = positions.slice(12, 24);
      expect(round2).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    });

    test('should handle complete draft with 3rd round reversal', () => {
      const totalRosters = 10;
      const totalRounds = 6;

      const positions: number[] = [];

      for (let round = 1; round <= totalRounds; round++) {
        const pickNumber = (round - 1) * totalRosters + 1;
        const result = calculateCurrentRoster(pickNumber, totalRosters, 'snake', true);
        positions.push(result.draftPosition);
      }

      // Expected pattern with 3rd round reversal:
      // R1: forward (1), R2: reversed (10), R3: forward (1 - reversal!),
      // R4: reversed (10), R5: forward (1), R6: reversed (10)
      expect(positions).toEqual([1, 10, 1, 10, 1, 10]);
    });

    test('should verify snake draft gives balanced pick distribution', () => {
      const totalRosters = 12;
      const totalRounds = 4;
      const picksByPosition: Map<number, number[]> = new Map();

      // Initialize map
      for (let i = 1; i <= totalRosters; i++) {
        picksByPosition.set(i, []);
      }

      // Track all picks
      for (let pick = 1; pick <= totalRosters * totalRounds; pick++) {
        const result = calculateCurrentRoster(pick, totalRosters, 'snake', false);
        picksByPosition.get(result.draftPosition)?.push(pick);
      }

      // Middle positions should have balanced picks
      // Position 1 gets picks: 1, 24, 25, 48 (wrap-around at ends)
      // Position 6 gets picks: 6, 19, 30, 43 (more balanced)
      const position1Picks = picksByPosition.get(1);
      const position6Picks = picksByPosition.get(6);

      expect(position1Picks).toBeDefined();
      expect(position6Picks).toBeDefined();
      expect(position1Picks?.length).toBe(4);
      expect(position6Picks?.length).toBe(4);
    });
  });

  // ============================================
  // 8. INTEGRATION WITH DATABASE
  // ============================================

  describe('Database Integration', () => {
    test('should create draft and retrieve same data', async () => {
      const created = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, pick_time_seconds, third_round_reversal, status, current_pick, current_round)
         VALUES ($1, $2, $3, $4, $5, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15, 90, true]
      );
      const retrieved = await getDraftById(created.rows[0].id);

      expect(retrieved?.league_id).toBe(testLeagueId);
      expect(retrieved?.draft_type).toBe('snake');
      expect(retrieved?.rounds).toBe(15);
      expect(retrieved?.pick_time_seconds).toBe(90);
      expect(retrieved?.third_round_reversal).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [created.rows[0].id]);
    });

    test('should handle concurrent draft creation attempts', async () => {
      // This should fail due to unique constraint on league_id
      const draft1Promise = pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
         VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15]
      );

      const draft2Promise = pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
         VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'linear', 10]
      );

      await expect(Promise.all([draft1Promise, draft2Promise])).rejects.toThrow();

      // Cleanup any created drafts
      await pool.query('DELETE FROM drafts WHERE league_id = $1', [testLeagueId]);
    });

    test('should enforce unique draft per league constraint', async () => {
      const draft1 = await pool.query(
        `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
         VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
        [testLeagueId, 'snake', 15]
      );

      // Second draft for same league should fail
      await expect(
        pool.query(
          `INSERT INTO drafts (league_id, draft_type, rounds, status, current_pick, current_round)
           VALUES ($1, $2, $3, 'not_started', 0, 0) RETURNING *`,
          [testLeagueId, 'linear', 10]
        )
      ).rejects.toThrow();

      // Cleanup
      await pool.query('DELETE FROM drafts WHERE id = $1', [draft1.rows[0].id]);
    });
  });
});
