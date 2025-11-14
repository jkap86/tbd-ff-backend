import { Request, Response } from "express";
import pool from "../config/database";
import { logger } from "../config/logger";

/**
 * Get bulk season stats from DATABASE (much faster than Sleeper API)
 * Falls back to Sleeper if data not found
 */
export async function getBulkPlayerSeasonStatsFromDB(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { season } = req.params;
    const { player_ids, season_type = "regular" } = req.body;

    if (!player_ids || !Array.isArray(player_ids)) {
      res.status(400).json({
        success: false,
        message: "player_ids array is required in request body",
      });
      return;
    }

    logger.info(`[StatsDB] Querying database for ${player_ids.length} players, season ${season}`);

    // Query database for stats
    // Group by player_id and sum all weeks to get season totals
    const result = await pool.query(
      `SELECT
        p.player_id,
        SUM(ps.passing_attempts) as pass_att,
        SUM(ps.passing_completions) as pass_cmp,
        SUM(ps.passing_yards) as pass_yd,
        SUM(ps.passing_touchdowns) as pass_td,
        SUM(ps.passing_interceptions) as pass_int,
        SUM(ps.passing_2pt_conversions) as pass_2pt,
        SUM(ps.rushing_attempts) as rush_att,
        SUM(ps.rushing_yards) as rush_yd,
        SUM(ps.rushing_touchdowns) as rush_td,
        SUM(ps.rushing_2pt_conversions) as rush_2pt,
        SUM(ps.receiving_targets) as rec_tgt,
        SUM(ps.receiving_receptions) as rec,
        SUM(ps.receiving_yards) as rec_yd,
        SUM(ps.receiving_touchdowns) as rec_td,
        SUM(ps.receiving_2pt_conversions) as rec_2pt,
        SUM(ps.fumbles_lost) as fum_lost,
        SUM(ps.field_goals_made) as fgm,
        SUM(ps.field_goals_attempted) as fga,
        SUM(ps.extra_points_made) as xpm,
        SUM(ps.extra_points_attempted) as xpa,
        SUM(ps.defensive_touchdowns) as def_td,
        SUM(ps.special_teams_touchdowns) as st_td,
        SUM(ps.defensive_interceptions) as def_int,
        SUM(ps.defensive_fumbles_recovered) as def_fr,
        SUM(ps.defensive_sacks) as def_sack,
        SUM(ps.tackles_solo) as tkl_solo,
        SUM(ps.tackles_assisted) as tkl_ast
      FROM player_stats ps
      JOIN players p ON ps.player_id = p.id
      WHERE p.player_id = ANY($1)
        AND ps.season = $2
        AND ps.season_type = $3
      GROUP BY p.player_id`,
      [player_ids, season, season_type]
    );

    // Convert to map keyed by player_id
    const statsMap: Record<string, any> = {};
    for (const row of result.rows) {
      statsMap[row.player_id] = row;
    }

    logger.info(`[StatsDB] Found stats for ${result.rows.length}/${player_ids.length} players`);

    res.status(200).json({
      success: true,
      data: statsMap,
      count: Object.keys(statsMap).length,
      source: "database",
    });
  } catch (error: any) {
    logger.error("Error fetching bulk player season stats from DB:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching bulk player season stats",
    });
  }
}

/**
 * Get bulk week range projections from DATABASE
 */
