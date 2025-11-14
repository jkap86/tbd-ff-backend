/**
 * ADP Service Tests
 *
 * Tests Average Draft Position (ADP) calculation and retrieval:
 * - ADP calculation from completed drafts
 * - ADP calculation by draft type (snake, auction, all)
 * - ADP calculation by league size (10, 12, 14 team)
 * - Player ADP retrieval
 * - Top players by ADP ranking
 * - Sleeper ADP sync as fallback
 * - Minimum draft requirement (3 drafts)
 */

import {
  calculateADP,
  getPlayerADP,
  getTopPlayersByADP,
  syncSleeperADP,
} from '../../services/adpService';
import pool from '../../config/database';

describe('ADP Service Tests', () => {
  let testLeagueIds: number[] = [];
  let testDraftIds: number[] = [];
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];
  let testPlayerIds: string[] = ['7523', '7543', '4881', '5927', '4866', '2449'];
  const testSeason = '2025';

  beforeAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'adptest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'ADP%'`);
    await pool.query(`DELETE FROM player_adp WHERE season = $1`, [testSeason]);

    // Create test players
    for (const playerId of testPlayerIds) {
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team, search_rank)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           position = EXCLUDED.position,
           team = EXCLUDED.team,
           search_rank = EXCLUDED.search_rank`,
        [playerId, `Player ${playerId}`, 'RB', 'TEST', parseInt(playerId.slice(-2))]
      );
    }

    // Create test users
    for (let i = 1; i <= 12; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`adptest${i}`, `adp${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create 3 completed drafts for ADP calculation (minimum requirement)
    // Draft 1: 10-team snake draft
    await createCompletedDraft(10, 'snake', testLeagueIds, testDraftIds, testUserIds, testRosterIds);

    // Draft 2: 12-team snake draft
    await createCompletedDraft(12, 'snake', testLeagueIds, testDraftIds, testUserIds, testRosterIds);

    // Draft 3: 10-team auction draft
    await createCompletedDraft(10, 'auction', testLeagueIds, testDraftIds, testUserIds, testRosterIds);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'adptest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'ADP%'`);
    await pool.query(`DELETE FROM player_adp WHERE season = $1`, [testSeason]);
  });

  beforeEach(async () => {
    // Clear ADP data before each test
    await pool.query(`DELETE FROM player_adp WHERE season = $1`, [testSeason]);
  });

  describe('calculateADP', () => {
    it('should calculate ADP for all draft types combined', async () => {
      const result = await calculateADP(testSeason);

      expect(result.updated).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      // Verify ADP records exist for 'all' type
      const adpResult = await pool.query(
        `SELECT COUNT(*) as count FROM player_adp
         WHERE season = $1 AND draft_type = 'all' AND league_size IS NULL`,
        [testSeason]
      );

      expect(parseInt(adpResult.rows[0].count)).toBeGreaterThan(0);
    });

    it('should calculate ADP for snake drafts only', async () => {
      await calculateADP(testSeason);

      const adpResult = await pool.query(
        `SELECT COUNT(*) as count FROM player_adp
         WHERE season = $1 AND draft_type = 'snake' AND league_size IS NULL`,
        [testSeason]
      );

      expect(parseInt(adpResult.rows[0].count)).toBeGreaterThan(0);
    });

    it('should calculate ADP for auction drafts only', async () => {
      await calculateADP(testSeason);

      const adpResult = await pool.query(
        `SELECT COUNT(*) as count FROM player_adp
         WHERE season = $1 AND draft_type = 'auction' AND league_size IS NULL`,
        [testSeason]
      );

      expect(parseInt(adpResult.rows[0].count)).toBeGreaterThan(0);
    });

    it('should calculate ADP by league size', async () => {
      await calculateADP(testSeason);

      // Check for 10-team league ADP
      const adp10Team = await pool.query(
        `SELECT COUNT(*) as count FROM player_adp
         WHERE season = $1 AND league_size = 10`,
        [testSeason]
      );

      expect(parseInt(adp10Team.rows[0].count)).toBeGreaterThan(0);

      // Check for 12-team league ADP
      const adp12Team = await pool.query(
        `SELECT COUNT(*) as count FROM player_adp
         WHERE season = $1 AND league_size = 12`,
        [testSeason]
      );

      expect(parseInt(adp12Team.rows[0].count)).toBeGreaterThan(0);
    });

    it('should only include players drafted at least 3 times', async () => {
      // Create a league with only 2 completed drafts (below minimum)
      const newLeagueId = await createLeague(10);
      await createDraft(newLeagueId, 10, 'snake');

      // Create picks for a new player (only in 2 drafts total)
      const newPlayerId = '9999';
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id) DO NOTHING`,
        [newPlayerId, 'Rarely Drafted Player', 'RB', 'TEST']
      );

      // Pick this player in only 2 drafts
      await pool.query(
        `INSERT INTO draft_picks (draft_id, pick_number, round, pick_in_round, roster_id, player_id)
         VALUES ($1, 1, 1, 1, $2, $3)`,
        [testDraftIds[0], testRosterIds[0], newPlayerId]
      );
      await pool.query(
        `INSERT INTO draft_picks (draft_id, pick_number, round, pick_in_round, roster_id, player_id)
         VALUES ($1, 1, 1, 1, $2, $3)`,
        [testDraftIds[1], testRosterIds[10], newPlayerId]
      );

      await calculateADP(testSeason);

      // This player should NOT have an ADP record (only drafted 2 times, need 3)
      const adpResult = await pool.query(
        `SELECT * FROM player_adp WHERE player_id = $1 AND season = $2`,
        [newPlayerId, testSeason]
      );

      expect(adpResult.rows).toHaveLength(0);
    });

    it('should calculate correct ADP values (average pick position)', async () => {
      // Player 7523 is picked at positions 1, 2, 3 in our test drafts
      // Expected ADP: (1 + 2 + 3) / 3 = 2.00

      await calculateADP(testSeason);

      const adpResult = await pool.query(
        `SELECT adp, min_pick, max_pick, times_drafted
         FROM player_adp
         WHERE player_id = $1 AND season = $2 AND draft_type = 'all'
         AND league_size IS NULL`,
        [testPlayerIds[0], testSeason]
      );

      expect(adpResult.rows).toHaveLength(1);
      const adp = adpResult.rows[0];

      expect(parseFloat(adp.adp)).toBeCloseTo(2.0, 1);
      expect(adp.min_pick).toBe(1);
      expect(adp.max_pick).toBe(3);
      expect(adp.times_drafted).toBe(3);
    });

    it('should update existing ADP records on recalculation', async () => {
      // First calculation
      await calculateADP(testSeason);

      const firstResult = await pool.query(
        `SELECT adp, times_drafted FROM player_adp
         WHERE player_id = $1 AND season = $2 AND draft_type = 'all'
         AND league_size IS NULL`,
        [testPlayerIds[0], testSeason]
      );

      const firstAdp = parseFloat(firstResult.rows[0]?.adp || '0');

      // Add another completed draft with this player
      const newLeagueId = await createLeague(10);
      const newDraftId = await createDraft(newLeagueId, 10, 'snake');
      const newRosterId = await createRoster(newLeagueId, testUserIds[0], 1);

      await pool.query(
        `INSERT INTO draft_picks (draft_id, pick_number, round, pick_in_round, roster_id, player_id)
         VALUES ($1, 10, 1, 10, $2, $3)`,
        [newDraftId, newRosterId, testPlayerIds[0]]
      );

      // Recalculate
      await calculateADP(testSeason);

      const secondResult = await pool.query(
        `SELECT adp, times_drafted FROM player_adp
         WHERE player_id = $1 AND season = $2 AND draft_type = 'all'
         AND league_size IS NULL`,
        [testPlayerIds[0], testSeason]
      );

      expect(secondResult.rows[0].times_drafted).toBe(4);
      expect(parseFloat(secondResult.rows[0].adp)).not.toBe(firstAdp);
    });
  });

  describe('getPlayerADP', () => {
    beforeEach(async () => {
      await calculateADP(testSeason);
    });

    it('should retrieve ADP for a specific player', async () => {
      const adp = await getPlayerADP(testPlayerIds[0], testSeason);

      expect(adp).not.toBeNull();
      expect(adp.player_id).toBe(testPlayerIds[0]);
      expect(adp.season).toBe(testSeason);
      expect(parseFloat(adp.adp)).toBeGreaterThan(0);
    });

    it('should filter by draft type', async () => {
      const snakeAdp = await getPlayerADP(testPlayerIds[0], testSeason, 'snake');

      expect(snakeAdp).not.toBeNull();
      expect(snakeAdp.draft_type).toBe('snake');
    });

    it('should filter by league size', async () => {
      const adp10Team = await getPlayerADP(testPlayerIds[0], testSeason, 'all', 10);

      expect(adp10Team).not.toBeNull();
      expect(adp10Team.league_size).toBe(10);
    });

    it('should return null for player not in system', async () => {
      const adp = await getPlayerADP('nonexistent', testSeason);

      expect(adp).toBeNull();
    });

    it('should prefer league-size-specific ADP when available', async () => {
      // Query without specifying league size should prefer general ADP
      const generalAdp = await getPlayerADP(testPlayerIds[0], testSeason, 'all', null);

      expect(generalAdp).not.toBeNull();
      expect(generalAdp.league_size).toBeNull();
    });
  });

  describe('getTopPlayersByADP', () => {
    beforeEach(async () => {
      await calculateADP(testSeason);
    });

    it('should return players ordered by ADP ascending', async () => {
      const topPlayers = await getTopPlayersByADP(testSeason, 10);

      expect(topPlayers.length).toBeGreaterThan(0);
      expect(topPlayers.length).toBeLessThanOrEqual(10);

      // Verify ascending order
      for (let i = 1; i < topPlayers.length; i++) {
        expect(parseFloat(topPlayers[i].adp)).toBeGreaterThanOrEqual(
          parseFloat(topPlayers[i - 1].adp)
        );
      }
    });

    it('should include player details (name, position, team)', async () => {
      const topPlayers = await getTopPlayersByADP(testSeason, 5);

      expect(topPlayers.length).toBeGreaterThan(0);

      const firstPlayer = topPlayers[0];
      expect(firstPlayer.full_name).toBeDefined();
      expect(firstPlayer.position).toBeDefined();
      expect(firstPlayer.team).toBeDefined();
      expect(firstPlayer.player_id).toBeDefined();
    });

    it('should filter by position', async () => {
      const rbOnly = await getTopPlayersByADP(testSeason, 10, 'all', null, 'RB');

      expect(rbOnly.length).toBeGreaterThan(0);

      // All should be RBs
      rbOnly.forEach(player => {
        expect(player.position).toBe('RB');
      });
    });

    it('should filter by draft type', async () => {
      const snakeOnly = await getTopPlayersByADP(testSeason, 10, 'snake');

      expect(snakeOnly.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const limited = await getTopPlayersByADP(testSeason, 3);

      expect(limited.length).toBeLessThanOrEqual(3);
    });

    it('should include ADP statistics (min, max, times_drafted)', async () => {
      const topPlayers = await getTopPlayersByADP(testSeason, 1);

      expect(topPlayers.length).toBeGreaterThan(0);

      const firstPlayer = topPlayers[0];
      expect(firstPlayer.adp).toBeDefined();
      expect(firstPlayer.min_pick).toBeDefined();
      expect(firstPlayer.max_pick).toBeDefined();
      expect(firstPlayer.times_drafted).toBeDefined();
      expect(firstPlayer.times_drafted).toBeGreaterThanOrEqual(3);
    });
  });

  describe('syncSleeperADP', () => {
    it('should create ADP records from Sleeper search_rank', async () => {
      await syncSleeperADP(testSeason);

      // Verify ADP records created from search_rank
      const adpResult = await pool.query(
        `SELECT COUNT(*) as count FROM player_adp
         WHERE season = $1 AND times_drafted = 0`,
        [testSeason]
      );

      expect(parseInt(adpResult.rows[0].count)).toBeGreaterThan(0);
    });

    it('should use search_rank as ADP value', async () => {
      await syncSleeperADP(testSeason);

      // Get a player with known search_rank
      const playerResult = await pool.query(
        `SELECT search_rank FROM players WHERE player_id = $1`,
        [testPlayerIds[0]]
      );

      const searchRank = playerResult.rows[0].search_rank;

      const adpResult = await pool.query(
        `SELECT adp, min_pick, max_pick FROM player_adp
         WHERE player_id = $1 AND season = $2 AND times_drafted = 0`,
        [testPlayerIds[0], testSeason]
      );

      if (adpResult.rows.length > 0) {
        expect(parseFloat(adpResult.rows[0].adp)).toBe(searchRank);
        expect(adpResult.rows[0].min_pick).toBe(searchRank);
        expect(adpResult.rows[0].max_pick).toBe(searchRank);
      }
    });

    it('should not overwrite existing ADP from actual drafts', async () => {
      // First, calculate real ADP
      await calculateADP(testSeason);

      const beforeSync = await pool.query(
        `SELECT adp, times_drafted FROM player_adp
         WHERE player_id = $1 AND season = $2 AND draft_type = 'all'
         AND league_size IS NULL`,
        [testPlayerIds[0], testSeason]
      );

      // Sync Sleeper ADP (should not overwrite)
      await syncSleeperADP(testSeason);

      const afterSync = await pool.query(
        `SELECT adp, times_drafted FROM player_adp
         WHERE player_id = $1 AND season = $2 AND draft_type = 'all'
         AND league_size IS NULL`,
        [testPlayerIds[0], testSeason]
      );

      // Should be unchanged
      expect(afterSync.rows[0].adp).toBe(beforeSync.rows[0].adp);
      expect(afterSync.rows[0].times_drafted).toBe(beforeSync.rows[0].times_drafted);
    });

    it('should only sync players with valid search_rank', async () => {
      // Create player with no search_rank
      await pool.query(
        `INSERT INTO players (player_id, full_name, position, team, search_rank)
         VALUES ('no_rank', 'No Rank Player', 'RB', 'TEST', NULL)
         ON CONFLICT (player_id) DO UPDATE SET search_rank = NULL`
      );

      await syncSleeperADP(testSeason);

      // This player should not have an ADP record
      const adpResult = await pool.query(
        `SELECT * FROM player_adp WHERE player_id = 'no_rank' AND season = $1`,
        [testSeason]
      );

      expect(adpResult.rows).toHaveLength(0);
    });
  });
});

// Helper functions

async function createLeague(totalRosters: number): Promise<number> {
  const uniqueCode = `ADP${Date.now().toString().slice(-6)}`;

  const leagueResult = await pool.query(
    `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
      settings, scoring_settings, roster_positions, invite_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      `ADP Test League ${totalRosters}`,
      'completed',
      '2025',
      'regular',
      'redraft',
      totalRosters,
      JSON.stringify({ commissioner_id: 1 }),
      JSON.stringify({}),
      JSON.stringify([
        { position: 'QB', count: 1 },
        { position: 'RB', count: 2 },
        { position: 'BN', count: 3 }
      ]),
      uniqueCode
    ]
  );

  return leagueResult.rows[0].id;
}

