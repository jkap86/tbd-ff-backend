import { PlayerStats } from "../models/PlayerStats";

/**
 * Maps Sleeper API stats format to our database PlayerStats format.
 *
 * This function handles both actual stats and projections, as they use
 * the same field naming conventions from the Sleeper API.
 *
 * Note: For IDP stats, actual stats use 'idp_' prefix (e.g., idp_tkl_solo)
 * while projections don't (e.g., tkl_solo). This mapper handles both cases.
 *
 * @param sleeperStats - Stats object from Sleeper API (can be actual stats or projections)
 * @param playerId - Our database player ID
 * @param week - Week number
 * @param season - Season (e.g., "2024")
 * @param seasonType - Season type ("regular", "playoff", etc.)
 * @returns Partial PlayerStats object ready for database insertion
 */
export function mapSleeperStatsToDb(
  sleeperStats: any,
  playerId: number,
  week: number,
  season: string,
  seasonType: string = "regular"
): Partial<PlayerStats> {
  return {
    player_id: playerId,
    week,
    season,
    season_type: seasonType,

    // Passing
    passing_attempts: sleeperStats.pass_att || 0,
    passing_completions: sleeperStats.pass_cmp || 0,
    passing_yards: sleeperStats.pass_yd || 0,
    passing_touchdowns: sleeperStats.pass_td || 0,
    passing_interceptions: sleeperStats.pass_int || 0,
    passing_2pt_conversions: sleeperStats.pass_2pt || 0,

    // Rushing
    rushing_attempts: sleeperStats.rush_att || 0,
    rushing_yards: sleeperStats.rush_yd || 0,
    rushing_touchdowns: sleeperStats.rush_td || 0,
    rushing_2pt_conversions: sleeperStats.rush_2pt || 0,

    // Receiving
    receiving_targets: sleeperStats.rec_tgt || 0,
    receiving_receptions: sleeperStats.rec || 0,
    receiving_yards: sleeperStats.rec_yd || 0,
    receiving_touchdowns: sleeperStats.rec_td || 0,
    receiving_2pt_conversions: sleeperStats.rec_2pt || 0,

    // Fumbles
    fumbles_lost: sleeperStats.fum_lost || 0,

    // Kicking
    field_goals_made: sleeperStats.fgm || 0,
    field_goals_attempted: sleeperStats.fga || 0,
    field_goals_made_0_19: sleeperStats.fgm_0_19 || 0,
    field_goals_made_20_29: sleeperStats.fgm_20_29 || 0,
    field_goals_made_30_39: sleeperStats.fgm_30_39 || 0,
    field_goals_made_40_49: sleeperStats.fgm_40_49 || 0,
    field_goals_made_50_plus: sleeperStats.fgm_50p || 0,
    extra_points_made: sleeperStats.xpm || 0,
    extra_points_attempted: sleeperStats.xpa || 0,

    // Defense/ST
    defensive_touchdowns: sleeperStats.def_td || 0,
    special_teams_touchdowns: sleeperStats.st_td || 0,
    defensive_interceptions: sleeperStats.def_int || 0,
    defensive_fumbles_recovered: sleeperStats.def_fr || 0,
    defensive_sacks: sleeperStats.def_sack || 0,
    defensive_safeties: sleeperStats.def_safe || 0,
    defensive_points_allowed: sleeperStats.pts_allow || 0,
    defensive_yards_allowed: sleeperStats.yds_allow || 0,

    // IDP - Handle both actual stats (idp_tkl_solo) and projections (tkl_solo)
    tackles_solo: sleeperStats.idp_tkl_solo || sleeperStats.tkl_solo || 0,
    tackles_assisted: sleeperStats.idp_tkl_ast || sleeperStats.tkl_ast || 0,
    tackles_for_loss: sleeperStats.idp_tkl_loss || sleeperStats.tkl_loss || 0,
    quarterback_hits: sleeperStats.idp_qb_hit || sleeperStats.qb_hit || 0,
    passes_defended: sleeperStats.idp_pass_def || sleeperStats.pass_def || 0,

    // Advanced stats - First downs
    rushing_first_downs: sleeperStats.rush_fd || 0,
    receiving_first_downs: sleeperStats.rec_fd || 0,
    passing_first_downs: sleeperStats.pass_fd || 0,

    // Advanced stats - Big plays
    rush_40plus: sleeperStats.rush_40p || 0,
    rec_40plus: sleeperStats.rec_40p || 0,
    pass_40plus: sleeperStats.pass_40p || 0,
  };
}
