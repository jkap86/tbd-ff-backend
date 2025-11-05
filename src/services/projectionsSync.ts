import axios from "axios";
import pool from "../config/database";

const SLEEPER_API_BASE = "https://api.sleeper.app/v1";

interface SleeperProjection {
  player_id: string;
  week?: number;
  season?: string;
  season_type?: string;
  [key: string]: any;
}

/**
 * Sync player projections from Sleeper API to database
 */
export async function syncWeekProjections(
  season: string,
  week: number,
  seasonType: string = "regular"
): Promise<{ synced: number; errors: number }> {
  console.log(`[ProjectionsSync] Starting sync for ${season} week ${week} ${seasonType}...`);

  try {
    // Fetch projections for the week from Sleeper
    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${seasonType}`
    );
    const projections: SleeperProjection[] = response.data;

    if (!projections || projections.length === 0) {
      console.log(`[ProjectionsSync] No projections found for ${season} week ${week}`);
      return { synced: 0, errors: 0 };
    }

    console.log(`[ProjectionsSync] Fetched ${projections.length} projections from Sleeper`);

    let synced = 0;
    let errors = 0;

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < projections.length; i += batchSize) {
      const batch = projections.slice(i, i + batchSize);

      try {
        await processBatch(batch, season, week, seasonType);
        synced += batch.length;
      } catch (error) {
        console.error(`[ProjectionsSync] Error processing batch ${i}-${i + batch.length}:`, error);
        errors += batch.length;
      }
    }

    console.log(`[ProjectionsSync] Completed: ${synced} synced, ${errors} errors`);
    return { synced, errors };
  } catch (error) {
    console.error(`[ProjectionsSync] Error syncing projections for ${season} week ${week}:`, error);
    throw error;
  }
}

/**
 * Process a batch of projections using UPSERT
 */
async function processBatch(
  projections: SleeperProjection[],
  season: string,
  week: number,
  seasonType: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const proj of projections) {
      // Get player database ID from player_id (Sleeper ID)
      const playerResult = await client.query(
        "SELECT id FROM players WHERE player_id = $1",
        [proj.player_id]
      );

      if (playerResult.rows.length === 0) {
        console.warn(`[ProjectionsSync] Player not found for player_id ${proj.player_id}, skipping`);
        continue;
      }

      const playerId = playerResult.rows[0].id;

      // UPSERT projections
      await client.query(
        `INSERT INTO player_projections (
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
          proj.pass_att || 0, proj.pass_cmp || 0, proj.pass_yd || 0, proj.pass_td || 0, proj.pass_int || 0, proj.pass_2pt || 0,
          proj.rush_att || 0, proj.rush_yd || 0, proj.rush_td || 0, proj.rush_2pt || 0,
          proj.rec_tgt || 0, proj.rec || 0, proj.rec_yd || 0, proj.rec_td || 0, proj.rec_2pt || 0,
          proj.fum_lost || 0,
          proj.fgm || 0, proj.fga || 0, proj.fgm_0_19 || 0, proj.fgm_20_29 || 0,
          proj.fgm_30_39 || 0, proj.fgm_40_49 || 0, proj.fgm_50p || 0,
          proj.xpm || 0, proj.xpa || 0,
          proj.def_td || 0, proj.st_td || 0, proj.def_int || 0, proj.def_fr || 0,
          proj.def_sack || 0, proj.def_safe || 0, proj.def_pa || 0, proj.def_ya || 0,
          proj.tkl_solo || 0, proj.tkl_ast || 0, proj.tkl_loss || 0, proj.qb_hit || 0, proj.pass_def || 0
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
 * Sync multiple weeks in parallel
 */
export async function syncWeekRange(
  season: string,
  startWeek: number,
  endWeek: number
): Promise<void> {
  console.log(`[ProjectionsSync] Syncing weeks ${startWeek}-${endWeek} in parallel...`);

  const weeks: number[] = [];
  for (let week = startWeek; week <= endWeek; week++) {
    weeks.push(week);
  }

  const promises = weeks.map(week =>
    syncWeekProjections(season, week, "regular")
  );

  const results = await Promise.allSettled(promises);

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`[ProjectionsSync] Week ${weeks[index]}: ${result.value.synced} synced, ${result.value.errors} errors`);
    } else {
      console.error(`[ProjectionsSync] Week ${weeks[index]} failed:`, result.reason);
    }
  });
}
