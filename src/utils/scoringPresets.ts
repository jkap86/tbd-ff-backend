/**
 * Common scoring presets for fantasy football leagues
 * These can be used as starting points when creating new leagues
 */

export const SCORING_PRESETS = {
  standard: {
    name: "Standard",
    description: "Traditional scoring without PPR",
    settings: {
      passing_yards: 0.04,
      passing_touchdowns: 4,
      passing_interceptions: -2,
      passing_2pt_conversions: 2,

      rushing_yards: 0.1,
      rushing_touchdowns: 6,
      rushing_2pt_conversions: 2,

      receiving_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_receptions: 0, // No PPR
      receiving_2pt_conversions: 2,

      fumbles_lost: -2,

      // Kicking
      field_goals_made_0_19: 3,
      field_goals_made_20_29: 3,
      field_goals_made_30_39: 3,
      field_goals_made_40_49: 4,
      field_goals_made_50_plus: 5,
      extra_points_made: 1,
      field_goals_missed: -1,
      extra_points_missed: -1,
    },
  },

  ppr: {
    name: "PPR (Point Per Reception)",
    description: "Full point per reception",
    settings: {
      passing_yards: 0.04,
      passing_touchdowns: 4,
      passing_interceptions: -2,
      passing_2pt_conversions: 2,

      rushing_yards: 0.1,
      rushing_touchdowns: 6,
      rushing_2pt_conversions: 2,

      receiving_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_receptions: 1, // Full PPR
      receiving_2pt_conversions: 2,

      fumbles_lost: -2,

      // Kicking
      field_goals_made_0_19: 3,
      field_goals_made_20_29: 3,
      field_goals_made_30_39: 3,
      field_goals_made_40_49: 4,
      field_goals_made_50_plus: 5,
      extra_points_made: 1,
      field_goals_missed: -1,
      extra_points_missed: -1,
    },
  },

  halfPPR: {
    name: "Half PPR",
    description: "Half point per reception",
    settings: {
      passing_yards: 0.04,
      passing_touchdowns: 4,
      passing_interceptions: -2,
      passing_2pt_conversions: 2,

      rushing_yards: 0.1,
      rushing_touchdowns: 6,
      rushing_2pt_conversions: 2,

      receiving_yards: 0.1,
      receiving_touchdowns: 6,
      receiving_receptions: 0.5, // Half PPR
      receiving_2pt_conversions: 2,

      fumbles_lost: -2,

      // Kicking
      field_goals_made_0_19: 3,
      field_goals_made_20_29: 3,
      field_goals_made_30_39: 3,
      field_goals_made_40_49: 4,
      field_goals_made_50_plus: 5,
      extra_points_made: 1,
      field_goals_missed: -1,
      extra_points_missed: -1,
    },
  },

  tieredPPR: {
    name: "Tiered PPR (TE Premium)",
    description: "Different PPR values by position - favors tight ends",
    settings: {
      passing: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
      },
      rushing: {
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
      },
      receiving: {
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        tiered_ppr: {
          enabled: true,
          rb: 0.5,
          wr: 1.0,
          te: 1.5,
        },
      },
    },
  },

  firstDowns: {
    name: "First Down Scoring",
    description: "Rewards first down conversions in addition to standard scoring",
    settings: {
      passing: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        pass_first_down: 0.5,
      },
      rushing: {
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rush_first_down: 0.5,
      },
      receiving: {
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        rec_first_down: 0.5,
      },
    },
  },

  bigPlayBonuses: {
    name: "Big Play Bonuses",
    description: "Rewards 40+ yard plays and milestone bonuses",
    settings: {
      passing: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        pass_40plus: 2, // 2 points per 40+ yard completion
        pass_300_bonus: 3, // 3 point bonus for 300+ passing yards
      },
      rushing: {
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rush_40plus: 2, // 2 points per 40+ yard rush
        rush_100_bonus: 3, // 3 point bonus for 100+ rushing yards
      },
      receiving: {
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        rec_40plus: 2, // 2 points per 40+ yard reception
        rec_100_bonus: 3, // 3 point bonus for 100+ receiving yards
      },
    },
  },

  advanced: {
    name: "Advanced Scoring",
    description: "Combines tiered PPR, first downs, and big play bonuses",
    settings: {
      passing: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        pass_first_down: 0.5,
        pass_40plus: 2,
        pass_300_bonus: 3,
      },
      rushing: {
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rush_first_down: 0.5,
        rush_40plus: 2,
        rush_100_bonus: 3,
      },
      receiving: {
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        rec_first_down: 0.5,
        rec_40plus: 2,
        rec_100_bonus: 3,
        tiered_ppr: {
          enabled: true,
          rb: 0.5,
          wr: 1.0,
          te: 1.5,
        },
      },
    },
  },
};

/**
 * Get a scoring preset by name
 */
export function getScoringPreset(presetName: string) {
  const preset = SCORING_PRESETS[presetName as keyof typeof SCORING_PRESETS];
  if (!preset) {
    throw new Error(`Unknown scoring preset: ${presetName}`);
  }
  return preset;
}

/**
 * Get all available scoring preset names
 */
export function getAvailablePresets(): string[] {
  return Object.keys(SCORING_PRESETS);
}

/**
 * Get all scoring presets with metadata
 */
export function getAllPresets() {
  return SCORING_PRESETS;
}