export async function getBulkPlayerWeekRangeProjectionsFromDB(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { season } = req.params;
    const { player_ids, start_week, end_week, season_type = "regular" } = req.body;

    if (!player_ids || !Array.isArray(player_ids)) {
      res.status(400).json({
        success: false,
        message: "player_ids array is required in request body",
      });
      return;
    }

    if (!start_week || !end_week) {
      res.status(400).json({
        success: false,
        message: "start_week and end_week are required in request body",
      });
      return;
    }

    logger.info(`[ProjectionsDB] Querying database for ${player_ids.length} players, weeks ${start_week}-${end_week}`);

    // Query database and aggregate projections across week range
    const result = await pool.query(
      `SELECT
        p.player_id,
        SUM(pp.passing_attempts) as pass_att,
        SUM(pp.passing_completions) as pass_cmp,
        SUM(pp.passing_yards) as pass_yd,
        SUM(pp.passing_touchdowns) as pass_td,
        SUM(pp.passing_interceptions) as pass_int,
        SUM(pp.rushing_attempts) as rush_att,
        SUM(pp.rushing_yards) as rush_yd,
        SUM(pp.rushing_touchdowns) as rush_td,
        SUM(pp.receiving_targets) as rec_tgt,
        SUM(pp.receiving_receptions) as rec,
        SUM(pp.receiving_yards) as rec_yd,
        SUM(pp.receiving_touchdowns) as rec_td,
        SUM(pp.fumbles_lost) as fum_lost,
        SUM(pp.field_goals_made) as fgm,
        SUM(pp.field_goals_attempted) as fga,
        SUM(pp.extra_points_made) as xpm
      FROM player_projections pp
      JOIN players p ON pp.player_id = p.id
      WHERE p.player_id = ANY($1)
        AND pp.season = $2
        AND pp.week >= $3
        AND pp.week <= $4
        AND pp.season_type = $5
      GROUP BY p.player_id`,
      [player_ids, season, start_week, end_week, season_type]
    );

    // Convert to map
    const projectionsMap: Record<string, any> = {};
    for (const row of result.rows) {
      projectionsMap[row.player_id] = row;
    }

    logger.info(`[ProjectionsDB] Found projections for ${result.rows.length}/${player_ids.length} players`);

    res.status(200).json({
      success: true,
      data: projectionsMap,
      count: Object.keys(projectionsMap).length,
      weeks_queried: end_week - start_week + 1,
      source: "database",
    });
  } catch (error: any) {
    logger.error("Error fetching bulk week range projections from DB:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching bulk week range projections",
    });
  }
}

/**
 * Get bulk season projections from DATABASE
 */
export async function getBulkPlayerSeasonProjectionsFromDB(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { season } = req.params;
    const { player_ids, season_type = "regular" } = req.body;

    if (!player_ids || !Array.isArray(player_ids)) {
      res.status(400).json({
        success: false,
        message: "player_ids array is required in request body",
      });
      return;
    }

    logger.info(`[ProjectionsDB] Querying database for ${player_ids.length} players, season ${season}`);

    // Query and sum all weeks for season totals
    const result = await pool.query(
      `SELECT
        p.player_id,
        SUM(pp.passing_attempts) as pass_att,
        SUM(pp.passing_completions) as pass_cmp,
        SUM(pp.passing_yards) as pass_yd,
        SUM(pp.passing_touchdowns) as pass_td,
        SUM(pp.passing_interceptions) as pass_int,
        SUM(pp.rushing_attempts) as rush_att,
        SUM(pp.rushing_yards) as rush_yd,
        SUM(pp.rushing_touchdowns) as rush_td,
        SUM(pp.receiving_targets) as rec_tgt,
        SUM(pp.receiving_receptions) as rec,
        SUM(pp.receiving_yards) as rec_yd,
        SUM(pp.receiving_touchdowns) as rec_td,
        SUM(pp.fumbles_lost) as fum_lost,
        SUM(pp.field_goals_made) as fgm,
        SUM(pp.field_goals_attempted) as fga,
        SUM(pp.extra_points_made) as xpm
      FROM player_projections pp
      JOIN players p ON pp.player_id = p.id
      WHERE p.player_id = ANY($1)
        AND pp.season = $2
        AND pp.season_type = $3
      GROUP BY p.player_id`,
      [player_ids, season, season_type]
    );

    // Convert to map
    const projectionsMap: Record<string, any> = {};
    for (const row of result.rows) {
      projectionsMap[row.player_id] = row;
    }

    logger.info(`[ProjectionsDB] Found projections for ${result.rows.length}/${player_ids.length} players`);

    res.status(200).json({
      success: true,
      data: projectionsMap,
      count: Object.keys(projectionsMap).length,
      source: "database",
    });
  } catch (error: any) {
    logger.error("Error fetching bulk season projections from DB:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching bulk season projections",
    });
  }
}
