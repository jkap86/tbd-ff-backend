-- Expand scoring_settings column documentation to include advanced scoring categories
-- This migration doesn't change the schema but documents the expanded structure

-- Update the comment on the scoring_settings column to include all advanced options
COMMENT ON COLUMN leagues.scoring_settings IS 'JSONB scoring rules. Supports both flat structure (legacy) and nested structure (recommended). Example nested structure:
{
  "passing": {
    "pass_yd": 0.04,
    "pass_td": 4,
    "pass_int": -2,
    "pass_2pt": 2,
    "pass_first_down": 0.5,
    "pass_40plus": 2,
    "pass_300_bonus": 3
  },
  "rushing": {
    "rush_yd": 0.1,
    "rush_td": 6,
    "rush_2pt": 2,
    "rush_first_down": 0.5,
    "rush_40plus": 2,
    "rush_100_bonus": 3
  },
  "receiving": {
    "rec": 1,
    "rec_yd": 0.1,
    "rec_td": 6,
    "rec_2pt": 2,
    "rec_first_down": 0.5,
    "rec_40plus": 2,
    "rec_100_bonus": 3,
    "tiered_ppr": {
      "enabled": false,
      "rb": 0.5,
      "wr": 1.0,
      "te": 1.5
    }
  },
  "misc": {
    "fum_lost": -2,
    "fum_rec_td": 6
  },
  "kicking": {
    "fg_0_19": 3,
    "fg_20_29": 3,
    "fg_30_39": 3,
    "fg_40_49": 4,
    "fg_50plus": 5,
    "fg_miss": -1,
    "xp": 1,
    "xp_miss": -1
  },
  "defense": {
    "pts_allow_0": 10,
    "pts_allow_1_6": 7,
    "pts_allow_7_13": 4,
    "pts_allow_14_20": 1,
    "pts_allow_21_27": 0,
    "pts_allow_28_34": -1,
    "pts_allow_35plus": -4,
    "sack": 1,
    "int": 2,
    "fum_rec": 2,
    "safety": 2,
    "td": 6,
    "blk": 2
  }
}

Legacy flat structure is still supported (maps to ScoringSettings interface):
{
  "passing_yards": 0.04,
  "passing_touchdowns": 4,
  "passing_interceptions": -2,
  "rushing_yards": 0.1,
  "rushing_touchdowns": 6,
  "receiving_receptions": 1,
  "receiving_yards": 0.1,
  "receiving_touchdowns": 6,
  "fumbles_lost": -2
}';
