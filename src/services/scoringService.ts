import { PlayerStats } from "../models/PlayerStats";

export interface ScoringSettings {
  // Legacy flat structure
  passing_touchdowns?: number;
  passing_yards?: number;
  passing_interceptions?: number;
  passing_2pt_conversions?: number;

  rushing_touchdowns?: number;
  rushing_yards?: number;
  rushing_2pt_conversions?: number;

  receiving_touchdowns?: number;
  receiving_yards?: number;
  receiving_receptions?: number; // PPR
  receiving_2pt_conversions?: number;

  fumbles_lost?: number;

  // Kicking
  field_goals_made_0_19?: number;
  field_goals_made_20_29?: number;
  field_goals_made_30_39?: number;
  field_goals_made_40_49?: number;
  field_goals_made_50_plus?: number;
  extra_points_made?: number;
  field_goals_missed?: number;
  extra_points_missed?: number;

  // Defense/ST
  defensive_touchdowns?: number;
  special_teams_touchdowns?: number;
  defensive_interceptions?: number;
  defensive_fumbles_recovered?: number;
  defensive_sacks?: number;
  defensive_safeties?: number;

  // IDP
  tackles_solo?: number;
  tackles_assisted?: number;
  tackles_for_loss?: number;
  quarterback_hits?: number;
  passes_defended?: number;

  // Advanced scoring - nested structure (optional)
  passing?: {
    pass_yd?: number;
    pass_td?: number;
    pass_int?: number;
    pass_2pt?: number;
    pass_first_down?: number;
    pass_40plus?: number;
    pass_300_bonus?: number;
  };
  rushing?: {
    rush_yd?: number;
    rush_td?: number;
    rush_2pt?: number;
    rush_first_down?: number;
    rush_40plus?: number;
    rush_100_bonus?: number;
  };
  receiving?: {
    rec?: number;
    rec_yd?: number;
    rec_td?: number;
    rec_2pt?: number;
    rec_first_down?: number;
    rec_40plus?: number;
    rec_100_bonus?: number;
    tiered_ppr?: {
      enabled: boolean;
      rb?: number;
      wr?: number;
      te?: number;
    };
  };
}

/**
 * Calculate fantasy points for a player based on their stats and league scoring settings
 */
