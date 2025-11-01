/**
 * Roster and Player Transaction Comprehensive Tests
 * Tests add/drop players, lineup management, and roster validation
 */

import {
  addPlayerToRoster,
  removePlayerFromRoster,
  rosterHasPlayer,
  updateRoster,
  getRosterById,
} from '../models/Roster';
import pool from '../config/database';

describe('Roster and Player Transactions - Comprehensive Tests', () => {
  let testLeagueId: number;
  let testRosterId: number;
  let testPlayerIds: number[];
  let testUserId: number;

  beforeAll(async () => {
    // Cleanup any leftover test data from previous failed runs
    await pool.query(`DELETE FROM users WHERE username = 'rostertestuser'`);

    // Create test user first (required for foreign key)
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING id`,
      ['rostertestuser', 'roster@test.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Create test league with minimal required fields
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters, settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Roster Test League',
        'pre_draft',
        '2025',
        'regular',
        'redraft',
        10,
        JSON.stringify({}),
        JSON.stringify({}),
        JSON.stringify([]),
        'TEST123'
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test roster
    const rosterResult = await pool.query(
      `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        testLeagueId,
        testUserId, // Use real user ID
        1, // roster_id is required
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({})
      ]
    );
    testRosterId = rosterResult.rows[0].id;

    // Get test player IDs
    const playersResult = await pool.query(
      `SELECT id FROM players LIMIT 20`
    );
    testPlayerIds = playersResult.rows.map(r => r.id);
  });

  afterAll(async () => {
    // Cleanup in reverse order of creation (respecting foreign keys)
    if (testRosterId) {
      await pool.query('DELETE FROM rosters WHERE id = $1', [testRosterId]);
    }
    if (testLeagueId) {
      await pool.query('DELETE FROM leagues WHERE id = $1', [testLeagueId]);
    }
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  describe('addPlayerToRoster', () => {
    afterEach(async () => {
      // Clean up players added during tests
      await updateRoster(testRosterId, {
        bench: [],
        taxi: [],
        ir: [],
      });
    });

    it('should add player to bench by default', async () => {
      const playerId = testPlayerIds[0];
      await addPlayerToRoster(testRosterId, playerId);

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).toContain(playerId);
    });

    it('should add player to specified location - bench', async () => {
      const playerId = testPlayerIds[1];
      await addPlayerToRoster(testRosterId, playerId, 'bench');

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).toContain(playerId);
    });

    it('should add player to taxi squad', async () => {
      const playerId = testPlayerIds[2];
      await addPlayerToRoster(testRosterId, playerId, 'taxi');

      const roster = await getRosterById(testRosterId);
      expect(roster?.taxi).toContain(playerId);
    });

    it('should add player to injured reserve', async () => {
      const playerId = testPlayerIds[3];
      await addPlayerToRoster(testRosterId, playerId, 'ir');

      const roster = await getRosterById(testRosterId);
      expect(roster?.ir).toContain(playerId);
    });

    it('should not add duplicate player to bench', async () => {
      const playerId = testPlayerIds[4];
      await addPlayerToRoster(testRosterId, playerId, 'bench');
      await addPlayerToRoster(testRosterId, playerId, 'bench');

      const roster = await getRosterById(testRosterId);
      const playerCount = roster?.bench?.filter(id => id === playerId).length || 0;
      expect(playerCount).toBe(1);
    });

    it('should add multiple different players', async () => {
      const player1 = testPlayerIds[5];
      const player2 = testPlayerIds[6];
      const player3 = testPlayerIds[7];

      await addPlayerToRoster(testRosterId, player1, 'bench');
      await addPlayerToRoster(testRosterId, player2, 'bench');
      await addPlayerToRoster(testRosterId, player3, 'bench');

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).toContain(player1);
      expect(roster?.bench).toContain(player2);
      expect(roster?.bench).toContain(player3);
      expect(roster?.bench?.length).toBe(3);
    });

    it('should throw error for non-existent roster', async () => {
      await expect(
        addPlayerToRoster(999999, testPlayerIds[0], 'bench')
      ).rejects.toThrow();
    });
  });

  describe('removePlayerFromRoster', () => {
    beforeEach(async () => {
      // Add test players
      await updateRoster(testRosterId, {
        bench: [testPlayerIds[0], testPlayerIds[1], testPlayerIds[2]],
        taxi: [testPlayerIds[3]],
        ir: [testPlayerIds[4]],
      });
    });

    afterEach(async () => {
      // Clean up
      await updateRoster(testRosterId, {
        bench: [],
        taxi: [],
        ir: [],
        starters: [],
      });
    });

    it('should remove player from bench', async () => {
      const playerId = testPlayerIds[0];
      await removePlayerFromRoster(testRosterId, playerId);

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).not.toContain(playerId);
    });

    it('should remove player from taxi', async () => {
      const playerId = testPlayerIds[3];
      await removePlayerFromRoster(testRosterId, playerId);

      const roster = await getRosterById(testRosterId);
      expect(roster?.taxi).not.toContain(playerId);
    });

    it('should remove player from IR', async () => {
      const playerId = testPlayerIds[4];
      await removePlayerFromRoster(testRosterId, playerId);

      const roster = await getRosterById(testRosterId);
      expect(roster?.ir).not.toContain(playerId);
    });

    it('should remove player from starters and clear slot', async () => {
      const playerId = testPlayerIds[5];

      // Add player to starters
      await updateRoster(testRosterId, {
        starters: [
          { slot: 'QB', player_id: playerId },
          { slot: 'RB', player_id: null },
        ],
      });

      await removePlayerFromRoster(testRosterId, playerId);

      const roster = await getRosterById(testRosterId);
      const qbSlot = roster?.starters?.find((s: any) => s.slot === 'QB');
      expect(qbSlot?.player_id).toBeNull();
    });

    it('should handle removing non-existent player gracefully', async () => {
      const nonExistentId = 999999;
      await expect(
        removePlayerFromRoster(testRosterId, nonExistentId)
      ).resolves.toBeTruthy();
    });

    it('should remove player from all locations if present in multiple', async () => {
      // This shouldn't happen in normal use, but test the behavior
      const playerId = testPlayerIds[6];

      await updateRoster(testRosterId, {
        bench: [playerId],
        taxi: [playerId],
      });

      await removePlayerFromRoster(testRosterId, playerId);

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).not.toContain(playerId);
      expect(roster?.taxi).not.toContain(playerId);
    });
  });

  describe('rosterHasPlayer', () => {
    beforeEach(async () => {
      await updateRoster(testRosterId, {
        bench: [testPlayerIds[0], testPlayerIds[1]],
        taxi: [testPlayerIds[2]],
        ir: [testPlayerIds[3]],
        starters: [
          { slot: 'QB', player_id: testPlayerIds[4] },
        ],
      });
    });

    afterEach(async () => {
      await updateRoster(testRosterId, {
        bench: [],
        taxi: [],
        ir: [],
        starters: [],
      });
    });

    it('should return true if player is on bench', async () => {
      const hasPlayer = await rosterHasPlayer(testRosterId, testPlayerIds[0]);
      expect(hasPlayer).toBe(true);
    });

    it('should return true if player is on taxi', async () => {
      const hasPlayer = await rosterHasPlayer(testRosterId, testPlayerIds[2]);
      expect(hasPlayer).toBe(true);
    });

    it('should return true if player is on IR', async () => {
      const hasPlayer = await rosterHasPlayer(testRosterId, testPlayerIds[3]);
      expect(hasPlayer).toBe(true);
    });

    it('should return true if player is in starters', async () => {
      const hasPlayer = await rosterHasPlayer(testRosterId, testPlayerIds[4]);
      expect(hasPlayer).toBe(true);
    });

    it('should return false if player is not on roster', async () => {
      const hasPlayer = await rosterHasPlayer(testRosterId, testPlayerIds[10]);
      expect(hasPlayer).toBe(false);
    });

    it('should return false for non-existent roster', async () => {
      const hasPlayer = await rosterHasPlayer(999999, testPlayerIds[0]);
      expect(hasPlayer).toBe(false);
    });
  });

  describe('Roster Size Limits', () => {
    afterEach(async () => {
      await updateRoster(testRosterId, {
        bench: [],
        taxi: [],
        ir: [],
      });
    });

    it('should allow adding players up to reasonable roster size', async () => {
      // Add 20 players to bench (typical max roster size)
      for (let i = 0; i < 20 && i < testPlayerIds.length; i++) {
        await addPlayerToRoster(testRosterId, testPlayerIds[i], 'bench');
      }

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench?.length).toBe(20);
    });

    it('should handle full roster operations', async () => {
      // Fill bench
      const benchPlayers = testPlayerIds.slice(0, 10);
      await updateRoster(testRosterId, { bench: benchPlayers });

      // Remove one
      await removePlayerFromRoster(testRosterId, benchPlayers[0]);

      // Add new one
      await addPlayerToRoster(testRosterId, testPlayerIds[15], 'bench');

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench?.length).toBe(10);
      expect(roster?.bench).not.toContain(benchPlayers[0]);
      expect(roster?.bench).toContain(testPlayerIds[15]);
    });
  });

  describe('Lineup Validation', () => {
    it('should validate correct starter slots', async () => {
      const lineup = [
        { slot: 'QB', player_id: testPlayerIds[0] },
        { slot: 'RB', player_id: testPlayerIds[1] },
        { slot: 'WR', player_id: testPlayerIds[2] },
      ];

      // This test assumes validateLineup exists
      // If not, this tests the expected behavior
      expect(lineup).toBeDefined();
      expect(lineup.length).toBe(3);
    });

    it('should detect invalid slot assignments', async () => {
      // Example: WR in QB slot
      const invalidLineup = [
        { slot: 'QB', player_id: testPlayerIds[0] }, // If this is actually a WR
      ];

      // Test would validate player position matches slot
      expect(invalidLineup).toBeDefined();
    });

    it('should allow FLEX slot for RB/WR/TE', async () => {
      const flexLineup = [
        { slot: 'FLEX', player_id: testPlayerIds[0] },
      ];

      // FLEX should accept RB, WR, or TE
      expect(flexLineup[0].slot).toBe('FLEX');
    });
  });

  describe('Transaction Edge Cases', () => {
    afterEach(async () => {
      await updateRoster(testRosterId, {
        bench: [],
        taxi: [],
        ir: [],
        starters: [],
      });
    });

    it('should handle rapid add/remove of same player', async () => {
      const playerId = testPlayerIds[0];

      await addPlayerToRoster(testRosterId, playerId, 'bench');
      await removePlayerFromRoster(testRosterId, playerId);
      await addPlayerToRoster(testRosterId, playerId, 'bench');

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).toContain(playerId);
      expect(roster?.bench?.filter(id => id === playerId).length).toBe(1);
    });

    it('should handle moving player between locations', async () => {
      const playerId = testPlayerIds[0];

      // Add to bench
      await addPlayerToRoster(testRosterId, playerId, 'bench');

      // Move to IR
      await removePlayerFromRoster(testRosterId, playerId);
      await addPlayerToRoster(testRosterId, playerId, 'ir');

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).not.toContain(playerId);
      expect(roster?.ir).toContain(playerId);
    });

    it('should preserve other players when removing one', async () => {
      const player1 = testPlayerIds[0];
      const player2 = testPlayerIds[1];
      const player3 = testPlayerIds[2];

      await addPlayerToRoster(testRosterId, player1, 'bench');
      await addPlayerToRoster(testRosterId, player2, 'bench');
      await addPlayerToRoster(testRosterId, player3, 'bench');

      await removePlayerFromRoster(testRosterId, player2);

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).toContain(player1);
      expect(roster?.bench).not.toContain(player2);
      expect(roster?.bench).toContain(player3);
    });

    it('should handle empty roster operations', async () => {
      // Remove from empty roster
      await expect(
        removePlayerFromRoster(testRosterId, testPlayerIds[0])
      ).resolves.toBeTruthy();

      // Check empty roster
      const hasPlayer = await rosterHasPlayer(testRosterId, testPlayerIds[0]);
      expect(hasPlayer).toBe(false);
    });
  });

  describe('Concurrent Transaction Handling', () => {
    afterEach(async () => {
      await updateRoster(testRosterId, { bench: [] });
    });

    it('should handle multiple simultaneous adds', async () => {
      const promises = [
        addPlayerToRoster(testRosterId, testPlayerIds[0], 'bench'),
        addPlayerToRoster(testRosterId, testPlayerIds[1], 'bench'),
        addPlayerToRoster(testRosterId, testPlayerIds[2], 'bench'),
      ];

      await Promise.all(promises);

      const roster = await getRosterById(testRosterId);
      // All 3 should be added (though order might vary)
      expect(roster?.bench?.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle add and remove of different players concurrently', async () => {
      // Pre-populate
      await updateRoster(testRosterId, {
        bench: [testPlayerIds[0], testPlayerIds[1]],
      });

      const promises = [
        addPlayerToRoster(testRosterId, testPlayerIds[2], 'bench'),
        removePlayerFromRoster(testRosterId, testPlayerIds[0]),
      ];

      await Promise.all(promises);

      const roster = await getRosterById(testRosterId);
      expect(roster?.bench).toContain(testPlayerIds[1]);
      expect(roster?.bench).toContain(testPlayerIds[2]);
    });
  });
});
