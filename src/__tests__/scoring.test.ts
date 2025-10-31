/**
 * Scoring System Comprehensive Tests
 * Tests all scoring calculations, point systems, and matchup score updates
 */

import {
  calculateFantasyPoints,
  ScoringSettings,
} from '../services/scoringService';

describe('Scoring System - Comprehensive Tests', () => {
  describe('calculateFantasyPoints - Standard Scoring', () => {
    const standardScoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_yards: 0.04, // 1 point per 25 yards
      passing_interceptions: -2,
      rushing_touchdowns: 6,
      rushing_yards: 0.1, // 1 point per 10 yards
      receiving_touchdowns: 6,
      receiving_yards: 0.1,
      receiving_receptions: 0, // Standard (no PPR)
      fumbles_lost: -2,
    };

    it('should calculate QB standard scoring correctly', () => {
      const qbStats = {
        passing_yards: 300, // 12 points
        passing_touchdowns: 3, // 12 points
        passing_interceptions: 1, // -2 points
        rushing_yards: 20, // 2 points
        rushing_touchdowns: 0,
      };

      const points = calculateFantasyPoints(qbStats as any, standardScoring);
      expect(points).toBe(24); // 12 + 12 - 2 + 2
    });

    it('should calculate RB standard scoring correctly', () => {
      const rbStats = {
        rushing_yards: 120, // 12 points
        rushing_touchdowns: 2, // 12 points
        receiving_yards: 30, // 3 points
        receiving_receptions: 3, // 0 points (standard)
        receiving_touchdowns: 0,
        fumbles_lost: 1, // -2 points
      };

      const points = calculateFantasyPoints(rbStats as any, standardScoring);
      expect(points).toBe(25); // 12 + 12 + 3 + 0 - 2
    });

    it('should calculate WR standard scoring correctly', () => {
      const wrStats = {
        receiving_yards: 100, // 10 points
        receiving_receptions: 8, // 0 points (standard)
        receiving_touchdowns: 1, // 6 points
        rushing_yards: 10, // 1 point
        rushing_touchdowns: 0,
      };

      const points = calculateFantasyPoints(wrStats as any, standardScoring);
      expect(points).toBe(17); // 10 + 0 + 6 + 1
    });

    it('should handle zero stats', () => {
      const emptyStats = {};
      const points = calculateFantasyPoints(emptyStats as any, standardScoring);
      expect(points).toBe(0);
    });

    it('should handle negative points from turnovers', () => {
      const turnoverStats = {
        passing_yards: 250, // 10 points
        passing_touchdowns: 2, // 8 points
        passing_interceptions: 4, // -8 points
        fumbles_lost: 2, // -4 points
      };

      const points = calculateFantasyPoints(turnoverStats as any, standardScoring);
      expect(points).toBe(6); // 10 + 8 - 8 - 4
    });
  });

  describe('calculateFantasyPoints - PPR Scoring', () => {
    const pprScoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_yards: 0.04,
      passing_interceptions: -2,
      rushing_touchdowns: 6,
      rushing_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_yards: 0.1,
      receiving_receptions: 1, // Full PPR
      fumbles_lost: -2,
    };

    it('should award 1 point per reception in PPR', () => {
      const wrStats = {
        receiving_receptions: 10, // 10 points
        receiving_yards: 80, // 8 points
        receiving_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(wrStats as any, pprScoring);
      expect(points).toBe(24); // 10 + 8 + 6
    });

    it('should significantly boost pass-catching RB value', () => {
      const rbStats = {
        rushing_yards: 50, // 5 points
        rushing_touchdowns: 0,
        receiving_receptions: 8, // 8 points
        receiving_yards: 60, // 6 points
        receiving_touchdowns: 0,
      };

      const points = calculateFantasyPoints(rbStats as any, pprScoring);
      expect(points).toBe(19); // 5 + 8 + 6
    });
  });

  describe('calculateFantasyPoints - Half PPR', () => {
    const halfPprScoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_yards: 0.04,
      rushing_touchdowns: 6,
      rushing_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_yards: 0.1,
      receiving_receptions: 0.5, // Half PPR
    };

    it('should award 0.5 points per reception in Half PPR', () => {
      const wrStats = {
        receiving_receptions: 10, // 5 points
        receiving_yards: 100, // 10 points
        receiving_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(wrStats as any, halfPprScoring);
      expect(points).toBe(21); // 5 + 10 + 6
    });
  });

  describe('calculateFantasyPoints - Tiered PPR', () => {
    const tieredPprScoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_yards: 0.04,
      rushing_touchdowns: 6,
      rushing_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_yards: 0.1,
      receiving: {
        rec_yd: 0.1,
        rec_td: 6,
        tiered_ppr: {
          enabled: true,
          rb: 0.5,
          wr: 1.0,
          te: 1.5,
        },
      },
    };

    it('should award different PPR values based on position - RB', () => {
      const rbStats = {
        receiving_receptions: 6, // 3 points (0.5 * 6)
        receiving_yards: 40, // 4 points
      };

      const points = calculateFantasyPoints(rbStats as any, tieredPprScoring, 'RB');
      expect(points).toBe(7); // 3 + 4
    });

    it('should award different PPR values based on position - WR', () => {
      const wrStats = {
        receiving_receptions: 6, // 6 points (1.0 * 6)
        receiving_yards: 40, // 4 points
      };

      const points = calculateFantasyPoints(wrStats as any, tieredPprScoring, 'WR');
      expect(points).toBe(10); // 6 + 4
    });

    it('should award different PPR values based on position - TE', () => {
      const teStats = {
        receiving_receptions: 6, // 9 points (1.5 * 6)
        receiving_yards: 40, // 4 points
      };

      const points = calculateFantasyPoints(teStats as any, tieredPprScoring, 'TE');
      expect(points).toBe(13); // 9 + 4
    });
  });

  describe('calculateFantasyPoints - Kicker Scoring', () => {
    const kickerScoring: ScoringSettings = {
      field_goals_made_0_19: 3,
      field_goals_made_20_29: 3,
      field_goals_made_30_39: 3,
      field_goals_made_40_49: 4,
      field_goals_made_50_plus: 5,
      extra_points_made: 1,
      field_goals_missed: -1,
      extra_points_missed: -1,
    };

    it('should calculate kicker scoring with various field goal distances', () => {
      const kStats = {
        field_goals_made_0_19: 0,
        field_goals_made_20_29: 1, // 3 points
        field_goals_made_30_39: 2, // 6 points
        field_goals_made_40_49: 1, // 4 points
        field_goals_made_50_plus: 1, // 5 points
        extra_points_made: 4, // 4 points
      };

      const points = calculateFantasyPoints(kStats as any, kickerScoring);
      expect(points).toBe(22); // 3 + 6 + 4 + 5 + 4
    });

    it('should penalize missed field goals', () => {
      const kStats = {
        field_goals_attempted: 4,
        field_goals_made: 2, // 2 missed = -2 points
        field_goals_made_30_39: 2, // 6 points
        extra_points_made: 3, // 3 points
      };

      const points = calculateFantasyPoints(kStats as any, kickerScoring);
      expect(points).toBe(7); // 6 + 3 - 2
    });

    it('should penalize missed extra points', () => {
      const kStats = {
        extra_points_attempted: 5,
        extra_points_made: 4, // 1 missed = -1 point
        field_goals_made_40_49: 2, // 8 points
      };

      const points = calculateFantasyPoints(kStats as any, kickerScoring);
      expect(points).toBe(11); // 8 + 4 - 1
    });
  });

  describe('calculateFantasyPoints - Defense/ST Scoring', () => {
    const defenseScoring: ScoringSettings = {
      defensive_touchdowns: 6,
      special_teams_touchdowns: 6,
      defensive_interceptions: 2,
      defensive_fumbles_recovered: 2,
      defensive_sacks: 1,
      defensive_safeties: 2,
    };

    it('should calculate defense scoring correctly', () => {
      const defStats = {
        defensive_sacks: 5, // 5 points
        defensive_interceptions: 2, // 4 points
        defensive_fumbles_recovered: 1, // 2 points
        defensive_touchdowns: 1, // 6 points
        defensive_safeties: 0,
      };

      const points = calculateFantasyPoints(defStats as any, defenseScoring);
      expect(points).toBe(17); // 5 + 4 + 2 + 6
    });

    it('should award points for special teams touchdowns', () => {
      const defStats = {
        special_teams_touchdowns: 1, // 6 points
        defensive_touchdowns: 0,
        defensive_sacks: 3, // 3 points
        defensive_interceptions: 1, // 2 points
      };

      const points = calculateFantasyPoints(defStats as any, defenseScoring);
      expect(points).toBe(11); // 6 + 3 + 2
    });
  });

  describe('calculateFantasyPoints - Advanced Scoring (Bonuses)', () => {
    const advancedScoring: ScoringSettings = {
      passing: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_300_bonus: 3, // Bonus for 300+ yards
      },
      rushing: {
        rush_yd: 0.1,
        rush_td: 6,
        rush_100_bonus: 3, // Bonus for 100+ yards
      },
      receiving: {
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        rec_100_bonus: 3, // Bonus for 100+ yards
      },
    };

    it('should award 300-yard passing bonus', () => {
      const qbStats = {
        passing_yards: 350, // 14 points + 3 bonus
        passing_touchdowns: 2, // 8 points
      };

      const points = calculateFantasyPoints(qbStats as any, advancedScoring);
      expect(points).toBe(25); // 14 + 3 + 8
    });

    it('should NOT award 300-yard bonus for 299 yards', () => {
      const qbStats = {
        passing_yards: 299, // 11.96 points, no bonus
        passing_touchdowns: 2, // 8 points
      };

      const points = calculateFantasyPoints(qbStats as any, advancedScoring);
      expect(points).toBe(19.96); // 11.96 + 8
    });

    it('should award 100-yard rushing bonus', () => {
      const rbStats = {
        rushing_yards: 125, // 12.5 points + 3 bonus
        rushing_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(rbStats as any, advancedScoring);
      expect(points).toBe(21.5); // 12.5 + 3 + 6
    });

    it('should award 100-yard receiving bonus', () => {
      const wrStats = {
        receiving_yards: 150, // 15 points + 3 bonus
        receiving_receptions: 8, // 8 points
        receiving_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(wrStats as any, advancedScoring);
      expect(points).toBe(32); // 15 + 3 + 8 + 6
    });
  });

  describe('calculateFantasyPoints - 2-Point Conversions', () => {
    const scoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_2pt_conversions: 2,
      rushing_touchdowns: 6,
      rushing_2pt_conversions: 2,
      receiving_touchdowns: 6,
      receiving_2pt_conversions: 2,
    };

    it('should award points for passing 2-point conversion', () => {
      const qbStats = {
        passing_touchdowns: 2, // 8 points
        passing_2pt_conversions: 1, // 2 points
      };

      const points = calculateFantasyPoints(qbStats as any, scoring);
      expect(points).toBe(10);
    });

    it('should award points for rushing 2-point conversion', () => {
      const rbStats = {
        rushing_touchdowns: 1, // 6 points
        rushing_2pt_conversions: 1, // 2 points
      };

      const points = calculateFantasyPoints(rbStats as any, scoring);
      expect(points).toBe(8);
    });

    it('should award points for receiving 2-point conversion', () => {
      const wrStats = {
        receiving_touchdowns: 1, // 6 points
        receiving_2pt_conversions: 1, // 2 points
      };

      const points = calculateFantasyPoints(wrStats as any, scoring);
      expect(points).toBe(8);
    });
  });

  describe('calculateFantasyPoints - Edge Cases', () => {
    const scoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_yards: 0.04,
      rushing_touchdowns: 6,
      rushing_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_yards: 0.1,
      receiving_receptions: 1,
    };

    it('should round to 2 decimal places', () => {
      const stats = {
        passing_yards: 333, // 13.32 points
      };

      const points = calculateFantasyPoints(stats as any, scoring);
      expect(points).toBe(13.32);
    });

    it('should handle fractional yards correctly', () => {
      const stats = {
        rushing_yards: 95, // 9.5 points
        receiving_yards: 47, // 4.7 points
      };

      const points = calculateFantasyPoints(stats as any, scoring);
      expect(points).toBe(14.2); // 9.5 + 4.7
    });

    it('should handle massive stat lines', () => {
      const stats = {
        passing_yards: 500, // 20 points
        passing_touchdowns: 7, // 28 points
        rushing_yards: 50, // 5 points
        rushing_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(stats as any, scoring);
      expect(points).toBe(59); // 20 + 28 + 5 + 6
    });

    it('should handle player with stats in multiple categories', () => {
      // Example: Taysom Hill (QB/TE hybrid)
      const hybridStats = {
        passing_yards: 150, // 6 points
        passing_touchdowns: 1, // 4 points
        rushing_yards: 40, // 4 points
        rushing_touchdowns: 1, // 6 points
        receiving_receptions: 2, // 2 points
        receiving_yards: 20, // 2 points
      };

      const points = calculateFantasyPoints(hybridStats as any, scoring);
      expect(points).toBe(24); // 6 + 4 + 4 + 6 + 2 + 2
    });
  });

  describe('calculateFantasyPoints - Real NFL Stat Lines', () => {
    const standardPprScoring: ScoringSettings = {
      passing_touchdowns: 4,
      passing_yards: 0.04,
      passing_interceptions: -2,
      rushing_touchdowns: 6,
      rushing_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_yards: 0.1,
      receiving_receptions: 1,
      fumbles_lost: -2,
    };

    it('should calculate Patrick Mahomes typical game (2023)', () => {
      // Example: 325 pass yards, 3 TDs, 0 INT, 15 rush yards
      const stats = {
        passing_yards: 325, // 13 points
        passing_touchdowns: 3, // 12 points
        passing_interceptions: 0,
        rushing_yards: 15, // 1.5 points
      };

      const points = calculateFantasyPoints(stats as any, standardPprScoring);
      expect(points).toBe(26.5);
    });

    it('should calculate Christian McCaffrey typical game', () => {
      // Example: 80 rush yards, 1 rush TD, 6 rec, 50 rec yards, 1 rec TD
      const stats = {
        rushing_yards: 80, // 8 points
        rushing_touchdowns: 1, // 6 points
        receiving_receptions: 6, // 6 points
        receiving_yards: 50, // 5 points
        receiving_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(stats as any, standardPprScoring);
      expect(points).toBe(31);
    });

    it('should calculate Justin Jefferson typical game', () => {
      // Example: 9 rec, 120 yards, 1 TD
      const stats = {
        receiving_receptions: 9, // 9 points
        receiving_yards: 120, // 12 points
        receiving_touchdowns: 1, // 6 points
      };

      const points = calculateFantasyPoints(stats as any, standardPprScoring);
      expect(points).toBe(27);
    });
  });

  describe('calculateFantasyPoints - Scoring Preset Compatibility', () => {
    // Test that common preset scoring systems work correctly
    it('should work with ESPN Standard preset', () => {
      const espnStandard: ScoringSettings = {
        passing_yards: 0.04,
        passing_touchdowns: 4,
        passing_interceptions: -2,
        rushing_yards: 0.1,
        rushing_touchdowns: 6,
        receiving_yards: 0.1,
        receiving_touchdowns: 6,
        receiving_receptions: 0, // No PPR
        fumbles_lost: -2,
      };

      const stats = {
        rushing_yards: 100,
        rushing_touchdowns: 1,
      };

      const points = calculateFantasyPoints(stats as any, espnStandard);
      expect(points).toBe(16); // 10 + 6
    });

    it('should work with Yahoo Full PPR preset', () => {
      const yahooFullPpr: ScoringSettings = {
        passing_yards: 0.04,
        passing_touchdowns: 4,
        passing_interceptions: -1, // Yahoo uses -1
        rushing_yards: 0.1,
        rushing_touchdowns: 6,
        receiving_yards: 0.1,
        receiving_touchdowns: 6,
        receiving_receptions: 1, // Full PPR
        fumbles_lost: -2,
      };

      const stats = {
        receiving_receptions: 10,
        receiving_yards: 100,
        receiving_touchdowns: 1,
      };

      const points = calculateFantasyPoints(stats as any, yahooFullPpr);
      expect(points).toBe(26); // 10 + 10 + 6
    });
  });
});
