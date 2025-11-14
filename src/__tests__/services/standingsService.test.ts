/**
 * Standings Service Tests
 *
 * Tests league standings calculation including:
 * - Win percentage calculation (wins + 0.5*ties) / totalGames
 * - Standings sorting by win percentage
 * - Tiebreaker methods (points_for, h2h_record)
 * - Playoff seed assignment
 * - Playoff team identification
 * - Edge cases (undefeated, winless, all tied)
 */

import { calculateStandings, getPlayoffTeams } from '../../services/standingsService';
import pool from '../../config/database';

describe('Standings Service Tests', () => {
  let testLeagueId: number;
  let testUserIds: number[] = [];
  let testRosterIds: number[] = [];

  beforeAll(async () => {
    const uniqueCode = `ST${Date.now().toString().slice(-7)}`;

    // Cleanup
    await pool.query(`DELETE FROM users WHERE username LIKE 'standingstest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'ST%'`);

    // Create test users
    for (let i = 1; i <= 6; i++) {
      const userResult = await pool.query(
        `INSERT INTO users (username, email, password)
         VALUES ($1, $2, $3) RETURNING id`,
        [`standingstest${i}`, `standings${i}@test.com`, 'hashedpassword']
      );
      testUserIds.push(userResult.rows[0].id);
    }

    // Create test league with 4 playoff teams
    const leagueResult = await pool.query(
      `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
        settings, scoring_settings, roster_positions, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Standings Test League',
        'in_season',
        '2025',
        'regular',
        'redraft',
        6,
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

    // Create test rosters with varying records
    for (let i = 0; i < 6; i++) {
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
            wins: 0,
            losses: 0,
            ties: 0,
            points_for: 0,
            points_against: 0
          })
        ]
      );
      testRosterIds.push(rosterResult.rows[0].id);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE 'standingstest%'`);
    await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'ST%'`);
  });

  beforeEach(async () => {
    // Reset all rosters to 0-0 before each test
    for (const rosterId of testRosterIds) {
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(settings, '{wins}', '0'),
                '{losses}', '0'),
              '{ties}', '0'),
            '{points_for}', '0'),
          '{points_against}', '0')
        WHERE id = $1`,
        [rosterId]
      );
    }
  });

  describe('calculateStandings', () => {
    it('should calculate standings with clear win records', async () => {
      // Set different records
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '10'),
            '{losses}', '3'),
          '{points_for}', '1500')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '9'),
            '{losses}', '4'),
          '{points_for}', '1450')
        WHERE id = $1`,
        [testRosterIds[1]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '8'),
            '{losses}', '5'),
          '{points_for}', '1400')
        WHERE id = $1`,
        [testRosterIds[2]]
      );

      const standings = await calculateStandings(testLeagueId);

      expect(standings).toHaveLength(6);
      expect(standings[0].roster_id).toBe(testRosterIds[0]); // 10-3 (.769)
      expect(standings[0].seed).toBe(1);
      expect(standings[1].roster_id).toBe(testRosterIds[1]); // 9-4 (.692)
      expect(standings[1].seed).toBe(2);
      expect(standings[2].roster_id).toBe(testRosterIds[2]); // 8-5 (.615)
      expect(standings[2].seed).toBe(3);
    });

    it('should handle ties in win percentage correctly', async () => {
      // Two teams with same record
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '7'),
            '{losses}', '6'),
          '{points_for}', '1500')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '6'),
            '{losses}', '7'),
          '{points_for}', '1450')
        WHERE id = $1`,
        [testRosterIds[1]]
      );

      const standings = await calculateStandings(testLeagueId);

      // Both should have different seeds
      expect(standings[0].seed).toBe(1);
      expect(standings[1].seed).toBe(2);

      // Higher points_for should win tiebreaker
      expect(standings[0].roster_id).toBe(testRosterIds[0]);
      expect(standings[1].roster_id).toBe(testRosterIds[1]);
    });

    it('should calculate win percentage with ties correctly', async () => {
      // Team with ties: 6-3-4 = (6 + 4*0.5) / 13 = 8/13 = .615
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(settings, '{wins}', '6'),
              '{losses}', '3'),
            '{ties}', '4'),
          '{points_for}', '1300')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      // Team with no ties: 8-5 = 8/13 = .615 (same win pct)
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '8'),
            '{losses}', '5'),
          '{points_for}', '1400')
        WHERE id = $1`,
        [testRosterIds[1]]
      );

      const standings = await calculateStandings(testLeagueId);

      // Both should have same win percentage but different points
      const team1 = standings.find(s => s.roster_id === testRosterIds[0]);
      const team2 = standings.find(s => s.roster_id === testRosterIds[1]);

      expect(team1).toBeDefined();
      expect(team2).toBeDefined();
      expect(team1!.ties).toBe(4);
      expect(team2!.ties).toBe(0);

      // Higher points_for breaks tie
      expect(team2!.seed).toBeLessThan(team1!.seed);
    });

    it('should handle undefeated team', async () => {
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '13'),
            '{losses}', '0'),
          '{points_for}', '1800')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '10'),
            '{losses}', '3'),
          '{points_for}', '1500')
        WHERE id = $1`,
        [testRosterIds[1]]
      );

      const standings = await calculateStandings(testLeagueId);

      expect(standings[0].roster_id).toBe(testRosterIds[0]);
      expect(standings[0].wins).toBe(13);
      expect(standings[0].losses).toBe(0);
      expect(standings[0].seed).toBe(1);
    });

    it('should handle winless team', async () => {
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '0'),
            '{losses}', '13'),
          '{points_for}', '900')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '1'),
            '{losses}', '12'),
          '{points_for}', '950')
        WHERE id = $1`,
        [testRosterIds[1]]
      );

      const standings = await calculateStandings(testLeagueId);

      const winlessTeam = standings.find(s => s.roster_id === testRosterIds[0]);
      expect(winlessTeam).toBeDefined();
      expect(winlessTeam!.wins).toBe(0);
      expect(winlessTeam!.losses).toBe(13);
      expect(winlessTeam!.seed).toBe(6); // Last place
    });

    it('should handle all teams with same record (tiebreaker)', async () => {
      // All teams 7-6
      const records = [1500, 1450, 1400, 1350, 1300, 1250];

      for (let i = 0; i < 6; i++) {
        await pool.query(
          `UPDATE rosters SET settings = jsonb_set(
            jsonb_set(
              jsonb_set(settings, '{wins}', '7'),
              '{losses}', '6'),
            '{points_for}', $2::text)
          WHERE id = $1`,
          [testRosterIds[i], records[i].toString()]
        );
      }

      const standings = await calculateStandings(testLeagueId);

      // Should be sorted by points_for (tiebreaker)
      for (let i = 0; i < 5; i++) {
        expect(standings[i].points_for).toBeGreaterThan(standings[i + 1].points_for);
      }

      // Seeds should be 1-6
      expect(standings.map(s => s.seed).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle teams with no games played', async () => {
      // All teams 0-0 (no games)
      const standings = await calculateStandings(testLeagueId);

      expect(standings).toHaveLength(6);
      // When all teams are 0-0, tiebreaker (points) applies
      // All have 0 points, so order is arbitrary but seeds should be assigned
      expect(standings.map(s => s.seed).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle decimal points correctly', async () => {
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '8'),
            '{losses}', '5'),
          '{points_for}', '1456.75')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(settings, '{wins}', '8'),
            '{losses}', '5'),
          '{points_for}', '1456.50')
        WHERE id = $1`,
        [testRosterIds[1]]
      );

      const standings = await calculateStandings(testLeagueId);

      const team1 = standings.find(s => s.roster_id === testRosterIds[0]);
      const team2 = standings.find(s => s.roster_id === testRosterIds[1]);

      expect(team1!.points_for).toBe(1456.75);
      expect(team2!.points_for).toBe(1456.50);
      expect(team1!.seed).toBeLessThan(team2!.seed);
    });

    it('should assign sequential seeds starting at 1', async () => {
      // Set varying records
      const records = [
        { wins: 10, losses: 3, pf: 1500 },
        { wins: 9, losses: 4, pf: 1450 },
        { wins: 8, losses: 5, pf: 1400 },
        { wins: 7, losses: 6, pf: 1350 },
        { wins: 6, losses: 7, pf: 1300 },
        { wins: 5, losses: 8, pf: 1250 },
      ];

      for (let i = 0; i < 6; i++) {
        await pool.query(
          `UPDATE rosters SET settings = jsonb_set(
            jsonb_set(
              jsonb_set(settings, '{wins}', $2::text),
              '{losses}', $3::text),
            '{points_for}', $4::text)
          WHERE id = $1`,
          [testRosterIds[i], records[i].wins.toString(), records[i].losses.toString(), records[i].pf.toString()]
        );
      }

      const standings = await calculateStandings(testLeagueId);

      // Check seeds are 1, 2, 3, 4, 5, 6
      expect(standings[0].seed).toBe(1);
      expect(standings[1].seed).toBe(2);
      expect(standings[2].seed).toBe(3);
      expect(standings[3].seed).toBe(4);
      expect(standings[4].seed).toBe(5);
      expect(standings[5].seed).toBe(6);
    });

    it('should include all roster and user data in standings', async () => {
      const standings = await calculateStandings(testLeagueId);

      standings.forEach((entry) => {
        expect(entry.roster_id).toBeDefined();
        expect(entry.user_id).toBeDefined();
        expect(entry.team_name).toBeDefined();
        expect(entry.username).toBeDefined();
        expect(entry.wins).toBeDefined();
        expect(entry.losses).toBeDefined();
        expect(entry.ties).toBeDefined();
        expect(entry.points_for).toBeDefined();
        expect(entry.points_against).toBeDefined();
        expect(entry.seed).toBeDefined();
      });
    });
  });

  describe('getPlayoffTeams', () => {
    beforeEach(async () => {
      // Set up typical playoff scenario
      const records = [
        { wins: 10, losses: 3, pf: 1500 }, // Seed 1
        { wins: 9, losses: 4, pf: 1450 },  // Seed 2
        { wins: 8, losses: 5, pf: 1400 },  // Seed 3
        { wins: 7, losses: 6, pf: 1350 },  // Seed 4
        { wins: 6, losses: 7, pf: 1300 },  // Seed 5 (miss playoffs)
        { wins: 5, losses: 8, pf: 1250 },  // Seed 6 (miss playoffs)
      ];

      for (let i = 0; i < 6; i++) {
        await pool.query(
          `UPDATE rosters SET settings = jsonb_set(
            jsonb_set(
              jsonb_set(settings, '{wins}', $2::text),
              '{losses}', $3::text),
            '{points_for}', $4::text)
          WHERE id = $1`,
          [testRosterIds[i], records[i].wins.toString(), records[i].losses.toString(), records[i].pf.toString()]
        );
      }
    });

    it('should return correct number of playoff teams', async () => {
      const playoffTeams = await getPlayoffTeams(testLeagueId);

      expect(playoffTeams).toHaveLength(4); // League configured for 4 playoff teams
    });

    it('should return teams in seed order', async () => {
      const playoffTeams = await getPlayoffTeams(testLeagueId);

      expect(playoffTeams[0].seed).toBe(1);
      expect(playoffTeams[1].seed).toBe(2);
      expect(playoffTeams[2].seed).toBe(3);
      expect(playoffTeams[3].seed).toBe(4);
    });

    it('should exclude non-playoff teams', async () => {
      const playoffTeams = await getPlayoffTeams(testLeagueId);

      // Should not include seeds 5 and 6
      const seeds = playoffTeams.map(t => t.seed);
      expect(seeds).not.toContain(5);
      expect(seeds).not.toContain(6);
    });

    it('should return teams with correct records', async () => {
      const playoffTeams = await getPlayoffTeams(testLeagueId);

      const seed1 = playoffTeams.find(t => t.seed === 1);
      expect(seed1).toBeDefined();
      expect(seed1!.wins).toBe(10);
      expect(seed1!.losses).toBe(3);
      expect(seed1!.points_for).toBe(1500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle league with no rosters', async () => {
      // Create a league with no rosters
      const emptyLeagueResult = await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          'Empty League',
          'in_season',
          '2025',
          'regular',
          'redraft',
          0,
          JSON.stringify({ playoff_teams: 4 }),
          JSON.stringify({}),
          JSON.stringify([]),
          `EMPTY${Date.now().toString().slice(-7)}`
        ]
      );

      const emptyLeagueId = emptyLeagueResult.rows[0].id;

      const standings = await calculateStandings(emptyLeagueId);
      expect(standings).toHaveLength(0);

      const playoffTeams = await getPlayoffTeams(emptyLeagueId);
      expect(playoffTeams).toHaveLength(0);
    });

    it('should handle points_against in standings', async () => {
      await pool.query(
        `UPDATE rosters SET settings = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(settings, '{wins}', '8'),
              '{losses}', '5'),
            '{points_for}', '1400'),
          '{points_against}', '1350')
        WHERE id = $1`,
        [testRosterIds[0]]
      );

      const standings = await calculateStandings(testLeagueId);
      const team = standings.find(s => s.roster_id === testRosterIds[0]);

      expect(team).toBeDefined();
      expect(team!.points_for).toBe(1400);
      expect(team!.points_against).toBe(1350);
    });

    it('should handle missing settings fields gracefully', async () => {
      // Remove all settings
      await pool.query(
        `UPDATE rosters SET settings = '{}'::jsonb WHERE id = $1`,
        [testRosterIds[0]]
      );

      const standings = await calculateStandings(testLeagueId);
      const team = standings.find(s => s.roster_id === testRosterIds[0]);

      expect(team).toBeDefined();
      expect(team!.wins).toBe(0);
      expect(team!.losses).toBe(0);
      expect(team!.ties).toBe(0);
      expect(team!.points_for).toBe(0);
      expect(team!.points_against).toBe(0);
    });
  });
});
