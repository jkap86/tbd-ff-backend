import axios from "axios";
import { upsertPlayerStats } from "../models/PlayerStats";

const SLEEPER_API_BASE = "https://api.sleeper.com";

/**
 * Map Sleeper player ID to our database player ID
 */
async function getOurPlayerIdFromSleeperId(sleeperId: string): Promise<number | null> {
  const { getPlayerBySleeperPlayerId } = await import("../models/Player");
  const player = await getPlayerBySleeperPlayerId(sleeperId);
  return player ? player.id : null;
}

/**
 * Fetch stats from Sleeper API and sync to our database
 */
export async function syncSleeperStatsForWeek(
  season: string,
  week: number,
  seasonType: string = "regular"
): Promise<{ synced: number; failed: number }> {
  try {
    console.log(`Fetching Sleeper stats for ${season} week ${week}...`);

    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}/${week}?season_type=${seasonType}`
    );

    // Response is an array of player stat objects
    const sleeperStats: any[] = Array.isArray(response.data) ? response.data : [];

    console.log(`Received ${sleeperStats.length} player stats from Sleeper`);

    let synced = 0;
    let failed = 0;

    for (const playerData of sleeperStats) {
      try {
        // Skip if no player_id
        if (!playerData.player_id) {
          failed++;
          continue;
        }

        // Map Sleeper player ID to our player ID
        const ourPlayerId = await getOurPlayerIdFromSleeperId(playerData.player_id);

        if (!ourPlayerId) {
          // Player not in our database, skip
          failed++;
          continue;
        }

        // Stats are nested inside the stats object
        const stats = playerData.stats || {};

        // Map Sleeper stats to our schema
        await upsertPlayerStats({
          player_id: ourPlayerId,
          week,
          season,
          season_type: seasonType,

          // Passing
          passing_attempts: stats.pass_att || 0,
          passing_completions: stats.pass_cmp || 0,
          passing_yards: stats.pass_yd || 0,
          passing_touchdowns: stats.pass_td || 0,
          passing_interceptions: stats.pass_int || 0,
          passing_2pt_conversions: stats.pass_2pt || 0,

          // Rushing
          rushing_attempts: stats.rush_att || 0,
          rushing_yards: stats.rush_yd || 0,
          rushing_touchdowns: stats.rush_td || 0,
          rushing_2pt_conversions: stats.rush_2pt || 0,

          // Receiving
          receiving_targets: stats.rec_tgt || 0,
          receiving_receptions: stats.rec || 0,
          receiving_yards: stats.rec_yd || 0,
          receiving_touchdowns: stats.rec_td || 0,
          receiving_2pt_conversions: stats.rec_2pt || 0,

          // Fumbles
          fumbles_lost: stats.fum_lost || 0,

          // Kicking
          field_goals_made: stats.fgm || 0,
          field_goals_attempted: stats.fga || 0,
          field_goals_made_0_19: stats.fgm_0_19 || 0,
          field_goals_made_20_29: stats.fgm_20_29 || 0,
          field_goals_made_30_39: stats.fgm_30_39 || 0,
          field_goals_made_40_49: stats.fgm_40_49 || 0,
          field_goals_made_50_plus: stats.fgm_50p || 0,
          extra_points_made: stats.xpm || 0,
          extra_points_attempted: stats.xpa || 0,

          // Defense/ST
          defensive_touchdowns: stats.def_td || 0,
          special_teams_touchdowns: stats.st_td || 0,
          defensive_interceptions: stats.def_int || 0,
          defensive_fumbles_recovered: stats.def_fr || 0,
          defensive_sacks: stats.def_sack || 0,
          defensive_safeties: stats.def_safe || 0,
          defensive_points_allowed: stats.pts_allow || 0,
          defensive_yards_allowed: stats.yds_allow || 0,

          // IDP
          tackles_solo: stats.idp_tkl_solo || 0,
          tackles_assisted: stats.idp_tkl_ast || 0,
          tackles_for_loss: stats.idp_tkl_loss || 0,
          quarterback_hits: stats.idp_qb_hit || 0,
          passes_defended: stats.idp_pass_def || 0,
        });

        synced++;
      } catch (error) {
        console.error(`Failed to sync stats for player ${playerData.player_id}:`, error);
        failed++;
      }
    }

    console.log(`✓ Synced ${synced} players, ${failed} failed`);
    return { synced, failed };
  } catch (error) {
    console.error("Error syncing Sleeper stats:", error);
    throw new Error("Error syncing Sleeper stats");
  }
}

/**
 * Sync stats for multiple weeks
 */
export async function syncSleeperStatsForWeeks(
  season: string,
  startWeek: number,
  endWeek: number,
  seasonType: string = "regular"
): Promise<{ totalSynced: number; totalFailed: number }> {
  let totalSynced = 0;
  let totalFailed = 0;

  for (let week = startWeek; week <= endWeek; week++) {
    const { synced, failed } = await syncSleeperStatsForWeek(season, week, seasonType);
    totalSynced += synced;
    totalFailed += failed;
  }

  return { totalSynced, totalFailed };
}