export function calculateFantasyPoints(
  stats: PlayerStats,
  scoringSettings: ScoringSettings,
  playerPosition?: string
): number {
  let points = 0;

  // Passing - check for nested structure first, then fall back to flat structure
  if (scoringSettings.passing) {
    points += (stats.passing_yards || 0) * (scoringSettings.passing.pass_yd || 0);
    points += (stats.passing_touchdowns || 0) * (scoringSettings.passing.pass_td || 0);
    points += (stats.passing_interceptions || 0) * (scoringSettings.passing.pass_int || 0);
    points += (stats.passing_2pt_conversions || 0) * (scoringSettings.passing.pass_2pt || 0);

    // Advanced: Passing first downs
    points += (stats.passing_first_downs || 0) * (scoringSettings.passing.pass_first_down || 0);

    // Advanced: 40+ yard pass bonus
    points += (stats.pass_40plus || 0) * (scoringSettings.passing.pass_40plus || 0);

    // Advanced: 300 yard bonus
    if (scoringSettings.passing.pass_300_bonus && (stats.passing_yards || 0) >= 300) {
      points += scoringSettings.passing.pass_300_bonus;
    }
  } else {
    // Legacy flat structure
    points += (stats.passing_touchdowns || 0) * (scoringSettings.passing_touchdowns || 0);
    points += (stats.passing_yards || 0) * (scoringSettings.passing_yards || 0);
    points += (stats.passing_interceptions || 0) * (scoringSettings.passing_interceptions || 0);
    points += (stats.passing_2pt_conversions || 0) * (scoringSettings.passing_2pt_conversions || 0);
  }

  // Rushing - check for nested structure first, then fall back to flat structure
  if (scoringSettings.rushing) {
    points += (stats.rushing_yards || 0) * (scoringSettings.rushing.rush_yd || 0);
    points += (stats.rushing_touchdowns || 0) * (scoringSettings.rushing.rush_td || 0);
    points += (stats.rushing_2pt_conversions || 0) * (scoringSettings.rushing.rush_2pt || 0);

    // Advanced: Rushing first downs
    points += (stats.rushing_first_downs || 0) * (scoringSettings.rushing.rush_first_down || 0);

    // Advanced: 40+ yard rush bonus
    points += (stats.rush_40plus || 0) * (scoringSettings.rushing.rush_40plus || 0);

    // Advanced: 100 yard bonus
    if (scoringSettings.rushing.rush_100_bonus && (stats.rushing_yards || 0) >= 100) {
      points += scoringSettings.rushing.rush_100_bonus;
    }
  } else {
    // Legacy flat structure
    points += (stats.rushing_touchdowns || 0) * (scoringSettings.rushing_touchdowns || 0);
    points += (stats.rushing_yards || 0) * (scoringSettings.rushing_yards || 0);
    points += (stats.rushing_2pt_conversions || 0) * (scoringSettings.rushing_2pt_conversions || 0);
  }

  // Receiving - check for nested structure first, then fall back to flat structure
  if (scoringSettings.receiving) {
    // Advanced: Tiered PPR
    let receptionPoints = scoringSettings.receiving.rec || 0;

    if (scoringSettings.receiving.tiered_ppr?.enabled && playerPosition) {
      const tierValue = scoringSettings.receiving.tiered_ppr[playerPosition.toLowerCase() as 'rb' | 'wr' | 'te'];
      if (tierValue !== undefined) {
        receptionPoints = tierValue;
      }
    }

    points += (stats.receiving_receptions || 0) * receptionPoints;
    points += (stats.receiving_yards || 0) * (scoringSettings.receiving.rec_yd || 0);
    points += (stats.receiving_touchdowns || 0) * (scoringSettings.receiving.rec_td || 0);
    points += (stats.receiving_2pt_conversions || 0) * (scoringSettings.receiving.rec_2pt || 0);

    // Advanced: Receiving first downs
    points += (stats.receiving_first_downs || 0) * (scoringSettings.receiving.rec_first_down || 0);

    // Advanced: 40+ yard reception bonus
    points += (stats.rec_40plus || 0) * (scoringSettings.receiving.rec_40plus || 0);

    // Advanced: 100 yard bonus
    if (scoringSettings.receiving.rec_100_bonus && (stats.receiving_yards || 0) >= 100) {
      points += scoringSettings.receiving.rec_100_bonus;
    }
  } else {
    // Legacy flat structure
    points += (stats.receiving_touchdowns || 0) * (scoringSettings.receiving_touchdowns || 0);
    points += (stats.receiving_yards || 0) * (scoringSettings.receiving_yards || 0);
    points += (stats.receiving_receptions || 0) * (scoringSettings.receiving_receptions || 0);
    points += (stats.receiving_2pt_conversions || 0) * (scoringSettings.receiving_2pt_conversions || 0);
  }

  // Fumbles
  points += (stats.fumbles_lost || 0) * (scoringSettings.fumbles_lost || 0);

  // Kicking
  points += (stats.field_goals_made_0_19 || 0) * (scoringSettings.field_goals_made_0_19 || 0);
  points += (stats.field_goals_made_20_29 || 0) * (scoringSettings.field_goals_made_20_29 || 0);
  points += (stats.field_goals_made_30_39 || 0) * (scoringSettings.field_goals_made_30_39 || 0);
  points += (stats.field_goals_made_40_49 || 0) * (scoringSettings.field_goals_made_40_49 || 0);
  points += (stats.field_goals_made_50_plus || 0) * (scoringSettings.field_goals_made_50_plus || 0);
  points += (stats.extra_points_made || 0) * (scoringSettings.extra_points_made || 0);

  // Field goal misses
  const fgMissed = (stats.field_goals_attempted || 0) - (stats.field_goals_made || 0);
  points += fgMissed * (scoringSettings.field_goals_missed || 0);

  // Extra point misses
  const xpMissed = (stats.extra_points_attempted || 0) - (stats.extra_points_made || 0);
  points += xpMissed * (scoringSettings.extra_points_missed || 0);

  // Defense/ST
  points += (stats.defensive_touchdowns || 0) * (scoringSettings.defensive_touchdowns || 0);
  points += (stats.special_teams_touchdowns || 0) * (scoringSettings.special_teams_touchdowns || 0);
  points += (stats.defensive_interceptions || 0) * (scoringSettings.defensive_interceptions || 0);
  points += (stats.defensive_fumbles_recovered || 0) * (scoringSettings.defensive_fumbles_recovered || 0);
  points += (stats.defensive_sacks || 0) * (scoringSettings.defensive_sacks || 0);
  points += (stats.defensive_safeties || 0) * (scoringSettings.defensive_safeties || 0);

  // IDP
  points += (stats.tackles_solo || 0) * (scoringSettings.tackles_solo || 0);
  points += (stats.tackles_assisted || 0) * (scoringSettings.tackles_assisted || 0);
  points += (stats.tackles_for_loss || 0) * (scoringSettings.tackles_for_loss || 0);
  points += (stats.quarterback_hits || 0) * (scoringSettings.quarterback_hits || 0);
  points += (stats.passes_defended || 0) * (scoringSettings.passes_defended || 0);

  // Round to 2 decimal places
  return Math.round(points * 100) / 100;
}

