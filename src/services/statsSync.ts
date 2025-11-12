import axios from "axios";
import pool from "../config/database";

const SLEEPER_API_BASE = "https://api.sleeper.app/v1";

interface SleeperStat {
  player_id: string;
  week?: number;
  season?: string;
  season_type?: string;
  [key: string]: any;
}

/**
 * Sync player stats from Sleeper API to database
 */
export async function syncSeasonStats(
  season: string,
  seasonType: string = "regular"
): Promise<{ synced: number; errors: number }> {
  console.log(`[StatsSync] Starting sync for ${season} ${seasonType} season...`);

  try {
    // Fetch all stats for the season from Sleeper
    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}?season_type=${seasonType}`
    );
    const stats: SleeperStat[] = response.data;

    if (!stats || stats.length === 0) {
      console.log(`[StatsSync] No stats found for ${season} ${seasonType}`);
      return { synced: 0, errors: 0 };
    }

    console.log(`[StatsSync] Fetched ${stats.length} stat records from Sleeper`);

    let synced = 0;
    let errors = 0;

    // Process in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < stats.length; i += batchSize) {
      const batch = stats.slice(i, i + batchSize);

      try {
        await processBatch(batch, season, seasonType);
        synced += batch.length;
      } catch (error) {
        console.error(`[StatsSync] Error processing batch ${i}-${i + batch.length}:`, error);
        errors += batch.length;
      }
    }

    console.log(`[StatsSync] Completed: ${synced} synced, ${errors} errors`);
    return { synced, errors };
  } catch (error) {
    console.error(`[StatsSync] Error syncing stats for ${season}:`, error);
    throw error;
  }
}

/**
 * Process a batch of stats using UPSERT
 */
async function processBatch(
  stats: SleeperStat[],
  season: string,
  seasonType: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const stat of stats) {
      // Get player database ID from player_id (Sleeper ID)
      const playerResult = await client.query(
        "SELECT id FROM players WHERE player_id = $1",
        [stat.player_id]
      );

      if (playerResult.rows.length === 0) {
        console.warn(`[StatsSync] Player not found for player_id ${stat.player_id}, skipping`);
        continue;
      }

      const playerId = playerResult.rows[0].id;
      const week = stat.week || 0; // 0 for season totals

      // UPSERT stats
      await client.query(
        `INSERT INTO player_stats (
          player_id, week, season, season_type,
          passing_attempts, passing_completions, passing_yards, passing_touchdowns, passing_interceptions, passing_2pt_conversions,
          rushing_attempts, rushing_yards, rushing_touchdowns, rushing_2pt_conversions,
          receiving_targets, receiving_receptions, receiving_yards, receiving_touchdowns, receiving_2pt_conversions,
          fumbles_lost,
          field_goals_made, field_goals_attempted, field_goals_made_0_19, field_goals_made_20_29,
          field_goals_made_30_39, field_goals_made_40_49, field_goals_made_50_plus,
          extra_points_made, extra_points_attempted,
          defensive_touchdowns, special_teams_touchdowns, defensive_interceptions, defensive_fumbles_recovered,
          defensive_sacks, defensive_safeties, defensive_points_allowed, defensive_yards_allowed,
          tackles_solo, tackles_assisted, tackles_for_loss, quarterback_hits, passes_defended
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30, $31, $32, $33, $34, $35, $36, $37,
          $38, $39, $40, $41, $42
        )
        ON CONFLICT (player_id, week, season, season_type)
        DO UPDATE SET
          passing_attempts = EXCLUDED.passing_attempts,
          passing_completions = EXCLUDED.passing_completions,
          passing_yards = EXCLUDED.passing_yards,
          passing_touchdowns = EXCLUDED.passing_touchdowns,
          passing_interceptions = EXCLUDED.passing_interceptions,
          passing_2pt_conversions = EXCLUDED.passing_2pt_conversions,
          rushing_attempts = EXCLUDED.rushing_attempts,
          rushing_yards = EXCLUDED.rushing_yards,
          rushing_touchdowns = EXCLUDED.rushing_touchdowns,
          rushing_2pt_conversions = EXCLUDED.rushing_2pt_conversions,
          receiving_targets = EXCLUDED.receiving_targets,
          receiving_receptions = EXCLUDED.receiving_receptions,
          receiving_yards = EXCLUDED.receiving_yards,
          receiving_touchdowns = EXCLUDED.receiving_touchdowns,
          receiving_2pt_conversions = EXCLUDED.receiving_2pt_conversions,
          fumbles_lost = EXCLUDED.fumbles_lost,
          field_goals_made = EXCLUDED.field_goals_made,
          field_goals_attempted = EXCLUDED.field_goals_attempted,
          field_goals_made_0_19 = EXCLUDED.field_goals_made_0_19,
          field_goals_made_20_29 = EXCLUDED.field_goals_made_20_29,
          field_goals_made_30_39 = EXCLUDED.field_goals_made_30_39,
          field_goals_made_40_49 = EXCLUDED.field_goals_made_40_49,
          field_goals_made_50_plus = EXCLUDED.field_goals_made_50_plus,
          extra_points_made = EXCLUDED.extra_points_made,
          extra_points_attempted = EXCLUDED.extra_points_attempted,
          defensive_touchdowns = EXCLUDED.defensive_touchdowns,
          special_teams_touchdowns = EXCLUDED.special_teams_touchdowns,
          defensive_interceptions = EXCLUDED.defensive_interceptions,
          defensive_fumbles_recovered = EXCLUDED.defensive_fumbles_recovered,
          defensive_sacks = EXCLUDED.defensive_sacks,
          defensive_safeties = EXCLUDED.defensive_safeties,
          defensive_points_allowed = EXCLUDED.defensive_points_allowed,
          defensive_yards_allowed = EXCLUDED.defensive_yards_allowed,
          tackles_solo = EXCLUDED.tackles_solo,
          tackles_assisted = EXCLUDED.tackles_assisted,
          tackles_for_loss = EXCLUDED.tackles_for_loss,
          quarterback_hits = EXCLUDED.quarterback_hits,
          passes_defended = EXCLUDED.passes_defended,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          playerId, week, season, seasonType,
          stat.pass_att || 0, stat.pass_cmp || 0, stat.pass_yd || 0, stat.pass_td || 0, stat.pass_int || 0, stat.pass_2pt || 0,
          stat.rush_att || 0, stat.rush_yd || 0, stat.rush_td || 0, stat.rush_2pt || 0,
          stat.rec_tgt || 0, stat.rec || 0, stat.rec_yd || 0, stat.rec_td || 0, stat.rec_2pt || 0,
          stat.fum_lost || 0,
          stat.fgm || 0, stat.fga || 0, stat.fgm_0_19 || 0, stat.fgm_20_29 || 0,
          stat.fgm_30_39 || 0, stat.fgm_40_49 || 0, stat.fgm_50p || 0,
          stat.xpm || 0, stat.xpa || 0,
          stat.def_td || 0, stat.st_td || 0, stat.def_int || 0, stat.def_fr || 0,
          stat.def_sack || 0, stat.def_safe || 0, stat.def_pa || 0, stat.def_ya || 0,
          stat.tkl_solo || 0, stat.tkl_ast || 0, stat.tkl_loss || 0, stat.qb_hit || 0, stat.pass_def || 0
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Sync all seasons in parallel
 */
export async function syncAllSeasons(seasons: string[]): Promise<void> {
  console.log(`[StatsSync] Syncing ${seasons.length} seasons in parallel...`);

  const promises = seasons.map(season =>
    syncSeasonStats(season, "regular")
  );

  const results = await Promise.allSettled(promises);

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`[StatsSync] Season ${seasons[index]}: ${result.value.synced} synced, ${result.value.errors} errors`);
    } else {
      console.error(`[StatsSync] Season ${seasons[index]} failed:`, result.reason);
    }
  });
}
