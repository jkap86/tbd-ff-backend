/**
 * Draft Pick Trade Service Tests
 *
 * Tests draft pick trading functionality including:
 * - Pick ownership validation
 * - Multi-year pick trading
 * - Draft pick trade acceptance and updates
 * - Pick trade authorization
 * - Tradeable picks retrieval
 */

import {
  proposeTrade as proposeDraftPickTrade,
  acceptTrade as acceptDraftPickTrade,
  declineTrade as declineDraftPickTrade,
  getTradeablePicksByRoster,
} from '../../services/draftPickTradeService';
import pool from '../../config/database';

describe('Draft Pick Trade Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];

  beforeAll(async () => {
    const uniqueCode = `DPTS${Date.now().toString().slice(-6)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'dpttest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'DPTS%'`);

    // Create test users
    for (let i = 1; i <= 2; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`dpttest${i}`, `dpt${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code, current_season)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        'Draft Pick Trade Test League',
        'in_season',
        '2025',
        'regular',
        'dynasty',
        2,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 }
        ]),
        uniqueCode,
        '2025'
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
          JSON.stringify({ team_name: `Team ${i + 1}` })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'dpttest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'DPTS%'`);
  });

  beforeEach(async () => {
    // Clear draft pick trades before each test
    await pool.query(`DELETE FROM draft_pick_trades WHERE league_id = $1`, [testLeagueId]);
  });

  describe('proposeDraftPickTrade', () => {
    it('should create a valid draft pick trade', async () => {
      const trade = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 1
      });

      expect(trade).toBeDefined();
      expect(trade.status).toBe('pending');
      expect(trade.from_roster_id).toBe(testRosterIds[0]);
      expect(trade.to_roster_id).toBe(testRosterIds[1]);
      expect(trade.season).toBe('2026');
      expect(trade.round).toBe(1);
      expect(trade.original_roster_id).toBe(testRosterIds[0]);
    });

    it('should reject self-trade of picks', async () => {
      await expect(
        proposeDraftPickTrade({
          league_id: testLeagueId,
          from_roster_id: testRosterIds[0],
          to_roster_id: testRosterIds[0],
          season: '2026',
          round: 1
        })
      ).rejects.toThrow('Cannot trade pick to yourself');
    });

    it('should reject invalid round numbers', async () => {
      await expect(
        proposeDraftPickTrade({
          league_id: testLeagueId,
          from_roster_id: testRosterIds[0],
          to_roster_id: testRosterIds[1],
          season: '2026',
          round: 25 // Too high
        })
      ).rejects.toThrow('Draft round must be between 1 and 20');

      await expect(
        proposeDraftPickTrade({
          league_id: testLeagueId,
          from_roster_id: testRosterIds[0],
          to_roster_id: testRosterIds[1],
          season: '2026',
          round: 0 // Too low
        })
      ).rejects.toThrow('Draft round must be between 1 and 20');
    });

    it('should reject trading same pick twice', async () => {
      // First trade succeeds
      const trade1 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 2
      });

      // Accept the first trade
      await acceptDraftPickTrade(trade1.id, testRosterIds[1]);

      // Try to trade the same pick again - should fail
      await expect(
        proposeDraftPickTrade({
          league_id: testLeagueId,
          from_roster_id: testRosterIds[0],
          to_roster_id: testRosterIds[1],
          season: '2026',
          round: 2
        })
      ).rejects.toThrow('This pick has already been traded away');
    });

    it('should allow trading picks from multiple years', async () => {
      const trade2026 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 3
      });

      const trade2027 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2027',
        round: 3
      });

      expect(trade2026.season).toBe('2026');
      expect(trade2027.season).toBe('2027');
      expect(trade2026.round).toBe(3);
      expect(trade2027.round).toBe(3);
    });

    it('should track original owner when picks are re-traded', async () => {
      // Roster 0 trades pick to Roster 1
      const firstTrade = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 4
      });

      await acceptDraftPickTrade(firstTrade.id, testRosterIds[1]);

      // Now Roster 1 trades that pick to Roster 0
      const secondTrade = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[1],
        to_roster_id: testRosterIds[0],
        season: '2026',
        round: 4,
        original_roster_id: testRosterIds[0] // Original owner
      });

      expect(secondTrade.original_roster_id).toBe(testRosterIds[0]);
    });
  });

  describe('acceptDraftPickTrade', () => {
    let pendingTradeId: number;

    beforeEach(async () => {
      const trade = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 5
      });
      pendingTradeId = trade.id;
    });

    it('should mark trade as accepted when receiver accepts', async () => {
      const acceptedTrade = await acceptDraftPickTrade(pendingTradeId, testRosterIds[1]);

      expect(acceptedTrade.status).toBe('accepted');
      expect(acceptedTrade.resolved_at).toBeDefined();
    });

    it('should reject acceptance by non-receiver', async () => {
      await expect(
        acceptDraftPickTrade(pendingTradeId, testRosterIds[0]) // Proposer trying to accept
      ).rejects.toThrow('Only the receiving roster can accept this trade');
    });

    it('should reject acceptance of non-pending trade', async () => {
      await acceptDraftPickTrade(pendingTradeId, testRosterIds[1]);

      // Try to accept again
      await expect(
        acceptDraftPickTrade(pendingTradeId, testRosterIds[1])
      ).rejects.toThrow('cannot accept');
    });

    it('should reject acceptance of non-existent trade', async () => {
      await expect(
        acceptDraftPickTrade(99999, testRosterIds[1])
      ).rejects.toThrow('Trade not found');
    });
  });

  describe('declineDraftPickTrade', () => {
    let pendingTradeId: number;

    beforeEach(async () => {
      const trade = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 6
      });
      pendingTradeId = trade.id;
    });

    it('should mark trade as declined when receiver declines', async () => {
      const declinedTrade = await declineDraftPickTrade(pendingTradeId, testRosterIds[1]);

      expect(declinedTrade.status).toBe('declined');
      expect(declinedTrade.resolved_at).toBeDefined();
    });

    it('should reject decline by non-receiver', async () => {
      await expect(
        declineDraftPickTrade(pendingTradeId, testRosterIds[0]) // Proposer trying to decline
      ).rejects.toThrow('Only the receiving roster can decline this trade');
    });

    it('should reject decline of non-pending trade', async () => {
      await declineDraftPickTrade(pendingTradeId, testRosterIds[1]);

      // Try to decline again
      await expect(
        declineDraftPickTrade(pendingTradeId, testRosterIds[1])
      ).rejects.toThrow('cannot decline');
    });
  });

  describe('getTradeablePicksByRoster', () => {
    it('should return all picks before any trades', async () => {
      const picks = await getTradeablePicksByRoster(testRosterIds[0], testLeagueId, '2026');

      // Should have picks for all rounds
      expect(picks.length).toBeGreaterThan(0);
      expect(picks.every(p => p.tradeable)).toBe(true);
    });

    it('should exclude picks that have been traded away', async () => {
      // Trade away round 1 and 2
      const trade1 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 1
      });

      const trade2 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2026',
        round: 2
      });

      await acceptDraftPickTrade(trade1.id, testRosterIds[1]);
      await acceptDraftPickTrade(trade2.id, testRosterIds[1]);

      const picks = await getTradeablePicksByRoster(testRosterIds[0], testLeagueId, '2026');

      // Should not include rounds 1 or 2
      expect(picks.find(p => p.round === 1)).toBeUndefined();
      expect(picks.find(p => p.round === 2)).toBeUndefined();

      // Should still include round 3+
      expect(picks.find(p => p.round === 3)).toBeDefined();
    });

    it('should handle roster with no remaining picks', async () => {
      // Trade away all picks (rounds 1-18)
      for (let round = 1; round <= 18; round++) {
        const trade = await proposeDraftPickTrade({
          league_id: testLeagueId,
          from_roster_id: testRosterIds[0],
          to_roster_id: testRosterIds[1],
          season: '2028',
          round
        });

        await acceptDraftPickTrade(trade.id, testRosterIds[1]);
      }

      const picks = await getTradeablePicksByRoster(testRosterIds[0], testLeagueId, '2028');

      expect(picks).toHaveLength(0);
    });
  });

  describe('Complex pick trading scenarios', () => {
    it('should handle picks being traded back and forth', async () => {
      // Roster 0 → Roster 1
      const trade1 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2029',
        round: 1
      });
      await acceptDraftPickTrade(trade1.id, testRosterIds[1]);

      // Roster 1 → Roster 0 (same pick)
      const trade2 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[1],
        to_roster_id: testRosterIds[0],
        season: '2029',
        round: 1,
        original_roster_id: testRosterIds[0]
      });
      await acceptDraftPickTrade(trade2.id, testRosterIds[0]);

      // Roster 0 should be able to trade it again
      const trade3 = await proposeDraftPickTrade({
        league_id: testLeagueId,
        from_roster_id: testRosterIds[0],
        to_roster_id: testRosterIds[1],
        season: '2029',
        round: 1
      });

      expect(trade3.status).toBe('pending');
    });
  });
});