/**
 * Calculate total fantasy points for a roster's starters
 */
export async function calculateRosterScore(
  rosterStarterPlayerIds: number[],
  week: number,
  season: string,
  scoringSettings: ScoringSettings,
  seasonType: string = "regular"
): Promise<number> {
  const { getMultiplePlayersStatsByWeek } = await import("../models/PlayerStats");

  // Get stats for all starter players
  const playersStats = await getMultiplePlayersStatsByWeek(
    rosterStarterPlayerIds,
    week,
    season,
    seasonType
  );

  let totalScore = 0;

  // Calculate points for each player
  for (const playerStats of playersStats) {
    // Pass player position if available (from PlayerStatsWithInfo)
    const position = (playerStats as any).player_position;
    const points = calculateFantasyPoints(playerStats, scoringSettings, position);
    totalScore += points;
  }

  return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate and update scores for all matchups in a league for a specific week
 */
export async function updateMatchupScoresForWeek(
  leagueId: number,
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<void> {
  try {
    const { getLeagueById } = await import("../models/League");
    const { getMatchupsByLeagueAndWeek, updateMatchupScores } = await import("../models/Matchup");

    // Get league to get scoring settings
    const league = await getLeagueById(leagueId);
    if (!league) {
      throw new Error("League not found");
    }

    const scoringSettings = league.scoring_settings || {};

    // Get all matchups for this week
    const matchups = await getMatchupsByLeagueAndWeek(leagueId, week);

    // Collect all roster IDs that need lineups
    const rosterIds: number[] = [];
    for (const matchup of matchups) {
      rosterIds.push(matchup.roster1_id);
      if (matchup.roster2_id) {
        rosterIds.push(matchup.roster2_id);
      }
    }

    // Batch fetch all weekly lineups at once (eliminates N+1 query problem)
    const { batchGetOrCreateWeeklyLineups } = await import("../models/WeeklyLineup");
    const lineupsMap = await batchGetOrCreateWeeklyLineups(rosterIds, week, season);

    // Calculate scores for each matchup
    for (const matchup of matchups) {
      // Get roster 1 weekly lineup from pre-fetched map
      const roster1Lineup = lineupsMap.get(matchup.roster1_id);
      if (!roster1Lineup) {
        throw new Error(`Lineup not found for roster ${matchup.roster1_id}`);
      }

      const roster1StarterIds = (roster1Lineup.starters || [])
        .map((slot: any) => slot.player_id)
        .filter((id: number | null) => id !== null);

      const roster1Score = await calculateRosterScore(
        roster1StarterIds,
        week,
        season,
        scoringSettings,
        seasonType
      );

      // Get roster 2 weekly lineup (if not a bye week)
      let roster2Score = 0;
      if (matchup.roster2_id) {
        const roster2Lineup = lineupsMap.get(matchup.roster2_id);
        if (!roster2Lineup) {
          throw new Error(`Lineup not found for roster ${matchup.roster2_id}`);
        }

        const roster2StarterIds = (roster2Lineup.starters || [])
          .map((slot: any) => slot.player_id)
          .filter((id: number | null) => id !== null);

        roster2Score = await calculateRosterScore(
          roster2StarterIds,
          week,
          season,
          scoringSettings,
          seasonType
        );
      }

      // Update matchup scores
      await updateMatchupScores(matchup.id, roster1Score, roster2Score);
    }

    console.log(`✓ Updated scores for week ${week} matchups in league ${leagueId}`);
  } catch (error) {
    console.error("Error updating matchup scores:", error);
    throw error;
  }
}
