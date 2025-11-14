/**
 * Trade Service Tests
 *
 * Tests trade proposal, acceptance, rejection, and atomic processing including:
 * - Trade proposal validation (ownership, same league)
 * - Authorization (receiver accepts/rejects, proposer cancels)
 * - Atomic player movement between rosters
 * - Transaction record creation
 * - Edge cases (self-trade prevention, invalid players)
 */

import {
  proposeTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade,
} from '../../services/tradeService';
import { getTradeItems } from '../../models/Trade';
import pool from '../../config/database';

describe('Trade Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];
  let testPlayerIds: number[] = [7523, 7543, 4881, 5927, 6794];

  beforeAll(async () => {
    const uniqueCode = `TS${Date.now().toString().slice(-7)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'tradetest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'TS%'`);

    // Create test users
    for (let i = 1; i <= 3; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`tradetest${i}`, `trade${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Trade Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        3,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'WR', count: 2 },
          { position: 'BN', count: 5 }
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

    // Create test rosters with players
    for (let i = 0; i < 3; i++) {
      const rosterResult = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          testLeagueId,
          testUserIds[i],
          i + 1,
          JSON.stringify([
            { slot: 'QB', player_id: null },
            { slot: 'RB1', player_id: null },
            { slot: 'RB2', player_id: null }
          ]),
          JSON.stringify(i === 0 ? [testPlayerIds[0], testPlayerIds[1]] : i === 1 ? [testPlayerIds[2], testPlayerIds[3]] : [testPlayerIds[4]]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({})
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'tradetest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'TS%'`);
  });

  beforeEach(async () => {
    // Clear trades before each test
    await pool.query(`DELETE FROM trades WHERE league_id = $1`, [testLeagueId]);
  });

  describe('proposeTrade', () => {
    it('should create a valid trade with players', async () => {
      const trade = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[0],
        receiver_roster_id: testRosterIds[1],
        players_giving: [testPlayerIds[0]], // Proposer gives player 0
        players_receiving: [testPlayerIds[2]], // Proposer receives player 2
        message: 'Fair trade?'
      });

      expect(trade).toBeDefined();
      expect(trade.status).toBe('pending');
      expect(trade.proposer_roster_id).toBe(testRosterIds[0]);
      expect(trade.receiver_roster_id).toBe(testRosterIds[1]);
      expect(trade.proposer_message).toBe('Fair trade?');

      // Verify trade items were created
      const items = await getTradeItems(trade.id);
      expect(items).toHaveLength(2);

      const givingItem = items.find(i => i.from_roster_id === testRosterIds[0]);
      const receivingItem = items.find(i => i.to_roster_id === testRosterIds[0]);

      expect(givingItem?.player_id).toBe(testPlayerIds[0]);
      expect(receivingItem?.player_id).toBe(testPlayerIds[2]);
    });

    it('should reject trade with invalid roster', async () => {
      await expect(
        proposeTrade({
          league_id: testLeagueId,
          proposer_roster_id: 99999,
          receiver_roster_id: testRosterIds[1],
          players_giving: [],
          players_receiving: []
        })
      ).rejects.toThrow('Invalid roster');
    });

    it('should reject self-trade', async () => {
      await expect(
        proposeTrade({
          league_id: testLeagueId,
          proposer_roster_id: testRosterIds[0],
          receiver_roster_id: testRosterIds[0],
          players_giving: [testPlayerIds[0]],
          players_receiving: [testPlayerIds[1]]
        })
      ).rejects.toThrow('Cannot trade with yourself');
    });

    it('should reject trade with player proposer does not own', async () => {
      await expect(
        proposeTrade({
          league_id: testLeagueId,
          proposer_roster_id: testRosterIds[0],
          receiver_roster_id: testRosterIds[1],
          players_giving: [testPlayerIds[2]], // Owned by roster 1
          players_receiving: []
        })
      ).rejects.toThrow('Proposer does not own player');
    });

    it('should reject trade with player receiver does not own', async () => {
      await expect(
        proposeTrade({
          league_id: testLeagueId,
          proposer_roster_id: testRosterIds[0],
          receiver_roster_id: testRosterIds[1],
          players_giving: [],
          players_receiving: [testPlayerIds[0]] // Owned by proposer
        })
      ).rejects.toThrow('Receiver does not own player');
    });

    it('should handle multi-player trades', async () => {
      const trade = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[0],
        receiver_roster_id: testRosterIds[1],
        players_giving: [testPlayerIds[0], testPlayerIds[1]],
        players_receiving: [testPlayerIds[2], testPlayerIds[3]]
      });

      const items = await getTradeItems(trade.id);
      expect(items).toHaveLength(4);
    });
  });

  describe('acceptTrade', () => {
    let pendingTradeId: number;

    beforeEach(async () => {
      const trade = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[0],
        receiver_roster_id: testRosterIds[1],
        players_giving: [testPlayerIds[0]],
        players_receiving: [testPlayerIds[2]]
      });
      pendingTradeId = trade.id;
    });

    it('should process trade when receiver accepts', async () => {
      const acceptedTrade = await acceptTrade(pendingTradeId, testRosterIds[1]);

      expect(acceptedTrade.status).toBe('accepted');
      expect(acceptedTrade.processed_at).toBeDefined();

      // Verify players moved
      const roster0 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );
      const roster1 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[1]]
      );

      const bench0 = roster0.rows[0].bench;
      const bench1 = roster1.rows[0].bench;

      // Proposer should have player 2, not player 0
      expect(bench0).toContain(testPlayerIds[2]);
      expect(bench0).not.toContain(testPlayerIds[0]);

      // Receiver should have player 0, not player 2
      expect(bench1).toContain(testPlayerIds[0]);
      expect(bench1).not.toContain(testPlayerIds[2]);

      // Verify transaction records created
      const transactions = await pool.query(
        'SELECT * FROM transactions WHERE league_id = $1 AND transaction_type = $2',
        [testLeagueId, 'trade']
      );
      expect(transactions.rows).toHaveLength(2);
    });

    it('should reject acceptance by non-receiver', async () => {
      await expect(
        acceptTrade(pendingTradeId, testRosterIds[0]) // Proposer trying to accept
      ).rejects.toThrow('Only the receiver can accept this trade');
    });

    it('should reject acceptance of non-pending trade', async () => {
      await acceptTrade(pendingTradeId, testRosterIds[1]);

      // Try to accept again
      await expect(
        acceptTrade(pendingTradeId, testRosterIds[1])
      ).rejects.toThrow('Trade is not pending');
    });
  });

  describe('rejectTrade', () => {
    let pendingTradeId: number;

    beforeEach(async () => {
      const trade = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[0],
        receiver_roster_id: testRosterIds[1],
        players_giving: [testPlayerIds[0]],
        players_receiving: [testPlayerIds[2]]
      });
      pendingTradeId = trade.id;
    });

    it('should reject trade when receiver declines', async () => {
      const rejectedTrade = await rejectTrade(
        pendingTradeId,
        testRosterIds[1],
        'Not interested'
      );

      expect(rejectedTrade.status).toBe('rejected');
      expect(rejectedTrade.rejection_reason).toBe('Not interested');
      expect(rejectedTrade.responded_at).toBeDefined();

      // Verify players did not move
      const roster0 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );
      expect(roster0.rows[0].bench).toContain(testPlayerIds[0]);
    });

    it('should reject rejection by non-receiver', async () => {
      await expect(
        rejectTrade(pendingTradeId, testRosterIds[0]) // Proposer trying to reject
      ).rejects.toThrow('Only the receiver can reject this trade');
    });
  });

  describe('cancelTrade', () => {
    let pendingTradeId: number;

    beforeEach(async () => {
      const trade = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[0],
        receiver_roster_id: testRosterIds[1],
        players_giving: [testPlayerIds[0]],
        players_receiving: [testPlayerIds[2]]
      });
      pendingTradeId = trade.id;
    });

    it('should cancel trade when proposer requests', async () => {
      const cancelledTrade = await cancelTrade(pendingTradeId, testRosterIds[0]);

      expect(cancelledTrade.status).toBe('cancelled');

      // Verify players did not move
      const roster0 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );
      expect(roster0.rows[0].bench).toContain(testPlayerIds[0]);
    });

    it('should reject cancellation by non-proposer', async () => {
      await expect(
        cancelTrade(pendingTradeId, testRosterIds[1]) // Receiver trying to cancel
      ).rejects.toThrow('Only the proposer can cancel this trade');
    });

    it('should reject cancellation of non-pending trade', async () => {
      await acceptTrade(pendingTradeId, testRosterIds[1]);

      // Try to cancel after accepted
      await expect(
        cancelTrade(pendingTradeId, testRosterIds[0])
      ).rejects.toThrow('Trade is not pending');
    });
  });

  describe('Atomic trade processing', () => {
    it('should handle concurrent trade attempts correctly', async () => {
      // Create two separate trades
      const trade1 = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[0],
        receiver_roster_id: testRosterIds[1],
        players_giving: [testPlayerIds[0]],
        players_receiving: [testPlayerIds[2]]
      });

      const trade2 = await proposeTrade({
        league_id: testLeagueId,
        proposer_roster_id: testRosterIds[1],
        receiver_roster_id: testRosterIds[0],
        players_giving: [testPlayerIds[3]],
        players_receiving: [testPlayerIds[1]]
      });

      // Accept both trades
      await acceptTrade(trade1.id, testRosterIds[1]);
      await acceptTrade(trade2.id, testRosterIds[0]);

      // Verify final roster states
      const roster0 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[0]]
      );
      const roster1 = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterIds[1]]
      );

      // Roster 0: Lost players 0 and 1, gained players 2 and 3
      expect(roster0.rows[0].bench).toContain(testPlayerIds[2]);
      expect(roster0.rows[0].bench).toContain(testPlayerIds[3]);
      expect(roster0.rows[0].bench).not.toContain(testPlayerIds[0]);
      expect(roster0.rows[0].bench).not.toContain(testPlayerIds[1]);

      // Roster 1: Lost players 2 and 3, gained players 0 and 1
      expect(roster1.rows[0].bench).toContain(testPlayerIds[0]);
      expect(roster1.rows[0].bench).toContain(testPlayerIds[1]);
      expect(roster1.rows[0].bench).not.toContain(testPlayerIds[2]);
      expect(roster1.rows[0].bench).not.toContain(testPlayerIds[3]);
    });
  });
});