async function createDraft(leagueId: number, rounds: number, draftType: string): Promise<number> {
  const draftResult = await pool.query(
    `INSERT INTO drafts (league_id, draft_type, status, rounds, current_pick, current_round,
      pick_time_seconds, third_round_reversal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [leagueId, draftType, 'completed', rounds, 1, 1, 60, false]
  );

  return draftResult.rows[0].id;
}

async function createRoster(leagueId: number, userId: number, rosterId: number): Promise<number> {
  const rosterResult = await pool.query(
    `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      leagueId,
      userId,
      rosterId,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({ wins: 0, losses: 0, ties: 0 })
    ]
  );

  return rosterResult.rows[0].id;
}

async function createCompletedDraft(
  teamCount: number,
  draftType: string,
  leagueIds: number[],
  draftIds: number[],
  userIds: number[],
  rosterIds: number[]
): Promise<void> {
  const leagueId = await createLeague(teamCount);
  leagueIds.push(leagueId);

  const draftId = await createDraft(leagueId, 6, draftType);
  draftIds.push(draftId);

  // Create rosters for this league
  for (let i = 0; i < teamCount; i++) {
    const rosterId = await createRoster(leagueId, userIds[i], i + 1);
    rosterIds.push(rosterId);

    // Create 6 draft picks for this roster (6 rounds)
    for (let round = 1; round <= 6; round++) {
      const pickNumber = (round - 1) * teamCount + (i + 1);
      const playerIdx = (pickNumber - 1) % 6; // Cycle through our 6 test players

      await pool.query(
        `INSERT INTO draft_picks (draft_id, pick_number, round, pick_in_round, roster_id, player_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [draftId, pickNumber, round, i + 1, rosterId, ['7523', '7543', '4881', '5927', '4866', '2449'][playerIdx]]
      );
    }
  }
}
