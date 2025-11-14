/**
 * Scoring Service Tests
 *
 * Tests fantasy point calculation including:
 * - Standard scoring (TD, yards)
 * - PPR vs Standard vs Half-PPR
 * - Tiered PPR (position-based reception scoring)
 * - Bonus scoring (300 yard passing, 100 yard rushing/receiving)
 * - Kicking scoring (distance-based field goals, misses)
 * - Defense/ST scoring
 * - IDP scoring
 * - Nested vs flat scoring structure
 * - Roster score aggregation
 */

import { calculateFantasyPoints, calculateRosterScore, ScoringSettings } from '../../services/scoringService';
import { PlayerStats } from '../../models/PlayerStats';
import pool from '../../config/database';

describe('Scoring Service Tests', () => {
  describe('calculateFantasyPoints', () => {
    describe('Standard Scoring', () => {
      const standardScoring: ScoringSettings = {
        passing_touchdowns: 4,
        passing_yards: 0.04,
        passing_interceptions: -2,
        rushing_touchdowns: 6,
        rushing_yards: 0.1,
        receiving_touchdowns: 6,
        receiving_yards: 0.1,
        receiving_receptions: 0, // Standard (no PPR)
        fumbles_lost: -2,
      };

      it('should calculate QB scoring correctly', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_yards: 300,
          passing_touchdowns: 3,
          passing_interceptions: 1,
          rushing_yards: 20,
          rushing_touchdowns: 0,
        };

        // 300 * 0.04 = 12
        // 3 * 4 = 12
        // 1 * -2 = -2
        // 20 * 0.1 = 2
        // Total: 24
        const points = calculateFantasyPoints(stats as PlayerStats, standardScoring);
        expect(points).toBe(24);
      });

      it('should calculate RB scoring correctly', () => {
        const stats = {
          player_id: 2001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          rushing_yards: 120,
          rushing_touchdowns: 2,
          receiving_yards: 30,
          receiving_receptions: 4,
          receiving_touchdowns: 0,
          fumbles_lost: 1,
        };

        // 120 * 0.1 = 12
        // 2 * 6 = 12
        // 30 * 0.1 = 3
        // 4 * 0 = 0 (standard, no PPR)
        // 1 * -2 = -2
        // Total: 25
        const points = calculateFantasyPoints(stats as PlayerStats, standardScoring);
        expect(points).toBe(25);
      });

      it('should calculate WR scoring correctly', () => {
        const stats = {
          player_id: 3001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 150,
          receiving_receptions: 10,
          receiving_touchdowns: 2,
        };

        // 150 * 0.1 = 15
        // 10 * 0 = 0 (standard)
        // 2 * 6 = 12
        // Total: 27
        const points = calculateFantasyPoints(stats as PlayerStats, standardScoring);
        expect(points).toBe(27);
      });
    });

    describe('PPR Scoring', () => {
      const pprScoring: ScoringSettings = {
        passing_touchdowns: 4,
        passing_yards: 0.04,
        rushing_touchdowns: 6,
        rushing_yards: 0.1,
        receiving_touchdowns: 6,
        receiving_yards: 0.1,
        receiving_receptions: 1, // Full PPR
      };

      it('should add 1 point per reception in PPR', () => {
        const stats = {
          player_id: 3001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 80,
          receiving_receptions: 8,
          receiving_touchdowns: 1,
        };

        // 80 * 0.1 = 8
        // 8 * 1 = 8 (PPR)
        // 1 * 6 = 6
        // Total: 22
        const points = calculateFantasyPoints(stats as PlayerStats, pprScoring);
        expect(points).toBe(22);
      });
    });

    describe('Half-PPR Scoring', () => {
      const halfPprScoring: ScoringSettings = {
        receiving_yards: 0.1,
        receiving_receptions: 0.5, // Half PPR
        receiving_touchdowns: 6,
      };

      it('should add 0.5 points per reception in half-PPR', () => {
        const stats = {
          player_id: 3001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 100,
          receiving_receptions: 6,
          receiving_touchdowns: 0,
        };

        // 100 * 0.1 = 10
        // 6 * 0.5 = 3 (half-PPR)
        // Total: 13
        const points = calculateFantasyPoints(stats as PlayerStats, halfPprScoring);
        expect(points).toBe(13);
      });
    });

    describe('Tiered PPR (Nested Scoring)', () => {
      const tieredPprScoring: ScoringSettings = {
        receiving: {
          rec_yd: 0.1,
          rec_td: 6,
          rec: 1, // Default
          tiered_ppr: {
            enabled: true,
            rb: 0.5, // RBs get 0.5 per catch
            wr: 1,   // WRs get 1 per catch
            te: 1.5, // TEs get 1.5 per catch (TE premium)
          },
        },
      };

      it('should apply RB-specific PPR value', () => {
        const stats = {
          player_id: 2001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 50,
          receiving_receptions: 5,
          receiving_touchdowns: 0,
        };

        // 50 * 0.1 = 5
        // 5 * 0.5 = 2.5 (RB tiered PPR)
        // Total: 7.5
        const points = calculateFantasyPoints(stats as PlayerStats, tieredPprScoring, 'RB');
        expect(points).toBe(7.5);
      });

      it('should apply TE-premium PPR value', () => {
        const stats = {
          player_id: 4001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 80,
          receiving_receptions: 6,
          receiving_touchdowns: 1,
        };

        // 80 * 0.1 = 8
        // 6 * 1.5 = 9 (TE premium)
        // 1 * 6 = 6
        // Total: 23
        const points = calculateFantasyPoints(stats as PlayerStats, tieredPprScoring, 'TE');
        expect(points).toBe(23);
      });

      it('should apply WR PPR value', () => {
        const stats = {
          player_id: 3001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 100,
          receiving_receptions: 8,
          receiving_touchdowns: 0,
        };

        // 100 * 0.1 = 10
        // 8 * 1 = 8 (WR standard PPR)
        // Total: 18
        const points = calculateFantasyPoints(stats as PlayerStats, tieredPprScoring, 'WR');
        expect(points).toBe(18);
      });
    });

    describe('Bonus Scoring (Nested Structure)', () => {
      const bonusScoring: ScoringSettings = {
        passing: {
          pass_yd: 0.04,
          pass_td: 4,
          pass_300_bonus: 3, // 300+ yard bonus
        },
        rushing: {
          rush_yd: 0.1,
          rush_td: 6,
          rush_100_bonus: 2, // 100+ yard bonus
        },
        receiving: {
          rec_yd: 0.1,
          rec_td: 6,
          rec: 1,
          rec_100_bonus: 2, // 100+ yard bonus
        },
      };

      it('should apply 300 yard passing bonus', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_yards: 325,
          passing_touchdowns: 2,
        };

        // 325 * 0.04 = 13
        // 2 * 4 = 8
        // 300+ bonus = 3
        // Total: 24
        const points = calculateFantasyPoints(stats as PlayerStats, bonusScoring);
        expect(points).toBe(24);
      });

      it('should not apply 300 yard bonus for 299 yards', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_yards: 299,
          passing_touchdowns: 2,
        };

        // 299 * 0.04 = 11.96
        // 2 * 4 = 8
        // No bonus
        // Total: 19.96
        const points = calculateFantasyPoints(stats as PlayerStats, bonusScoring);
        expect(points).toBe(19.96);
      });

      it('should apply 100 yard rushing bonus', () => {
        const stats = {
          player_id: 2001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          rushing_yards: 125,
          rushing_touchdowns: 1,
        };

        // 125 * 0.1 = 12.5
        // 1 * 6 = 6
        // 100+ bonus = 2
        // Total: 20.5
        const points = calculateFantasyPoints(stats as PlayerStats, bonusScoring);
        expect(points).toBe(20.5);
      });

      it('should apply 100 yard receiving bonus', () => {
        const stats = {
          player_id: 3001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          receiving_yards: 150,
          receiving_receptions: 8,
          receiving_touchdowns: 1,
        };

        // 150 * 0.1 = 15
        // 8 * 1 = 8
        // 1 * 6 = 6
        // 100+ bonus = 2
        // Total: 31
        const points = calculateFantasyPoints(stats as PlayerStats, bonusScoring);
        expect(points).toBe(31);
      });
    });

    describe('Kicking Scoring', () => {
      const kickingScoring: ScoringSettings = {
        field_goals_made_0_19: 3,
        field_goals_made_20_29: 3,
        field_goals_made_30_39: 3,
        field_goals_made_40_49: 4,
        field_goals_made_50_plus: 5,
        extra_points_made: 1,
        field_goals_missed: -1,
        extra_points_missed: -1,
      };

      it('should calculate distance-based field goal scoring', () => {
        const stats = {
          player_id: 5001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          field_goals_made_0_19: 0,
          field_goals_made_20_29: 1,
          field_goals_made_30_39: 2,
          field_goals_made_40_49: 1,
          field_goals_made_50_plus: 1,
          extra_points_made: 4,
        };

        // 1 * 3 = 3 (20-29)
        // 2 * 3 = 6 (30-39)
        // 1 * 4 = 4 (40-49)
        // 1 * 5 = 5 (50+)
        // 4 * 1 = 4 (XP)
        // Total: 22
        const points = calculateFantasyPoints(stats as PlayerStats, kickingScoring);
        expect(points).toBe(22);
      });

      it('should calculate field goal misses correctly', () => {
        const stats = {
          player_id: 5001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          field_goals_made: 2,
          field_goals_attempted: 5, // 3 misses
          field_goals_made_30_39: 2,
          extra_points_made: 2,
          extra_points_attempted: 3, // 1 miss
        };

        // 2 * 3 = 6 (FG made)
        // 3 * -1 = -3 (FG missed)
        // 2 * 1 = 2 (XP made)
        // 1 * -1 = -1 (XP missed)
        // Total: 4
        const points = calculateFantasyPoints(stats as PlayerStats, kickingScoring);
        expect(points).toBe(4);
      });
    });

    describe('Defense/ST Scoring', () => {
      const defenseScoring: ScoringSettings = {
        defensive_touchdowns: 6,
        special_teams_touchdowns: 6,
        defensive_interceptions: 2,
        defensive_fumbles_recovered: 2,
        defensive_sacks: 1,
        defensive_safeties: 2,
      };

      it('should calculate defense scoring correctly', () => {
        const stats = {
          player_id: 9001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          defensive_touchdowns: 1,
          special_teams_touchdowns: 1,
          defensive_interceptions: 2,
          defensive_fumbles_recovered: 1,
          defensive_sacks: 4,
          defensive_safeties: 0,
        };

        // 1 * 6 = 6 (def TD)
        // 1 * 6 = 6 (ST TD)
        // 2 * 2 = 4 (INT)
        // 1 * 2 = 2 (fumble recovery)
        // 4 * 1 = 4 (sacks)
        // Total: 22
        const points = calculateFantasyPoints(stats as PlayerStats, defenseScoring);
        expect(points).toBe(22);
      });
    });

    describe('IDP Scoring', () => {
      const idpScoring: ScoringSettings = {
        tackles_solo: 1,
        tackles_assisted: 0.5,
        tackles_for_loss: 1,
        quarterback_hits: 1,
        passes_defended: 1,
        defensive_sacks: 2,
        defensive_interceptions: 3,
      };

      it('should calculate IDP scoring correctly', () => {
        const stats = {
          player_id: 8001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          tackles_solo: 8,
          tackles_assisted: 4,
          tackles_for_loss: 2,
          quarterback_hits: 1,
          passes_defended: 1,
          defensive_sacks: 1,
          defensive_interceptions: 0,
        };

        // 8 * 1 = 8 (solo tackles)
        // 4 * 0.5 = 2 (assisted)
        // 2 * 1 = 2 (TFL)
        // 1 * 1 = 1 (QB hits)
        // 1 * 1 = 1 (PD)
        // 1 * 2 = 2 (sacks)
        // Total: 16
        const points = calculateFantasyPoints(stats as PlayerStats, idpScoring);
        expect(points).toBe(16);
      });
    });

    describe('2-Point Conversions', () => {
      const scoringWith2PT: ScoringSettings = {
        passing_touchdowns: 4,
        passing_2pt_conversions: 2,
        rushing_touchdowns: 6,
        rushing_2pt_conversions: 2,
        receiving_touchdowns: 6,
        receiving_2pt_conversions: 2,
      };

      it('should calculate passing 2PT conversions', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_touchdowns: 2,
          passing_2pt_conversions: 1,
        };

        // 2 * 4 = 8
        // 1 * 2 = 2
        // Total: 10
        const points = calculateFantasyPoints(stats as PlayerStats, scoringWith2PT);
        expect(points).toBe(10);
      });

      it('should calculate rushing and receiving 2PT conversions', () => {
        const stats = {
          player_id: 2001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          rushing_touchdowns: 1,
          rushing_2pt_conversions: 1,
          receiving_touchdowns: 1,
          receiving_2pt_conversions: 1,
        };

        // 1 * 6 = 6 (rush TD)
        // 1 * 2 = 2 (rush 2PT)
        // 1 * 6 = 6 (rec TD)
        // 1 * 2 = 2 (rec 2PT)
        // Total: 16
        const points = calculateFantasyPoints(stats as PlayerStats, scoringWith2PT);
        expect(points).toBe(16);
      });
    });

    describe('Edge Cases', () => {
      const basicScoring: ScoringSettings = {
        passing_yards: 0.04,
        rushing_yards: 0.1,
        receiving_yards: 0.1,
      };

      it('should handle zero stats', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_yards: 0,
          rushing_yards: 0,
          receiving_yards: 0,
        };

        const points = calculateFantasyPoints(stats as PlayerStats, basicScoring);
        expect(points).toBe(0);
      });

      it('should handle undefined stats gracefully', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          // No stat fields defined
        };

        const points = calculateFantasyPoints(stats as PlayerStats, basicScoring);
        expect(points).toBe(0);
      });

      it('should round to 2 decimal places', () => {
        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_yards: 333, // 333 * 0.04 = 13.32
        };

        const points = calculateFantasyPoints(stats as PlayerStats, basicScoring);
        expect(points).toBe(13.32);
      });

      it('should handle negative scores', () => {
        const scoringWithNegatives: ScoringSettings = {
          passing_interceptions: -2,
          fumbles_lost: -2,
        };

        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_interceptions: 3,
          fumbles_lost: 2,
        };

        // 3 * -2 = -6
        // 2 * -2 = -4
        // Total: -10
        const points = calculateFantasyPoints(stats as PlayerStats, scoringWithNegatives);
        expect(points).toBe(-10);
      });
    });

    describe('Mixed Flat and Nested Scoring', () => {
      it('should prefer nested structure when both exist', () => {
        const mixedScoring: ScoringSettings = {
          // Flat (should be ignored)
          passing_touchdowns: 4,
          passing_yards: 0.04,

          // Nested (should be used)
          passing: {
            pass_td: 6, // Different value
            pass_yd: 0.05, // Different value
          },
        };

        const stats = {
          player_id: 1001,
          season: '2025',
          week: 1,
          season_type: 'regular',
          passing_yards: 200,
          passing_touchdowns: 2,
        };

        // Should use nested: 200 * 0.05 + 2 * 6 = 10 + 12 = 22
        // Not flat: 200 * 0.04 + 2 * 4 = 8 + 8 = 16
        const points = calculateFantasyPoints(stats as PlayerStats, mixedScoring);
        expect(points).toBe(22);
      });
    });
  });

  describe('calculateRosterScore', () => {
    let testSeason = '2025';
    let testWeek = 1;

    beforeAll(async () => {
      const uniqueCode = `SS${Date.now().toString().slice(-7)}`;

      // Cleanup
      await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'SS%'`);

      // Create test league
      await pool.query(
        `INSERT INTO leagues (name, status, season, season_type, league_type, total_rosters,
          settings, scoring_settings, roster_positions, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          'Scoring Test League',
          'in_season',
          testSeason,
          'regular',
          'redraft',
          2,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([]),
          uniqueCode
        ]
      );

      // Create test players and their stats
      const testPlayerIds = [7001, 7002, 7003];

      for (const playerId of testPlayerIds) {
        await pool.query(
          `INSERT INTO players (player_id, full_name, position, team)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (player_id) DO NOTHING`,
          [playerId, `Player ${playerId}`, 'RB', 'TEST']
        );

        // Insert stats for week 1
        await pool.query(
          `INSERT INTO player_stats (player_id, season, week, season_type, rushing_yards, rushing_touchdowns)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (player_id, season, week, season_type) DO UPDATE
           SET rushing_yards = EXCLUDED.rushing_yards, rushing_touchdowns = EXCLUDED.rushing_touchdowns`,
          [playerId, testSeason, testWeek, 'regular', 50 + playerId % 100, 1]
        );
      }
    });

    afterAll(async () => {
      await pool.query(`DELETE FROM leagues WHERE invite_code LIKE 'SS%'`);
    });

    it('should aggregate points for multiple players', async () => {
      const scoringSettings: ScoringSettings = {
        rushing_yards: 0.1,
        rushing_touchdowns: 6,
      };

      const starterPlayerIds = [7001, 7002, 7003];

      const totalScore = await calculateRosterScore(
        starterPlayerIds,
        testWeek,
        testSeason,
        scoringSettings
      );

      // Player 7001: 51 yards = 5.1, 1 TD = 6 → 11.1
      // Player 7002: 52 yards = 5.2, 1 TD = 6 → 11.2
      // Player 7003: 53 yards = 5.3, 1 TD = 6 → 11.3
      // Total: 33.6
      expect(totalScore).toBeCloseTo(33.6, 1);
    });

    it('should return 0 for empty starter list', async () => {
      const scoringSettings: ScoringSettings = {
        rushing_yards: 0.1,
        rushing_touchdowns: 6,
      };

      const totalScore = await calculateRosterScore(
        [],
        testWeek,
        testSeason,
        scoringSettings
      );

      expect(totalScore).toBe(0);
    });
  });
});
