/**
 * Keeper Service Tests
 *
 * Tests keeper league functionality where teams can retain players across seasons:
 * - Keeper selection with eligibility checks
 * - Draft round penalty (keeping costs draft pick)
 * - Maximum keeper limits (e.g., max 3 keepers)
 * - Keeper removal (before finalization)
 * - Finalization locking
 * - Rule validation
 *
 * Keeper leagues allow continuity between seasons while maintaining competitive balance
 */

import {
  selectKeeper,
  removeKeeper,
  getKeepersByRoster,
  getKeepersByLeague,
  validateKeeperRules,
} from '../../services/keeperService';
import * as dynastyService from '../../services/dynastyService';
import pool from '../../config/database';

// Mock the dynastyService
jest.mock('../../services/dynastyService');

describe('Keeper Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];
  let testPlayerIds: string[] = ['7523', '7543', '4881', '5927', '6794'];

  beforeAll(async () => {
    const uniqueCode = `KS${Date.now().toString().slice(-8)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'keepertest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'KS%'`);

    // Create test users
    for (let i = 1; i <= 3; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`keepertest${i}`, `keeper${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create keeper league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Keeper Test League',
        'pre_draft',
        '2025',
        'regular',
        'keeper',
        3,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 },
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
          JSON.stringify([]),
          JSON.stringify([testPlayerIds[i], testPlayerIds[i + 1]]), // Each roster has 2 bench players
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({})
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'keepertest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'KS%'`);
  });

  beforeEach(async () => {
    // Clear keeper selections before each test
    await pool.query(`DELETE FROM keeper_selections WHERE roster_id = ANY($1)`, [testRosterIds]);

    // Reset mocks
    jest.clearAllMocks();

    // Default mock: player is eligible
    (dynastyService.isKeeperEligible as jest.Mock).mockResolvedValue({
      eligible: true
    });
  });

  describe('selectKeeper', () => {
    it('should select a keeper when eligible', async () => {
      const keeperData = {
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024',
        draft_round_penalty: 5
      };

      const keeper = await selectKeeper(keeperData);

      expect(keeper).toBeDefined();
      expect(keeper.roster_id).toBe(testRosterIds[0]);
      expect(keeper.player_id).toBe(testPlayerIds[0]);
      expect(keeper.season).toBe('2025');
      expect(keeper.kept_from_season).toBe('2024');
      expect(keeper.draft_round_penalty).toBe(5);
      expect(keeper.is_finalized).toBe(false);

      // Verify eligibility was checked
      expect(dynastyService.isKeeperEligible).toHaveBeenCalledWith(
        testRosterIds[0],
        testPlayerIds[0],
        '2025'
      );
    });

    it('should reject ineligible player', async () => {
      // Mock player as ineligible
      (dynastyService.isKeeperEligible as jest.Mock).mockResolvedValue({
        eligible: false,
        reason: 'Player not on roster'
      });

      const keeperData = {
        roster_id: testRosterIds[0],
        player_id: '9999',
        season: '2025',
        kept_from_season: '2024'
      };

      await expect(selectKeeper(keeperData)).rejects.toThrow('Player not on roster');
    });

    it('should enforce maximum keeper limit', async () => {
      // Select 3 keepers (max)
      for (let i = 0; i < 3; i++) {
        await selectKeeper({
          roster_id: testRosterIds[0],
          player_id: testPlayerIds[i],
          season: '2025',
          kept_from_season: '2024'
        });
      }

      // Try to select 4th keeper
      await expect(
        selectKeeper({
          roster_id: testRosterIds[0],
          player_id: testPlayerIds[3],
          season: '2025',
          kept_from_season: '2024'
        })
      ).rejects.toThrow('Maximum of 3 keepers allowed');
    });

    it('should prevent duplicate keeper selection', async () => {
      const keeperData = {
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      };

      await selectKeeper(keeperData);

      // Try to select same player again
      await expect(selectKeeper(keeperData)).rejects.toThrow(
        'Player already selected as keeper'
      );
    });

    it('should allow keeper without draft penalty', async () => {
      const keeper = await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
        // No draft_round_penalty specified
      });

      expect(keeper.draft_round_penalty).toBeNull();
    });

    it('should allow different teams to keep same player from previous season', async () => {
      // Team 1 keeps player A
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      });

      // Team 2 can also keep player A (different roster, same player)
      // This would only happen in redraft scenarios where they're keeping from previous year
      const keeper2 = await selectKeeper({
        roster_id: testRosterIds[1],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      });

      expect(keeper2).toBeDefined();
    });
  });

  describe('removeKeeper', () => {
    it('should remove non-finalized keeper', async () => {
      // Select a keeper
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      });

      // Remove it
      const removed = await removeKeeper(testRosterIds[0], testPlayerIds[0], '2025');
      expect(removed).toBe(true);

      // Verify it's gone
      const keepers = await getKeepersByRoster(testRosterIds[0], '2025');
      expect(keepers).toHaveLength(0);
    });

    it('should prevent removing finalized keeper', async () => {
      // Select and finalize a keeper
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      });

      // Finalize it
      await pool.query(
        `UPDATE keeper_selections SET is_finalized = true
         WHERE roster_id = $1 AND player_id = $2 AND season = $3`,
        [testRosterIds[0], testPlayerIds[0], '2025']
      );

      // Try to remove
      await expect(
        removeKeeper(testRosterIds[0], testPlayerIds[0], '2025')
      ).rejects.toThrow('Cannot remove finalized keeper selections');
    });

    it('should return false when keeper does not exist', async () => {
      const removed = await removeKeeper(testRosterIds[0], '9999', '2025');
      expect(removed).toBe(false);
    });
  });

  describe('getKeepersByRoster', () => {
    it('should return all keepers for a roster', async () => {
      // Select 2 keepers
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024',
        draft_round_penalty: 5
      });

      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[1],
        season: '2025',
        kept_from_season: '2024',
        draft_round_penalty: 8
      });

      const keepers = await getKeepersByRoster(testRosterIds[0], '2025');

      expect(keepers).toHaveLength(2);
      expect(keepers.map(k => k.player_id)).toContain(testPlayerIds[0]);
      expect(keepers.map(k => k.player_id)).toContain(testPlayerIds[1]);
    });

    it('should return empty array when no keepers', async () => {
      const keepers = await getKeepersByRoster(testRosterIds[0], '2025');
      expect(keepers).toHaveLength(0);
    });

    it('should only return keepers for specified season', async () => {
      // Select keeper for 2025
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      });

      // Select keeper for 2026
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[1],
        season: '2026',
        kept_from_season: '2025'
      });

      const keepers2025 = await getKeepersByRoster(testRosterIds[0], '2025');
      expect(keepers2025).toHaveLength(1);
      expect(keepers2025[0].player_id).toBe(testPlayerIds[0]);
    });
  });

  describe('getKeepersByLeague', () => {
    it('should return all keepers for all teams in league', async () => {
      // Team 1: 2 keepers
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024'
      });
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[1],
        season: '2025',
        kept_from_season: '2024'
      });

      // Team 2: 1 keeper
      await selectKeeper({
        roster_id: testRosterIds[1],
        player_id: testPlayerIds[2],
        season: '2025',
        kept_from_season: '2024'
      });

      const allKeepers = await getKeepersByLeague(testLeagueId, '2025');

      expect(allKeepers).toHaveLength(3);
    });

    it('should return empty array when no keepers in league', async () => {
      const keepers = await getKeepersByLeague(testLeagueId, '2025');
      expect(keepers).toHaveLength(0);
    });
  });

  describe('validateKeeperRules', () => {
    it('should validate roster within keeper limits', async () => {
      // Select 2 keepers (under limit)
      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[0],
        season: '2025',
        kept_from_season: '2024',
        draft_round_penalty: 5
      });

      await selectKeeper({
        roster_id: testRosterIds[0],
        player_id: testPlayerIds[1],
        season: '2025',
        kept_from_season: '2024',
        draft_round_penalty: 10
      });

      const validation = await validateKeeperRules(testRosterIds[0], '2025');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect too many keepers', async () => {
      // Manually insert 4 keepers (exceeds max of 3)
      // Use first 4 test player IDs
      for (let i = 0; i < 4; i++) {
        await pool.query(
          `INSERT INTO keeper_selections (roster_id, player_id, season, kept_from_season)
           VALUES ($1, $2, $3, $4)`,
          [testRosterIds[0], testPlayerIds[i], '2025', '2024']
        );
      }

      const validation = await validateKeeperRules(testRosterIds[0], '2025');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Too many keepers selected (4/3)');
    });

    it('should detect invalid draft round penalties', async () => {
      // Insert keeper with penalty > max rounds (18)
      await pool.query(
        `INSERT INTO keeper_selections (roster_id, player_id, season, kept_from_season, draft_round_penalty)
         VALUES ($1, $2, $3, $4, $5)`,
        [testRosterIds[0], testPlayerIds[0], '2025', '2024', 25] // Round 25 exceeds max
      );

      const validation = await validateKeeperRules(testRosterIds[0], '2025');

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('exceeds max rounds');
    });

    it('should pass validation with no keepers', async () => {
      const validation = await validateKeeperRules(testRosterIds[0], '2025');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
