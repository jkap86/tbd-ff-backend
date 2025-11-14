/**
 * Bestball Service Tests
 *
 * Tests automatic optimal lineup selection for bestball leagues:
 * - Position eligibility (FLEX, SUPER_FLEX, WRT, etc.)
 * - Player stats retrieval
 * - Lineup optimization algorithm
 * - Score calculation
 *
 * Bestball format: System automatically selects highest-scoring players
 * for each position slot each week (no manual lineup management).
 */

import {
  isPlayerEligibleForPosition,
  getPlayerStats,
  getRosterPlayersWithStats,
  optimizeLineup,
  calculateOptimizedScore,
} from '../../services/bestballService';
import pool from '../../config/database';

describe('Bestball Service Tests', () => {
  let testLeagueId: number;
  let testUserId: number;
  let testRosterId: number;

  beforeAll(async () => {
    const uniqueCode = `BB${Date.now().toString().slice(-6)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'bestballtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'BB%'`);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['bestballtest1', 'bestball@test.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Create bestball league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Bestball Test League',
        'active',
        '2025',
        'regular',
        'bestball',
        2,
        JSON.stringify({ commissioner_id: testUserId }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
          { position: 'WR', count: 2 },
          { position: 'TE', count: 1 },
          { position: 'FLEX', count: 1 },
          { position: 'BN', count: 5 }
        ]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test players
    const playerData = [
      { player_id: '7523', name: 'QB Test', position: 'QB' },
      { player_id: '7543', name: 'RB1 Test', position: 'RB' },
      { player_id: '4881', name: 'RB2 Test', position: 'RB' },
      { player_id: '5927', name: 'WR1 Test', position: 'WR' },
      { player_id: '6794', name: 'WR2 Test', position: 'WR' },
      { player_id: '8001', name: 'TE Test', position: 'TE' },
      { player_id: '8002', name: 'RB3 Test', position: 'RB' },
    ];

    for (const player of playerData) {
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id) DO NOTHING`,
        [player.player_id, player.name, player.position, 'TEST']
      );
    }

    // Create test roster with players
    const rosterResult = await pool.query(
      `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings, players)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        testLeagueId,
        testUserId,
        1,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({}),
        JSON.stringify(['7523', '7543', '4881', '5927', '6794', '8001', '8002'])
      ]
    );
    testRosterId = rosterResult.rows[0].id;

    // Insert player stats for week 1
    await pool.query(
      `INSERT INTO player_stats (player_id, week, season, season_type, fantasy_points_ppr)
       VALUES
         ('7523', 1, '2025', 'regular', 25.5),
         ('7543', 1, '2025', 'regular', 18.2),
         ('4881', 1, '2025', 'regular', 15.0),
         ('5927', 1, '2025', 'regular', 22.3),
         ('6794', 1, '2025', 'regular', 12.5),
         ('8001', 1, '2025', 'regular', 8.7),
         ('8002', 1, '2025', 'regular', 20.1)
       ON CONFLICT (player_id, week, season, season_type) DO NOTHING`
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'bestballtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'BB%'`);
  });

  describe('isPlayerEligibleForPosition', () => {
    it('should allow exact position matches', () => {
      expect(isPlayerEligibleForPosition('QB', 'QB')).toBe(true);
      expect(isPlayerEligibleForPosition('RB', 'RB')).toBe(true);
      expect(isPlayerEligibleForPosition('WR', 'WR')).toBe(true);
      expect(isPlayerEligibleForPosition('TE', 'TE')).toBe(true);
    });

    it('should reject non-matching positions', () => {
      expect(isPlayerEligibleForPosition('QB', 'RB')).toBe(false);
      expect(isPlayerEligibleForPosition('RB', 'WR')).toBe(false);
      expect(isPlayerEligibleForPosition('TE', 'QB')).toBe(false);
    });

    it('should handle FLEX eligibility', () => {
      expect(isPlayerEligibleForPosition('RB', 'FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('WR', 'FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('TE', 'FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('QB', 'FLEX')).toBe(false);
    });

    it('should handle SUPER_FLEX eligibility', () => {
      expect(isPlayerEligibleForPosition('QB', 'SUPER_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('RB', 'SUPER_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('WR', 'SUPER_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('TE', 'SUPER_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('K', 'SUPER_FLEX')).toBe(false);
    });

    it('should handle WRT (WR/RB/TE) eligibility', () => {
      expect(isPlayerEligibleForPosition('WR', 'WRT')).toBe(true);
      expect(isPlayerEligibleForPosition('RB', 'WRT')).toBe(true);
      expect(isPlayerEligibleForPosition('TE', 'WRT')).toBe(true);
      expect(isPlayerEligibleForPosition('QB', 'WRT')).toBe(false);
    });

    it('should handle REC_FLEX (WR/TE) eligibility', () => {
      expect(isPlayerEligibleForPosition('WR', 'REC_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('TE', 'REC_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('RB', 'REC_FLEX')).toBe(false);
      expect(isPlayerEligibleForPosition('QB', 'REC_FLEX')).toBe(false);
    });

    it('should handle IDP_FLEX eligibility', () => {
      expect(isPlayerEligibleForPosition('DL', 'IDP_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('LB', 'IDP_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('DB', 'IDP_FLEX')).toBe(true);
      expect(isPlayerEligibleForPosition('QB', 'IDP_FLEX')).toBe(false);
    });
  });

  describe('getPlayerStats', () => {
    it('should return player stats for a specific week', async () => {
      const stats = await getPlayerStats('7523', 1, '2025', 'regular');
      expect(stats).toBe(25.5);
    });

    it('should return 0 when no stats available', async () => {
      const stats = await getPlayerStats('9999', 1, '2025', 'regular');
      expect(stats).toBe(0);
    });

    it('should return 0 for wrong week', async () => {
      const stats = await getPlayerStats('7523', 99, '2025', 'regular');
      expect(stats).toBe(0);
    });

    it('should differentiate between season types', async () => {
      const regularStats = await getPlayerStats('7523', 1, '2025', 'regular');
      const postStats = await getPlayerStats('7523', 1, '2025', 'post');

      expect(regularStats).toBe(25.5);
      expect(postStats).toBe(0); // No postseason stats
    });
  });

  describe('getRosterPlayersWithStats', () => {
    it('should return all roster players with their stats', async () => {
      const players = await getRosterPlayersWithStats(testRosterId, 1, '2025', 'regular');

      expect(players.length).toBeGreaterThan(0);
      expect(players[0]).toHaveProperty('player_id');
      expect(players[0]).toHaveProperty('position');
      expect(players[0]).toHaveProperty('fantasy_points');
    });

    it('should order players by fantasy points descending', async () => {
      const players = await getRosterPlayersWithStats(testRosterId, 1, '2025', 'regular');

      // QB (25.5) should be first
      expect(players[0].player_id).toBe('7523');
      expect(players[0].fantasy_points).toBe(25.5);

      // Verify descending order
      for (let i = 0; i < players.length - 1; i++) {
        const current = players[i].fantasy_points || 0;
        const next = players[i + 1].fantasy_points || 0;
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('should return empty array for non-existent roster', async () => {
      const players = await getRosterPlayersWithStats(999999, 1, '2025', 'regular');
      expect(players).toEqual([]);
    });
  });

  describe('optimizeLineup', () => {
    const rosterPositions = [
      { position: 'QB', count: 1 },
      { position: 'RB', count: 2 },
      { position: 'WR', count: 2 },
      { position: 'TE', count: 1 },
      { position: 'FLEX', count: 1 },
      { position: 'BN', count: 5 }
    ];

    it('should optimize lineup with highest-scoring players', async () => {
      const lineup = await optimizeLineup(testRosterId, rosterPositions, 1, '2025', 'regular');

      // Should have 7 starters (QB, 2 RB, 2 WR, TE, FLEX) - BN doesn't count
      const starterSlots = lineup.filter(slot => slot.slot !== 'BN');
      expect(starterSlots).toHaveLength(7);

      // All starter slots should be filled
      starterSlots.forEach(slot => {
        expect(slot.player_id).not.toBeNull();
      });
    });

    it('should fill exact positions first before FLEX', async () => {
      const lineup = await optimizeLineup(testRosterId, rosterPositions, 1, '2025', 'regular');

      // QB slot should have the QB
      const qbSlot = lineup.find(slot => slot.slot === 'QB');
      expect(qbSlot).toBeDefined();
      expect(qbSlot?.player_id).not.toBeNull();

      // TE slot should have the TE
      const teSlot = lineup.find(slot => slot.slot === 'TE');
      expect(teSlot).toBeDefined();
      expect(teSlot?.player_id).not.toBeNull();
    });

    it('should use FLEX for highest-scoring remaining eligible player', async () => {
      const lineup = await optimizeLineup(testRosterId, rosterPositions, 1, '2025', 'regular');

      const flexSlot = lineup.find(slot => slot.slot === 'FLEX');
      expect(flexSlot).toBeDefined();
      expect(flexSlot?.player_id).not.toBeNull();

      // FLEX should get RB3 (20.1 points) since QB/RB1/RB2/WR1/WR2/TE took other spots
    });

    it('should skip bench positions in optimization', async () => {
      const lineup = await optimizeLineup(testRosterId, rosterPositions, 1, '2025', 'regular');

      // BN should not appear in optimized lineup
      const bnSlots = lineup.filter(slot => slot.slot === 'BN');
      expect(bnSlots).toHaveLength(0);
    });

    it('should handle empty slots when not enough players', async () => {
      // Create roster positions requiring more players than available
      const manyPositions = [
        { position: 'QB', count: 2 }, // Only have 1 QB
        { position: 'RB', count: 3 },
        { position: 'WR', count: 3 }
      ];

      const lineup = await optimizeLineup(testRosterId, manyPositions, 1, '2025', 'regular');

      // Should have some null slots
      const nullSlots = lineup.filter(slot => slot.player_id === null);
      expect(nullSlots.length).toBeGreaterThan(0);
    });

    it('should not assign same player to multiple slots', async () => {
      const lineup = await optimizeLineup(testRosterId, rosterPositions, 1, '2025', 'regular');

      const playerIds = lineup
        .filter(slot => slot.player_id !== null)
        .map(slot => slot.player_id);

      const uniquePlayerIds = new Set(playerIds);
      expect(playerIds.length).toBe(uniquePlayerIds.size);
    });
  });

  describe('calculateOptimizedScore', () => {
    const rosterPositions = [
      { position: 'QB', count: 1 },
      { position: 'RB', count: 2 },
      { position: 'WR', count: 2 },
      { position: 'TE', count: 1 },
      { position: 'FLEX', count: 1 },
      { position: 'BN', count: 5 }
    ];

    it('should calculate total score from optimized lineup', async () => {
      const score = await calculateOptimizedScore(testRosterId, rosterPositions, 1, '2025', 'regular');

      // Expected: QB(25.5) + RB1(18.2) + RB2(15.0) + WR1(22.3) + WR2(12.5) + TE(8.7) + FLEX_RB3(20.1)
      // Total = 122.3
      expect(score).toBeCloseTo(122.3, 1);
    });

    it('should return 0 for week with no stats', async () => {
      const score = await calculateOptimizedScore(testRosterId, rosterPositions, 99, '2025', 'regular');
      expect(score).toBe(0);
    });

    it('should handle roster with fewer players than positions', async () => {
      // Create minimal roster
      const minimalRoster = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings, players)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          testLeagueId,
          testUserId,
          2,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({}),
          JSON.stringify(['7523']) // Only QB
        ]
      );

      const score = await calculateOptimizedScore(minimalRoster.rows[0].id, rosterPositions, 1, '2025', 'regular');

      // Should only count QB score
      expect(score).toBe(25.5);
    });
  });

  describe('edge cases', () => {
    it('should handle roster with no players', async () => {
      const emptyRoster = await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings, players)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          testLeagueId,
          testUserId,
          3,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({}),
          JSON.stringify([])
        ]
      );

      const lineup = await optimizeLineup(
        emptyRoster.rows[0].id,
        [{ position: 'QB', count: 1 }],
        1,
        '2025',
        'regular'
      );

      expect(lineup[0].player_id).toBeNull();
    });

    it('should handle all players with 0 points', async () => {
      // Insert week 2 stats with all zeros
      await pool.query(
        `INSERT INTO player_stats (player_id, week, season, season_type, fantasy_points_ppr)
         VALUES
           ('7523', 2, '2025', 'regular', 0),
           ('7543', 2, '2025', 'regular', 0)
         ON CONFLICT (player_id, week, season, season_type) DO NOTHING`
      );

      const score = await calculateOptimizedScore(
        testRosterId,
        [{ position: 'QB', count: 1 }, { position: 'RB', count: 1 }],
        2,
        '2025',
        'regular'
      );

      expect(score).toBe(0);
    });
  });
});
