import axios from "axios";
import { PlayerStats } from "../models/PlayerStats";

const SLEEPER_API_BASE = "https://api.sleeper.com";

interface SleeperProjections {
  [playerId: string]: {
    // Pre-calculated points (we won't use these)
    pts_std?: number;
    pts_ppr?: number;
    pts_half_ppr?: number;

    // Stat projections (we'll use these)
    pass_att?: number;
    pass_cmp?: number;
    pass_yd?: number;
    pass_td?: number;
    pass_int?: number;
    pass_2pt?: number;

    rush_att?: number;
    rush_yd?: number;
    rush_td?: number;
    rush_2pt?: number;

    rec_tgt?: number;
    rec?: number;
    rec_yd?: number;
    rec_td?: number;
    rec_2pt?: number;

    fum_lost?: number;

    fgm?: number;
    fga?: number;
    fgm_0_19?: number;
    fgm_20_29?: number;
    fgm_30_39?: number;
    fgm_40_49?: number;
    fgm_50p?: number;
    xpm?: number;
    xpa?: number;

    def_td?: number;
    st_td?: number;
    def_int?: number;
    def_fr?: number;
    def_sack?: number;
    def_safe?: number;
    pts_allow?: number;
    yds_allow?: number;

    tkl_solo?: number;
    tkl_ast?: number;
    tkl_loss?: number;
    qb_hit?: number;
    pass_def?: number;

    [key: string]: any;
  };
}

/**
 * Fetch projections from Sleeper API
 * Returns a map of Sleeper player IDs to their projected points
 */
export async function fetchSleeperProjections(
  season: string,
  week: number,
  seasonType: string = "regular"
): Promise<SleeperProjections> {
  try {
    console.log(
      `[Projections] Fetching projections for ${season} week ${week} (${seasonType})`
    );

    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${seasonType}`
    );

    const rawData = response.data || [];
    console.log(`[Projections] Raw data type:`, Array.isArray(rawData) ? 'array' : 'object');

    // Convert array to object keyed by player_id
    const projections: SleeperProjections = {};
    if (Array.isArray(rawData)) {
      for (const projection of rawData) {
        if (projection.player_id && projection.stats) {
          // Store the stats object keyed by player_id
          projections[projection.player_id] = projection.stats;
        }
      }
    }

    const count = Object.keys(projections).length;
    console.log(`[Projections] Converted to ${count} player projections`);
    console.log(`[Projections] First 5 projection keys after conversion:`, Object.keys(projections).slice(0, 5));

    return projections;
  } catch (error: any) {
    console.error("[Projections] Error fetching projections:", error.message);
    // Return empty object if projections aren't available
    return {};
  }
}

/**
 * Get projected points for a specific player
 * Uses PPR scoring by default
 */
export async function getPlayerProjection(
  sleeperPlayerId: string,
  season: string,
  week: number,
  seasonType: string = "regular",
  scoringType: "std" | "ppr" | "half_ppr" = "ppr"
): Promise<number> {
  try {
    const projections = await fetchSleeperProjections(season, week, seasonType);
    const playerProj = projections[sleeperPlayerId];

    if (!playerProj) {
      return 0;
    }

    // Return appropriate scoring type
    switch (scoringType) {
      case "std":
        return playerProj.pts_std || 0;
      case "half_ppr":
        return playerProj.pts_half_ppr || 0;
      case "ppr":
      default:
        return playerProj.pts_ppr || 0;
    }
  } catch (error) {
    console.error("[Projections] Error getting player projection:", error);
    return 0;
  }
}

/**
 * Convert Sleeper projection to PlayerStats format
 * This allows us to use the same scoring calculation for both actual stats and projections
 */
export function convertSleeperProjectionToStats(
  projection: any,
  playerId: number,
  week: number,
  season: string
): Partial<PlayerStats> {
  console.log(`[Convert] Converting projection for player ${playerId}:`, {
    pass_yd: projection.pass_yd,
    rush_yd: projection.rush_yd,
    rec: projection.rec,
    rec_yd: projection.rec_yd,
    rec_td: projection.rec_td,
    available_keys: Object.keys(projection)
  });

  return {
    player_id: playerId,
    week,
    season,
    season_type: "regular",

    // Passing
    passing_attempts: projection.pass_att || 0,
    passing_completions: projection.pass_cmp || 0,
    passing_yards: projection.pass_yd || 0,
    passing_touchdowns: projection.pass_td || 0,
    passing_interceptions: projection.pass_int || 0,
    passing_2pt_conversions: projection.pass_2pt || 0,

    // Rushing
    rushing_attempts: projection.rush_att || 0,
    rushing_yards: projection.rush_yd || 0,
    rushing_touchdowns: projection.rush_td || 0,
    rushing_2pt_conversions: projection.rush_2pt || 0,

    // Receiving
    receiving_targets: projection.rec_tgt || 0,
    receiving_receptions: projection.rec || 0,
    receiving_yards: projection.rec_yd || 0,
    receiving_touchdowns: projection.rec_td || 0,
    receiving_2pt_conversions: projection.rec_2pt || 0,

    // Fumbles
    fumbles_lost: projection.fum_lost || 0,

    // Kicking
    field_goals_made: projection.fgm || 0,
    field_goals_attempted: projection.fga || 0,
    field_goals_made_0_19: projection.fgm_0_19 || 0,
    field_goals_made_20_29: projection.fgm_20_29 || 0,
    field_goals_made_30_39: projection.fgm_30_39 || 0,
    field_goals_made_40_49: projection.fgm_40_49 || 0,
    field_goals_made_50_plus: projection.fgm_50p || 0,
    extra_points_made: projection.xpm || 0,
    extra_points_attempted: projection.xpa || 0,

    // Defense/ST
    defensive_touchdowns: projection.def_td || 0,
    special_teams_touchdowns: projection.st_td || 0,
    defensive_interceptions: projection.def_int || 0,
    defensive_fumbles_recovered: projection.def_fr || 0,
    defensive_sacks: projection.def_sack || 0,
    defensive_safeties: projection.def_safe || 0,
    defensive_points_allowed: projection.pts_allow || 0,
    defensive_yards_allowed: projection.yds_allow || 0,

    // IDP
    tackles_solo: projection.tkl_solo || 0,
    tackles_assisted: projection.tkl_ast || 0,
    tackles_for_loss: projection.tkl_loss || 0,
    quarterback_hits: projection.qb_hit || 0,
    passes_defended: projection.pass_def || 0,
  };
}
