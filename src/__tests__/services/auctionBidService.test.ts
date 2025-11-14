/**
 * Auction Bid Service Tests
 *
 * Tests budget calculation logic for auction drafts including:
 * - Starting budget tracking
 * - Spent budget calculation
 * - Active bid tracking
 * - Reserved budget for remaining roster slots
 * - Available budget validation
 */

import { calculateAvailableBudget } from '../../services/auctionBidService';
import pool from '../../config/database';

describe('Auction Bid Service Tests', () => {
  let testLeagueId: number;
  let testDraftId: number;
  let testRosterIds: number[] = [];
  let testUserIds: number[] = [];
  let testPlayerIds: string[] = ['1001', '1002', '1003', '1004', '1005'];

  beforeAll(async () => {
    const uniqueCode = `AB${Date.now().toString().slice(-7)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'auctionbidtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'AB%'`);

    // Create test users
    for (let i = 1; i <= 2; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`auctionbidtestuser${i}`, `auctionbid${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Auction Bid Test League',
        'drafting',
        '2025',
        'regular',
        'redraft',
        2,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'WR', count: 2 },
          { position: 'BN', count: 10 }
        ]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test rosters
    for (let i = 0; i < 2; i++) {
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
          JSON.stringify({})
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }

    // Create test draft (auction type)
    const draftResult = await pool.query(
      `INSERT INTO drafts (league_id, status, draft_type, rounds, starting_budget, min_bid, reserve_budget_per_slot)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        testLeagueId,
        'in_progress',
        'auction',
        15,
        200,
        1,
        true
      ]
    );
    testDraftId = draftResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query(`DELETE FROM users WHERE username LIKE 'auctionbidtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'AB%'`);
  });

  beforeEach(async () => {
    // Clear auction data before each test
    await pool.query(`DELETE FROM auction_bids WHERE nomination_id IN
      (SELECT id FROM auction_nominations WHERE draft_id = $1)`, [testDraftId]);
    await pool.query(`DELETE FROM auction_nominations WHERE draft_id = $1`, [testDraftId]);
  });

  describe('calculateAvailableBudget', () => {
    it('should return full budget when no purchases or bids', async () => {
      const draft = {
        starting_budget: 200,
        min_bid: 1,
        rounds: 15,
        reserve_budget_per_slot: true
      };

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      expect(budget).toMatchObject({
        startingBudget: 200,
        spent: 0,
        activeBids: 0,
        reserved: 14, // 14 remaining slots * $1 min bid (15 total - 1 for current)
        available: 186
      });
    });

    it('should calculate spent budget correctly with completed nominations', async () => {
      const draft = {
        starting_budget: 200,
        min_bid: 1,
        rounds: 15,
        reserve_budget_per_slot: false
      };

      // Create completed nominations (roster purchased players)
      await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, winning_roster_id,
          winning_bid, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testDraftId, testPlayerIds[0], testRosterIds[0], testRosterIds[0], 25, 'completed']
      );

      await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, winning_roster_id,
          winning_bid, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testDraftId, testPlayerIds[1], testRosterIds[0], testRosterIds[0], 30, 'completed']
      );

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      expect(budget).toMatchObject({
        startingBudget: 200,
        spent: 55, // 25 + 30
        activeBids: 0,
        reserved: 0,
        available: 145
      });
    });

    it('should track active bids on ongoing nominations', async () => {
      const draft = {
        starting_budget: 200,
        min_bid: 1,
        rounds: 15,
        reserve_budget_per_slot: false
      };

      // Create active nomination
      const nominationResult = await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testDraftId, testPlayerIds[0], testRosterIds[0], 'active']
      );
      const nominationId = nominationResult.rows[0].id;

      // Create winning bid for roster
      await pool.query(
        `INSERT INTO auction_bids (nomination_id, roster_id, bid_amount, max_bid, is_winning)
         VALUES ($1, $2, $3, $4, $5)`,
        [nominationId, testRosterIds[0], 40, 40, true]
      );

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      expect(budget).toMatchObject({
        startingBudget: 200,
        spent: 0,
        activeBids: 40,
        reserved: 0,
        available: 160
      });
    });

    it('should reserve budget for remaining roster slots', async () => {
      const draft = {
        starting_budget: 200,
        min_bid: 2,
        rounds: 15,
        reserve_budget_per_slot: true
      };

      // Roster has purchased 3 players
      for (let i = 0; i < 3; i++) {
        await pool.query(
          `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, winning_roster_id,
            winning_bid, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [testDraftId, testPlayerIds[i], testRosterIds[0], testRosterIds[0], 10 + i * 5, 'completed']
        );
      }

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      // 15 total slots - 3 purchased - 1 for current = 11 remaining
      // 11 * $2 min bid = $22 reserved
      expect(budget).toMatchObject({
        startingBudget: 200,
        spent: 45, // 10 + 15 + 20
        activeBids: 0,
        reserved: 22,
        available: expect.any(Number)
      });

      expect(budget.available).toBe(200 - budget.spent - budget.activeBids - budget.reserved);
    });

    it('should calculate complex budget with spent, active, and reserved', async () => {
      const draft = {
        starting_budget: 300,
        min_bid: 1,
        rounds: 16,
        reserve_budget_per_slot: true
      };

      // Completed purchases (2 players)
      await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, winning_roster_id,
          winning_bid, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testDraftId, testPlayerIds[0], testRosterIds[0], testRosterIds[0], 50, 'completed']
      );

      await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, winning_roster_id,
          winning_bid, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testDraftId, testPlayerIds[1], testRosterIds[0], testRosterIds[0], 60, 'completed']
      );

      // Active bid (1 active nomination)
      const nominationResult = await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testDraftId, testPlayerIds[2], testRosterIds[0], 'active']
      );

      await pool.query(
        `INSERT INTO auction_bids (nomination_id, roster_id, bid_amount, max_bid, is_winning)
         VALUES ($1, $2, $3, $4, $5)`,
        [nominationResult.rows[0].id, testRosterIds[0], 30, 30, true]
      );

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      // 16 total - 2 purchased - 1 active = 13 remaining
      expect(budget).toMatchObject({
        startingBudget: 300,
        spent: 110, // 50 + 60
        activeBids: 30,
        reserved: 13, // 13 slots * $1
        available: 147 // 300 - 110 - 30 - 13
      });
    });

    it('should handle excludeNominationId parameter', async () => {
      const draft = {
        starting_budget: 200,
        min_bid: 1,
        rounds: 15,
        reserve_budget_per_slot: false
      };

      // Create two active nominations
      const nomination1Result = await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testDraftId, testPlayerIds[0], testRosterIds[0], 'active']
      );
      const nominationId1 = nomination1Result.rows[0].id;

      const nomination2Result = await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testDraftId, testPlayerIds[1], testRosterIds[0], 'active']
      );
      const nominationId2 = nomination2Result.rows[0].id;

      // Winning bids on both
      await pool.query(
        `INSERT INTO auction_bids (nomination_id, roster_id, bid_amount, max_bid, is_winning)
         VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)`,
        [nominationId1, testRosterIds[0], 20, 20, true, nominationId2, testRosterIds[0], 30, 30, true]
      );

      // Calculate excluding nomination 1
      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft,
        nominationId1
      );

      // Should only count nomination2's bid of 30
      expect(budget.activeBids).toBe(30);
    });

    it('should handle zero budget remaining gracefully', async () => {
      const draft = {
        starting_budget: 100,
        min_bid: 1,
        rounds: 10,
        reserve_budget_per_slot: true
      };

      // Spend almost all budget
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, winning_roster_id,
            winning_bid, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [testDraftId, testPlayerIds[i], testRosterIds[0], testRosterIds[0], 18, 'completed']
        );
      }

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      expect(budget.spent).toBe(90);
      expect(budget.reserved).toBe(4); // 10 - 5 - 1 = 4 slots remaining
      expect(budget.available).toBe(6); // 100 - 90 - 4
    });

    it('should not count non-winning bids', async () => {
      const draft = {
        starting_budget: 200,
        min_bid: 1,
        rounds: 15,
        reserve_budget_per_slot: false
      };

      // Create active nomination with multiple bids
      const nominationResult = await pool.query(
        `INSERT INTO auction_nominations (draft_id, player_id, nominating_roster_id, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [testDraftId, testPlayerIds[0], testRosterIds[0], 'active']
      );
      const nominationId = nominationResult.rows[0].id;

      // Losing bid from roster 0
      await pool.query(
        `INSERT INTO auction_bids (nomination_id, roster_id, bid_amount, max_bid, is_winning)
         VALUES ($1, $2, $3, $4, $5)`,
        [nominationId, testRosterIds[0], 20, 20, false]
      );

      // Winning bid from roster 1
      await pool.query(
        `INSERT INTO auction_bids (nomination_id, roster_id, bid_amount, max_bid, is_winning)
         VALUES ($1, $2, $3, $4, $5)`,
        [nominationId, testRosterIds[1], 25, 25, true]
      );

      const budget = await calculateAvailableBudget(
        testDraftId,
        testRosterIds[0],
        draft
      );

      // Should not count the losing bid of 20
      expect(budget.activeBids).toBe(0);
      expect(budget.available).toBe(200);
    });
  });
});
