/**
 * Playoff Service Tests
 *
 * Tests playoff bracket generation and management including:
 * - Playoff settings creation and retrieval
 * - 4-team bracket (semifinals + championship)
 * - 6-team bracket (top 2 seeds get byes)
 * - 8-team bracket (all teams play first round)
 * - Bracket matchup validation
 * - Consolation bracket generation
 * - Edge cases (insufficient teams, invalid settings)
 */

import {
  getPlayoffSettings,
  savePlayoffSettings,
  generatePlayoffBracket,
} from '../../services/playoffService';
import pool from '../../config/database';

describe('Playoff Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];

  beforeAll(async () => {
    const uniqueCode = `PO${Date.now().toString().slice(-7)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'playofftest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'PO%'`);

    // Create test users (8 for full bracket testing)
    for (let i = 1; i <= 8; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`playofftest${i}`, `playoff${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Playoff Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        8,
        JSON.stringify({
          commissioner_id: testUserIds[0],
          playoff_teams: 4,
          tiebreaker: 'points_for'
        }),
        JSON.stringify({}),
        JSON.stringify([]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create test rosters with playoff seeding records
    const records = [
      { wins: 10, losses: 3, pf: 1500 }, // Seed 1
      { wins: 9, losses: 4, pf: 1450 },  // Seed 2
      { wins: 8, losses: 5, pf: 1400 },  // Seed 3
      { wins: 7, losses: 6, pf: 1350 },  // Seed 4
      { wins: 6, losses: 7, pf: 1300 },  // Seed 5
      { wins: 5, losses: 8, pf: 1250 },  // Seed 6
      { wins: 4, losses: 9, pf: 1200 },  // Seed 7
      { wins: 3, losses: 10, pf: 1150 }, // Seed 8
    ];

    for (let i = 0; i < 8; i++) {
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
          JSON.stringify({
            team_name: `Team ${i + 1}`,
            wins: records[i].wins,
            losses: records[i].losses,
            ties: 0,
            points_for: records[i].pf,
            points_against: 0
          })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'playofftest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'PO%'`);
  });

  beforeEach(async () => {
    // Clear playoff settings and matchups before each test
    await pool.query(`DELETE FROM playoff_settings WHERE league_id = $1`, [testLeagueId]);
    await pool.query(`DELETE FROM matchups WHERE league_id = $1 AND is_playoff = true`, [testLeagueId]);
  });

  describe('getPlayoffSettings', () => {
    it('should return null when no settings exist', async () => {
      const settings = await getPlayoffSettings(testLeagueId);
      expect(settings).toBeNull();
    });

    it('should return settings when they exist', async () => {
      // Create settings
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 6,
        playoff_week_start: 15,
        playoff_week_end: 17,
      });

      const settings = await getPlayoffSettings(testLeagueId);

      expect(settings).toBeDefined();
      expect(settings!.playoff_teams).toBe(6);
      expect(settings!.playoff_week_start).toBe(15);
      expect(settings!.playoff_week_end).toBe(17);
    });
  });

  describe('savePlayoffSettings', () => {
    it('should create new playoff settings', async () => {
      const settings = await savePlayoffSettings(testLeagueId, {
        playoff_teams: 4,
        playoff_week_start: 15,
        playoff_week_end: 17,
        matchup_duration: 1,
      });

      expect(settings).toBeDefined();
      expect(settings.league_id).toBe(testLeagueId);
      expect(settings.playoff_teams).toBe(4);
      expect(settings.matchup_duration).toBe(1);
    });

    it('should update existing playoff settings', async () => {
      // Create initial settings
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 4,
      });

      // Update settings
      const updated = await savePlayoffSettings(testLeagueId, {
        playoff_teams: 6,
        include_consolation_bracket: true,
      });

      expect(updated.playoff_teams).toBe(6);
      expect(updated.include_consolation_bracket).toBe(true);

      // Verify only one settings record exists
      const all = await pool.query(
        'SELECT * FROM playoff_settings WHERE league_id = $1',
        [testLeagueId]
      );
      expect(all.rows).toHaveLength(1);
    });

    it('should use default values when not specified', async () => {
      const settings = await savePlayoffSettings(testLeagueId, {});

      expect(settings.playoff_teams).toBe(6); // Default
      expect(settings.playoff_week_start).toBe(15); // Default
      expect(settings.playoff_week_end).toBe(17); // Default
      expect(settings.matchup_duration).toBe(1); // Default
    });

    it('should save tiebreaker priority array', async () => {
      const settings = await savePlayoffSettings(testLeagueId, {
        tiebreaker_priority: ['bench_points', 'higher_seed']
      });

      expect(Array.isArray(settings.tiebreaker_priority)).toBe(true);
      expect(settings.tiebreaker_priority).toContain('bench_points');
      expect(settings.tiebreaker_priority).toContain('higher_seed');
    });
  });

  describe('generatePlayoffBracket - 4 teams', () => {
    beforeEach(async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 4,
        playoff_week_start: 15,
        playoff_week_end: 17,
        matchup_duration: 1,
      });
    });

    it('should generate 4-team bracket structure', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const matchups = await pool.query(
        `SELECT * FROM matchups WHERE league_id = $1 AND is_playoff = true ORDER BY week, bracket_position`,
        [testLeagueId]
      );

      // 4-team: 2 semifinals (week 15) + 1 championship (week 17) = 3 matchups
      expect(matchups.rows.length).toBeGreaterThanOrEqual(3);
    });

    it('should create correct semifinal matchups (1v4, 2v3)', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const semifinals = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND is_playoff = true AND round = 'semifinal'
         ORDER BY bracket_position`,
        [testLeagueId]
      );

      expect(semifinals.rows).toHaveLength(2);

      // Matchup 1: Seed 1 vs Seed 4
      expect(semifinals.rows[0].roster1_id).toBe(testRosterIds[0]); // Seed 1
      expect(semifinals.rows[0].roster2_id).toBe(testRosterIds[3]); // Seed 4

      // Matchup 2: Seed 2 vs Seed 3
      expect(semifinals.rows[1].roster1_id).toBe(testRosterIds[1]); // Seed 2
      expect(semifinals.rows[1].roster2_id).toBe(testRosterIds[2]); // Seed 3
    });

    it('should create championship matchup', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const championship = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND is_playoff = true AND round = 'final'`,
        [testLeagueId]
      );

      expect(championship.rows).toHaveLength(1);
      expect(championship.rows[0].is_championship).toBe(true);
    });

    it('should assign correct weeks to matchups', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const allMatchups = await pool.query(
        `SELECT * FROM matchups WHERE league_id = $1 AND is_playoff = true ORDER BY week`,
        [testLeagueId]
      );

      // Semifinals in week 15
      const week15 = allMatchups.rows.filter(m => m.week === 15);
      expect(week15.length).toBeGreaterThan(0);

      // Championship in week 17 (15 + 2 for 1-week matchups)
      const week17 = allMatchups.rows.filter(m => m.week === 17);
      expect(week17.length).toBeGreaterThan(0);
    });
  });

  describe('generatePlayoffBracket - 6 teams', () => {
    beforeEach(async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 6,
        playoff_week_start: 15,
        playoff_week_end: 17,
        matchup_duration: 1,
      });
    });

    it('should generate 6-team bracket with byes', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const matchups = await pool.query(
        `SELECT * FROM matchups WHERE league_id = $1 AND is_playoff = true`,
        [testLeagueId]
      );

      // 6-team: wildcard round (2 games) + semifinals (2 games) + championship (1 game) = 5+ matchups
      expect(matchups.rows.length).toBeGreaterThanOrEqual(5);
    });

    it('should give byes to top 2 seeds', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      // Check wildcard round (week 15)
      const wildcards = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND is_playoff = true AND round = 'wildcard'`,
        [testLeagueId]
      );

      // Seeds 3v6 and 4v5 play in wildcard
      const matchupSeeds = wildcards.rows.map(m => ({
        roster1: m.roster1_id,
        roster2: m.roster2_id
      }));

      // Seeds 1 and 2 should NOT appear in wildcard round
      const wildCardRosterIds = matchupSeeds.flatMap(m => [m.roster1, m.roster2]);
      expect(wildCardRosterIds).not.toContain(testRosterIds[0]); // Seed 1
      expect(wildCardRosterIds).not.toContain(testRosterIds[1]); // Seed 2
    });
  });

  describe('generatePlayoffBracket - 8 teams', () => {
    beforeEach(async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 8,
        playoff_week_start: 15,
        playoff_week_end: 17,
        matchup_duration: 1,
      });
    });

    it('should generate 8-team bracket (all teams play round 1)', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const matchups = await pool.query(
        `SELECT * FROM matchups WHERE league_id = $1 AND is_playoff = true`,
        [testLeagueId]
      );

      // 8-team: quarterfinals (4) + semifinals (2) + championship (1) = 7+ matchups
      expect(matchups.rows.length).toBeGreaterThanOrEqual(7);
    });

    it('should create 4 quarterfinal matchups', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const quarterfinals = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND is_playoff = true AND round = 'quarterfinal'
         ORDER BY bracket_position`,
        [testLeagueId]
      );

      expect(quarterfinals.rows).toHaveLength(4);

      // Standard seeding: 1v8, 2v7, 3v6, 4v5
      expect(quarterfinals.rows[0].roster1_id).toBe(testRosterIds[0]); // 1v8
      expect(quarterfinals.rows[0].roster2_id).toBe(testRosterIds[7]);

      expect(quarterfinals.rows[1].roster1_id).toBe(testRosterIds[1]); // 2v7
      expect(quarterfinals.rows[1].roster2_id).toBe(testRosterIds[6]);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error when playoff settings not found', async () => {
      await expect(
        generatePlayoffBracket(testLeagueId, '2025')
      ).rejects.toThrow('Playoff settings not found');
    });

    it('should throw error for unsupported playoff team count', async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 12, // Unsupported
      });

      await expect(
        generatePlayoffBracket(testLeagueId, '2025')
      ).rejects.toThrow('Unsupported playoff team count');
    });

    it('should throw error when insufficient teams for playoffs', async () => {
      // Create league with only 2 rosters but wants 4-team playoff
      const smallLeagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'Small League',
          'in_season',
          '2025',
          'regular',
          'redraft',
          2,
          JSON.stringify({ playoff_teams: 4 }),
          JSON.stringify({}),
          JSON.stringify([]),
          `SM${Date.now().toString().slice(-8)}`
        ]
      );

      const smallLeagueId = smallLeagueResult.rows[0].id;

      // Create playoff settings
      await savePlayoffSettings(smallLeagueId, {
        playoff_teams: 4,
      });

      // Create only 2 rosters
      for (let i = 0; i < 2; i++) {
        await pool.query(
          `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            smallLeagueId,
            testUserIds[i],
            i + 1,
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify({ wins: 5, losses: 5, ties: 0, points_for: 1000 })
          ]
        );
      }

      await expect(
        generatePlayoffBracket(smallLeagueId, '2025')
      ).rejects.toThrow('Not enough teams for playoffs');
    });

    it('should delete existing playoff matchups before regenerating', async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 4,
      });

      // Generate bracket first time
      await generatePlayoffBracket(testLeagueId, '2025');

      const firstCount = await pool.query(
        'SELECT COUNT(*) FROM matchups WHERE league_id = $1 AND is_playoff = true',
        [testLeagueId]
      );

      // Generate again (should replace, not duplicate)
      await generatePlayoffBracket(testLeagueId, '2025');

      const secondCount = await pool.query(
        'SELECT COUNT(*) FROM matchups WHERE league_id = $1 AND is_playoff = true',
        [testLeagueId]
      );

      // Should have same count (replaced, not added)
      expect(secondCount.rows[0].count).toBe(firstCount.rows[0].count);
    });

    it('should handle 2-week matchup duration', async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 4,
        playoff_week_start: 14,
        matchup_duration: 2, // Two-week matchups
      });

      await generatePlayoffBracket(testLeagueId, '2025');

      const matchups = await pool.query(
        `SELECT DISTINCT week FROM matchups WHERE league_id = $1 AND is_playoff = true ORDER BY week`,
        [testLeagueId]
      );

      // With 2-week matchups: weeks 14-15 (semis), 16-17 (finals)
      const weeks = matchups.rows.map(r => r.week);
      expect(weeks).toContain(14); // Semifinals start
      expect(weeks.length).toBeGreaterThan(1);
    });
  });

  describe('Bracket Position and Metadata', () => {
    beforeEach(async () => {
      await savePlayoffSettings(testLeagueId, {
        playoff_teams: 4,
      });
    });

    it('should assign bracket positions to matchups', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const matchups = await pool.query(
        `SELECT bracket_position FROM matchups
         WHERE league_id = $1 AND is_playoff = true`,
        [testLeagueId]
      );

      matchups.rows.forEach(row => {
        expect(row.bracket_position).toBeDefined();
        expect(row.bracket_position).toBeTruthy();
      });
    });

    it('should mark championship matchup correctly', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const championship = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND is_championship = true`,
        [testLeagueId]
      );

      expect(championship.rows).toHaveLength(1);
      expect(championship.rows[0].round).toBe('final');
    });

    it('should not mark non-championship matchups as championship', async () => {
      await generatePlayoffBracket(testLeagueId, '2025');

      const nonChampionship = await pool.query(
        `SELECT * FROM matchups
         WHERE league_id = $1 AND is_playoff = true AND is_championship = false`,
        [testLeagueId]
      );

      expect(nonChampionship.rows.length).toBeGreaterThan(0);
    });
  });
});
