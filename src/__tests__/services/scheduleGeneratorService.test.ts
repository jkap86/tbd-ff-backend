/**
 * Schedule Generator Service Tests
 *
 * Tests round-robin schedule generation for fantasy football leagues:
 * - Circle method algorithm for fair matchup distribution
 * - Even number of teams (no bye weeks)
 * - Odd number of teams (with bye weeks)
 * - Schedule validation
 * - Regeneration with existing matchups
 *
 * Round-robin ensures:
 * - Each team plays every other team at least once
 * - Fair distribution of home/away
 * - Bye weeks fairly distributed (for odd teams)
 */

import {
  generateFullSeasonSchedule,
  generateRoundRobinWeek,
} from '../../services/scheduleGeneratorService';
import pool from '../../config/database';

describe('Schedule Generator Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];

  beforeAll(async () => {
    const uniqueCode = `SG${Date.now().toString().slice(-8)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'schedtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'SG%'`);

    // Create test users (8 for even team count)
    for (let i = 1; i <= 8; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`schedtest${i}`, `sched${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Schedule Test League',
        'pre_draft',
        '2025',
        'regular',
        'redraft',
        8,
        JSON.stringify({ commissioner_id: testUserIds[0] }),
        JSON.stringify({}),
        JSON.stringify([
          { position: 'QB', count: 1 },
          { position: 'RB', count: 2 }
        ]),
        uniqueCode
      ]
    );
    testLeagueId = leagueResult.rows[0].id;

    // Create 8 test rosters
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
          JSON.stringify({})
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'schedtest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'SG%'`);
  });

  beforeEach(async () => {
    // Clear matchups before each test
    await pool.query(`DELETE FROM matchups WHERE league_id = $1`, [testLeagueId]);
  });

  describe('generateRoundRobinWeek', () => {
    it('should generate correct matchups for 8 teams in week 1', () => {
      // 8 teams = 4 matchups per week
      const matchups = generateRoundRobinWeek(testRosterIds, 1);

      expect(matchups).toHaveLength(4); // 8 teams / 2 = 4 matchups

      // Verify all teams are included exactly once
      const allTeams = new Set<number>();
      matchups.forEach(m => {
        allTeams.add(m.roster1_id);
        if (m.roster2_id) allTeams.add(m.roster2_id);
      });
      expect(allTeams.size).toBe(8);

      // Verify no team plays itself
      matchups.forEach(m => {
        expect(m.roster1_id).not.toBe(m.roster2_id);
      });
    });

    it('should generate different matchups for different weeks', () => {
      const week1 = generateRoundRobinWeek(testRosterIds, 1);
      const week2 = generateRoundRobinWeek(testRosterIds, 2);
      const week3 = generateRoundRobinWeek(testRosterIds, 3);

      // Convert matchups to string representation for comparison
      const week1String = JSON.stringify(week1.map(m => [m.roster1_id, m.roster2_id].sort()));
      const week2String = JSON.stringify(week2.map(m => [m.roster1_id, m.roster2_id].sort()));
      const week3String = JSON.stringify(week3.map(m => [m.roster1_id, m.roster2_id].sort()));

      // Each week should have different matchups
      expect(week1String).not.toBe(week2String);
      expect(week2String).not.toBe(week3String);
      expect(week1String).not.toBe(week3String);
    });

    it('should handle odd number of teams with bye weeks', () => {
      // Test with 7 teams (odd)
      const sevenRosters = testRosterIds.slice(0, 7);
      const matchups = generateRoundRobinWeek(sevenRosters, 1);

      // 7 teams = 3 matchups + 1 bye
      expect(matchups).toHaveLength(4); // ceil(7/2) = 4 matchups

      // Exactly one team should have bye (roster2_id = null)
      const byeMatchups = matchups.filter(m => m.roster2_id === null);
      expect(byeMatchups).toHaveLength(1);

      // All 7 teams should be accounted for
      const allTeams = new Set<number>();
      matchups.forEach(m => {
        allTeams.add(m.roster1_id);
        if (m.roster2_id) allTeams.add(m.roster2_id);
      });
      expect(allTeams.size).toBe(7);
    });

    it('should rotate bye weeks fairly across teams', () => {
      const sevenRosters = testRosterIds.slice(0, 7);

      // Track which teams get byes over 7 weeks
      const byeCount = new Map<number, number>();
      sevenRosters.forEach(id => byeCount.set(id, 0));

      for (let week = 1; week <= 7; week++) {
        const matchups = generateRoundRobinWeek(sevenRosters, week);
        const byeMatchup = matchups.find(m => m.roster2_id === null);

        if (byeMatchup) {
          const currentCount = byeCount.get(byeMatchup.roster1_id) || 0;
          byeCount.set(byeMatchup.roster1_id, currentCount + 1);
        }
      }

      // Each team should get exactly 1 bye over 7 weeks
      byeCount.forEach(count => {
        expect(count).toBe(1);
      });
    });

    it('should ensure each team plays every other team in full round', () => {
      // For 8 teams, a full round-robin is 7 weeks (n-1 weeks for n teams)
      const opponents = new Map<number, Set<number>>();
      testRosterIds.forEach(id => opponents.set(id, new Set()));

      for (let week = 1; week <= 7; week++) {
        const matchups = generateRoundRobinWeek(testRosterIds, week);

        matchups.forEach(m => {
          if (m.roster2_id) {
            opponents.get(m.roster1_id)?.add(m.roster2_id);
            opponents.get(m.roster2_id)?.add(m.roster1_id);
          }
        });
      }

      // Each team should have played all 7 other teams exactly once
      opponents.forEach((opps, rosterId) => {
        expect(opps.size).toBe(7); // Should have faced all 7 opponents
      });
    });
  });

  describe('generateFullSeasonSchedule', () => {
    it('should generate full season schedule (weeks 1-14)', async () => {
      const result = await generateFullSeasonSchedule(
        testLeagueId,
        '2025',
        1,
        14,
        false
      );

      expect(result.success).toBe(true);
      expect(result.matchups).toHaveLength(56); // 14 weeks * 4 matchups/week
      expect(result.message).toContain('Successfully generated');

      // Verify matchups in database
      const dbMatchups = await pool.query(
        'SELECT * FROM matchups WHERE league_id = $1 AND season = $2 ORDER BY week',
        [testLeagueId, '2025']
      );

      expect(dbMatchups.rows).toHaveLength(56);

      // Verify weeks are correct
      const weeks = [...new Set(dbMatchups.rows.map(m => m.week))];
      expect(weeks).toHaveLength(14);
      expect(Math.min(...weeks)).toBe(1);
      expect(Math.max(...weeks)).toBe(14);
    });

    it('should fail if league has fewer than 2 teams', async () => {
      // Create league with only 1 roster
      const singleLeague = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'Single Team League',
          'pre_draft',
          '2025',
          'regular',
          'redraft',
          1,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([]),
          `ST${Date.now().toString().slice(-8)}`
        ]
      );

      await pool.query(
        `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [singleLeague.rows[0].id, testUserIds[0], 1, '[]', '[]', '[]', '[]', '{}']
      );

      const result = await generateFullSeasonSchedule(
        singleLeague.rows[0].id,
        '2025',
        1,
        14,
        false
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('League must have at least 2 teams');
    });

    it('should fail if matchups already exist without regenerate flag', async () => {
      // Generate schedule once
      await generateFullSeasonSchedule(testLeagueId, '2025', 1, 5, false);

      // Try to generate again without regenerate
      const result = await generateFullSeasonSchedule(testLeagueId, '2025', 1, 5, false);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Matchups already exist');
    });

    it('should regenerate schedule when regenerate=true', async () => {
      // Generate schedule first time
      const firstResult = await generateFullSeasonSchedule(testLeagueId, '2025', 1, 5, false);
      expect(firstResult.success).toBe(true);
      const firstMatchupIds = firstResult.matchups.map(m => m.id);

      // Regenerate
      const secondResult = await generateFullSeasonSchedule(testLeagueId, '2025', 1, 5, true);
      expect(secondResult.success).toBe(true);
      const secondMatchupIds = secondResult.matchups.map(m => m.id);

      // Should have different IDs (new matchups created)
      expect(firstMatchupIds).not.toEqual(secondMatchupIds);

      // Old matchups should be deleted
      for (const id of firstMatchupIds) {
        const check = await pool.query('SELECT * FROM matchups WHERE id = $1', [id]);
        expect(check.rows).toHaveLength(0);
      }
    });

    it('should validate week range', async () => {
      // Invalid: startWeek >= endWeek
      const result1 = await generateFullSeasonSchedule(testLeagueId, '2025', 5, 5, false);
      expect(result1.success).toBe(false);
      expect(result1.errors?.[0]).toContain('Invalid week range');

      // Invalid: week > 18
      const result2 = await generateFullSeasonSchedule(testLeagueId, '2025', 1, 20, false);
      expect(result2.success).toBe(false);
      expect(result2.errors?.[0]).toContain('Invalid week range');

      // Invalid: week < 1
      const result3 = await generateFullSeasonSchedule(testLeagueId, '2025', 0, 10, false);
      expect(result3.success).toBe(false);
      expect(result3.errors?.[0]).toContain('Invalid week range');
    });

    it('should handle different season ranges correctly', async () => {
      // Generate weeks 5-10
      const result = await generateFullSeasonSchedule(testLeagueId, '2025', 5, 10, false);

      expect(result.success).toBe(true);
      expect(result.matchups).toHaveLength(24); // 6 weeks * 4 matchups

      const weeks = [...new Set(result.matchups.map((m: any) => m.week))];
      expect(weeks).toHaveLength(6);
      expect(Math.min(...weeks)).toBe(5);
      expect(Math.max(...weeks)).toBe(10);
    });
  });

  describe('schedule validation', () => {
    it('should validate that each team plays correct number of games', async () => {
      const result = await generateFullSeasonSchedule(testLeagueId, '2025', 1, 14, false);

      expect(result.success).toBe(true);

      // Count games per team
      const gamesPerTeam = new Map<number, number>();
      testRosterIds.forEach(id => gamesPerTeam.set(id, 0));

      result.matchups.forEach((m: any) => {
        const count1 = gamesPerTeam.get(m.roster1_id) || 0;
        gamesPerTeam.set(m.roster1_id, count1 + 1);

        if (m.roster2_id) {
          const count2 = gamesPerTeam.get(m.roster2_id) || 0;
          gamesPerTeam.set(m.roster2_id, count2 + 1);
        }
      });

      // Each team should play 14 games (one per week)
      gamesPerTeam.forEach(count => {
        expect(count).toBe(14);
      });
    });

    it('should ensure no team plays itself', async () => {
      const result = await generateFullSeasonSchedule(testLeagueId, '2025', 1, 14, false);

      expect(result.success).toBe(true);

      // Check that no matchup has same team twice
      result.matchups.forEach((m: any) => {
        expect(m.roster1_id).not.toBe(m.roster2_id);
      });
    });

    it('should distribute bye weeks fairly for odd team count', async () => {
      // Create league with 7 teams
      const oddLeague = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'Odd League',
          'pre_draft',
          '2025',
          'regular',
          'redraft',
          7,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([]),
          `OL${Date.now().toString().slice(-8)}`
        ]
      );

      const oddRosterIds: number[] = [];
      for (let i = 0; i < 7; i++) {
        const rosterResult = await pool.query(
          `INSERT INTO rosters (league_id, user_id, roster_id, starters, bench, taxi, ir, settings)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [oddLeague.rows[0].id, testUserIds[i], i + 1, '[]', '[]', '[]', '[]', '{}']
        );
        oddRosterIds.push(rosterResult.rows[0].id);
      }

      const result = await generateFullSeasonSchedule(oddLeague.rows[0].id, '2025', 1, 7, false);

      expect(result.success).toBe(true);

      // Count bye weeks per team
      const byesPerTeam = new Map<number, number>();
      oddRosterIds.forEach(id => byesPerTeam.set(id, 0));

      result.matchups.forEach((m: any) => {
        if (m.roster2_id === null) {
          const count = byesPerTeam.get(m.roster1_id) || 0;
          byesPerTeam.set(m.roster1_id, count + 1);
        }
      });

      // Each team should get exactly 1 bye week over 7 weeks
      byesPerTeam.forEach(count => {
        expect(count).toBe(1);
      });
    });
  });
});
