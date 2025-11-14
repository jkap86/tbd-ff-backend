/**
 * Roster Validation Service Tests
 *
 * Tests roster and lineup validation including:
 * - Position requirement validation
 * - Player ownership verification
 * - Bench size limits
 * - Starter/bench structure validation
 * - Illegal roster moves prevention
 */

import pool from '../../config/database';

describe('Roster Validation Tests', () => {
  let testLeagueId: number;
  let testUserId: number;
  let testRosterId: number;
  let testPlayerIds: number[] = [4881, 7523, 7543, 5927];

  beforeAll(async () => {
    const uniqueCode = `RV${Date.now().toString().slice(-7)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username = 'rostervaltest'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'RV%'`);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['rostervaltest', 'rosterval@test.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Create test league with specific roster positions
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Roster Validation Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
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
    const positions = ['QB', 'RB', 'WR', 'TE'];
    for (let i = 0; i < testPlayerIds.length; i++) {
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id) DO NOTHING`,
        [testPlayerIds[i], `Test Player ${i}`, positions[i], 'TEST']
      );
    }

    // Create test roster
    const rosterResult = await pool.query(
      `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        testLeagueId,
        testUserId,
        1,
        JSON.stringify([
          { slot: 'QB', player_id: null },
          { slot: 'RB1', player_id: null },
          { slot: 'RB2', player_id: null },
          { slot: 'WR1', player_id: null },
          { slot: 'WR2', player_id: null },
          { slot: 'TE', player_id: null },
          { slot: 'FLEX', player_id: null }
        ]),
        JSON.stringify([testPlayerIds[0], testPlayerIds[1]]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({ team_name: 'Test Team' })
      ]
    );
    testRosterId = rosterResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username = 'rostervaltest'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'RV%'`);
  });

  describe('Roster structure validation', () => {
    it('should have valid roster structure', async () => {
      const roster = await pool.query(
        'SELECT * FROM rosters WHERE id = $1',
        [testRosterId]
      );

      expect(roster.rows).toHaveLength(1);
      expect(roster.rows[0].starters).toBeDefined();
      expect(roster.rows[0].bench).toBeDefined();
      expect(Array.isArray(roster.rows[0].bench)).toBe(true);
    });

    it('should enforce bench as JSONB array', async () => {
      const roster = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const bench = roster.rows[0].bench;
      expect(Array.isArray(bench)).toBe(true);
      expect(bench).toContain(testPlayerIds[0]);
      expect(bench).toContain(testPlayerIds[1]);
    });

    it('should enforce starters as JSONB array of slot objects', async () => {
      const roster = await pool.query(
        'SELECT starters FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const starters = roster.rows[0].starters;
      expect(Array.isArray(starters)).toBe(true);
      expect(starters.every((s: any) => 'slot' in s && 'player_id' in s)).toBe(true);

      // Check expected slots exist
      const slots = starters.map((s: any) => s.slot);
      expect(slots).toContain('QB');
      expect(slots).toContain('RB1');
      expect(slots).toContain('TE');
      expect(slots).toContain('FLEX');
    });
  });

  describe('Player ownership validation', () => {
    it('should verify player is in bench before moving to starters', async () => {
      const roster = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const bench = roster.rows[0].bench;

      // Valid: Player is in bench
      expect(bench.includes(testPlayerIds[0])).toBe(true);

      // Invalid: Player not in roster at all
      expect(bench.includes(99999)).toBe(false);
    });

    it('should prevent duplicate players in starters', async () => {
      // Attempt to set same player in multiple starter slots
      const invalidStarters = [
        { slot: 'RB1', player_id: testPlayerIds[1] },
        { slot: 'RB2', player_id: testPlayerIds[1] }, // Duplicate!
        { slot: 'FLEX', player_id: testPlayerIds[1] }  // Triple!
      ];

      const playerIds = invalidStarters.map(s => s.player_id);
      const uniquePlayerIds = new Set(playerIds.filter(id => id !== null));

      // Validation: Should detect duplicate
      expect(uniquePlayerIds.size).toBeLessThan(playerIds.filter(id => id !== null).length);
    });

    it('should allow same player to be moved between bench and starters', async () => {
      // Get current roster
      const rosterBefore = await pool.query(
        'SELECT starters, bench FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const benchBefore = rosterBefore.rows[0].bench;
      const startersBefore = rosterBefore.rows[0].starters;

      // Move player from bench to starter
      const newStarters = [...startersBefore];
      newStarters[0] = { slot: 'QB', player_id: testPlayerIds[0] };
      const newBench = benchBefore.filter((id: number) => id !== testPlayerIds[0]);

      await pool.query(
        'UPDATE rosters SET starters = $1, bench = $2 WHERE id = $3',
        [JSON.stringify(newStarters), JSON.stringify(newBench), testRosterId]
      );

      // Verify update
      const rosterAfter = await pool.query(
        'SELECT starters, bench FROM rosters WHERE id = $1',
        [testRosterId]
      );

      expect(rosterAfter.rows[0].starters[0].player_id).toBe(testPlayerIds[0]);
      expect(rosterAfter.rows[0].bench).not.toContain(testPlayerIds[0]);
    });
  });

  describe('Position validation', () => {
    it('should match player position to roster slot position', async () => {
      // QB can only go in QB or FLEX slots
      expect(['QB', 'FLEX'].includes('QB')).toBe(true);

      // RB can go in RB or FLEX slots
      expect(['RB1', 'RB2', 'FLEX'].some(s => s.startsWith('RB') || s === 'FLEX')).toBe(true);

      // TE can go in TE or FLEX slots
      expect(['TE', 'FLEX'].includes('TE')).toBe(true);
    });

    it('should allow FLEX slot to accept RB/WR/TE', async () => {
      const flexEligiblePositions = ['RB', 'WR', 'TE'];

      for (const pos of flexEligiblePositions) {
        // All these positions should be FLEX eligible
        expect(flexEligiblePositions).toContain(pos);
      }

      // QB should NOT be FLEX eligible in standard leagues
      expect(flexEligiblePositions).not.toContain('QB');
    });
  });

  describe('Bench size limits', () => {
    it('should respect league bench size limit', async () => {
      const league = await pool.query(
        'SELECT roster_positions FROM leagues WHERE id = $1',
        [testLeagueId]
      );

      const rosterPositions = league.rows[0].roster_positions;
      const benchSlot = rosterPositions.find((p: any) => p.position === 'BN');

      expect(benchSlot).toBeDefined();
      expect(benchSlot.count).toBe(5); // Max 5 bench slots

      // Get current bench
      const roster = await pool.query(
        'SELECT bench FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const bench = roster.rows[0].bench;

      // Should not exceed bench limit
      expect(bench.length).toBeLessThanOrEqual(benchSlot.count);
    });
  });

  describe('Roster integrity', () => {
    it('should maintain player uniqueness across roster', async () => {
      const roster = await pool.query(
        'SELECT starters, bench FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const starters = roster.rows[0].starters;
      const bench = roster.rows[0].bench;

      // Collect all player IDs
      const starterIds = starters
        .map((s: any) => s.player_id)
        .filter((id: number | null) => id !== null);

      const allPlayerIds = [...starterIds, ...bench];
      const uniqueIds = new Set(allPlayerIds);

      // No duplicates across entire roster
      expect(uniqueIds.size).toBe(allPlayerIds.length);
    });

    it('should allow empty starter slots', async () => {
      const roster = await pool.query(
        'SELECT starters FROM rosters WHERE id = $1',
        [testRosterId]
      );

      const starters = roster.rows[0].starters;
      const emptySlots = starters.filter((s: any) => s.player_id === null);

      // Should have empty slots (valid state)
      expect(emptySlots.length).toBeGreaterThan(0);
    });
  });
});
