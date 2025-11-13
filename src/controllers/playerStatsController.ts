// Before refactor: 594 lines
// After refactor: 459 lines
// Lines saved: 135 lines

import { Request, Response } from "express";
import axios from "axios";
import { statsCache, projectionsCache } from "../services/statsPreloader";
import { BaseController } from "./BaseController";
import { SLEEPER_API_BASE } from "../config/sleeper";

class PlayerStatsController extends BaseController {
  /**
   * Get player stats for a specific week
   * GET /api/player-stats/:season/:week
   */
  getPlayerStats = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, week } = req.params;
    const { season_type = "regular" } = req.query;

    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}/${week}?season_type=${season_type}`
    );

    this.respondSuccess(res, response.data);
  });

  /**
   * Get player projections for a specific week
   * GET /api/player-projections/:season/:week
   */
  getPlayerProjections = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, week } = req.params;
    const { season_type = "regular" } = req.query;

    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${season_type}`
    );

    this.respondSuccess(res, response.data);
  });

  /**
   * Get stats for a specific player
   * GET /api/player-stats/:season/:week/:playerId
   */
  getPlayerStatsById = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, week, playerId } = req.params;
    const { season_type = "regular" } = req.query;

    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}/${week}?season_type=${season_type}`
    );

    // Find the specific player in the response
    const playerStats = response.data.find(
      (stat: any) => stat.player_id === playerId
    );

    if (!playerStats) {
      this.respondNotFound(res, "Player stats not found");
      return;
    }

    this.respondSuccess(res, playerStats);
  });

  /**
   * Get full season stats for a specific player (no week = full season)
   * GET /api/player-stats/:season/:playerId
   */
  getPlayerSeasonStats = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, playerId } = req.params;
    const { season_type = "regular" } = req.query;

    // Call Sleeper API without week parameter to get full season
    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}?season_type=${season_type}`
    );

    // Find the specific player in the response
    const playerStats = response.data.find(
      (stat: any) => stat.player_id === playerId
    );

    if (!playerStats) {
      this.respondNotFound(res, "Player season stats not found");
      return;
    }

    this.respondSuccess(res, playerStats);
  });

  /**
   * Get projections for a specific player
   * GET /api/player-projections/:season/:week/:playerId
   */
  getPlayerProjectionsById = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, week, playerId } = req.params;
    const { season_type = "regular" } = req.query;

    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${season_type}`
    );

    // Find the specific player in the response
    const playerProjections = response.data.find(
      (proj: any) => proj.player_id === playerId
    );

    if (!playerProjections) {
      this.respondNotFound(res, "Player projections not found");
      return;
    }

    this.respondSuccess(res, playerProjections);
  });

  /**
   * Get full season projections for a specific player (no week = full season)
   * GET /api/player-projections/:season/:playerId
   */
  getPlayerSeasonProjections = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, playerId } = req.params;
    const { season_type = "regular" } = req.query;

    // Call Sleeper API without week parameter to get full season
    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}?season_type=${season_type}`
    );

    // Find the specific player in the response
    const playerProjections = response.data.find(
      (proj: any) => proj.player_id === playerId
    );

    if (!playerProjections) {
      this.respondNotFound(res, "Player season projections not found");
      return;
    }

    this.respondSuccess(res, playerProjections);
  });

  /**
   * Get bulk season stats for multiple players
   * POST /api/player-stats/bulk/:season
   * Body: { player_ids: string[], season_type?: string }
   */
  getBulkPlayerSeasonStats = this.asyncHandler(async (req: Request, res: Response) => {
    const { season } = req.params;
    const { player_ids, season_type = "regular" } = req.body;

    if (!player_ids || !Array.isArray(player_ids)) {
      this.respondBadRequest(res, "player_ids array is required in request body");
      return;
    }

    // Create cache key
    const cacheKey = `season_stats_${season}_${season_type}`;
    const indexCacheKey = `${cacheKey}_index`;

    // Check cache first - use indexed version if available
    let statsIndex = statsCache.get<Record<string, any>>(indexCacheKey);

    if (!statsIndex) {
      // Try to get array version
      let allStats = statsCache.get<any[]>(cacheKey);

      if (!allStats) {
        // Fetch all season stats from Sleeper
        console.log(`[StatsCache] Cache miss for ${cacheKey}, fetching from Sleeper...`);
        const response = await axios.get(
          `${SLEEPER_API_BASE}/stats/nfl/${season}?season_type=${season_type}`
        );
        allStats = response.data;

        // Store array in cache
        statsCache.set(cacheKey, allStats);
      } else {
        console.log(`[StatsCache] Cache hit for ${cacheKey}`);
      }

      // Create index for fast lookups
      statsIndex = {};
      if (allStats) {
        for (const stat of allStats) {
          if (stat.player_id) {
            statsIndex[stat.player_id] = stat;
          }
        }
      }

      // Store indexed version in cache
      statsCache.set(indexCacheKey, statsIndex);
      console.log(`[StatsCache] Created index for ${cacheKey} with ${Object.keys(statsIndex).length} players`);
    } else {
      console.log(`[StatsCache] Index cache hit for ${cacheKey}`);
    }

    // Filter to only requested players using O(1) lookups
    const statsMap: Record<string, any> = {};

    for (const playerId of player_ids) {
      const playerStat = statsIndex[playerId];
      if (playerStat) {
        statsMap[playerId] = playerStat;
      }
    }

    this.respondSuccess(res, statsMap, undefined);
  });

  /**
   * Get bulk season projections for multiple players
   * POST /api/player-projections/bulk/:season
   * Body: { player_ids: string[], season_type?: string }
   */
  getBulkPlayerSeasonProjections = this.asyncHandler(async (req: Request, res: Response) => {
    const { season } = req.params;
    const { player_ids, season_type = "regular" } = req.body;

    if (!player_ids || !Array.isArray(player_ids)) {
      this.respondBadRequest(res, "player_ids array is required in request body");
      return;
    }

    // Create cache key
    const cacheKey = `season_projections_${season}_${season_type}`;
    const indexCacheKey = `${cacheKey}_index`;

    // Check cache first - use indexed version if available
    let projectionsIndex = projectionsCache.get<Record<string, any>>(indexCacheKey);

    if (!projectionsIndex) {
      // Try to get array version
      let allProjections = projectionsCache.get<any[]>(cacheKey);

      if (!allProjections) {
        // Fetch all season projections from Sleeper
        console.log(`[ProjectionsCache] Cache miss for ${cacheKey}, fetching from Sleeper...`);
        const response = await axios.get(
          `${SLEEPER_API_BASE}/projections/nfl/${season}?season_type=${season_type}`
        );
        allProjections = response.data;

        // Store array in cache
        projectionsCache.set(cacheKey, allProjections);
      } else {
        console.log(`[ProjectionsCache] Cache hit for ${cacheKey}`);
      }

      // Create index for fast lookups
      projectionsIndex = {};
      if (allProjections) {
        for (const proj of allProjections) {
          if (proj.player_id) {
            projectionsIndex[proj.player_id] = proj;
          }
        }
      }

      // Store indexed version in cache
      projectionsCache.set(indexCacheKey, projectionsIndex);
      console.log(`[ProjectionsCache] Created index for ${cacheKey} with ${Object.keys(projectionsIndex).length} players`);
    } else {
      console.log(`[ProjectionsCache] Index cache hit for ${cacheKey}`);
    }

    // Filter to only requested players using O(1) lookups
    const projectionsMap: Record<string, any> = {};

    for (const playerId of player_ids) {
      const playerProjection = projectionsIndex[playerId];
      if (playerProjection) {
        projectionsMap[playerId] = playerProjection;
      }
    }

    this.respondSuccess(res, projectionsMap, undefined);
  });

  /**
   * Get bulk projections for multiple players across a week range
   * POST /api/player-projections/bulk/:season/weeks
   * Body: { player_ids: string[], start_week: number, end_week: number, season_type?: string }
   */
  getBulkPlayerWeekRangeProjections = this.asyncHandler(async (req: Request, res: Response) => {
    const { season } = req.params;
    const { player_ids, start_week, end_week, season_type = "regular" } = req.body;

    if (!player_ids || !Array.isArray(player_ids)) {
      this.respondBadRequest(res, "player_ids array is required in request body");
      return;
    }

    if (!start_week || !end_week) {
      this.respondBadRequest(res, "start_week and end_week are required in request body");
      return;
    }

    if (start_week > end_week) {
      this.respondBadRequest(res, "start_week cannot be greater than end_week");
      return;
    }

    // Check if we have a cached aggregated result for this exact week range
    const aggregateCacheKey = `week_range_aggregated_${season}_${start_week}_${end_week}_${season_type}`;
    let aggregatedData = projectionsCache.get<Record<string, any>>(aggregateCacheKey);

    if (aggregatedData) {
      console.log(`[ProjectionsCache] Aggregate cache hit for weeks ${start_week}-${end_week}`);

      // Filter to only requested players from cached aggregate
      const projectionsMap: Record<string, any> = {};
      for (const playerId of player_ids) {
        if (aggregatedData[playerId]) {
          projectionsMap[playerId] = aggregatedData[playerId];
        }
      }

      res.status(200).json({
        success: true,
        data: projectionsMap,
        count: Object.keys(projectionsMap).length,
        weeks_queried: end_week - start_week + 1,
      });
      return;
    }

    console.log(`[ProjectionsCache] Aggregate cache miss for weeks ${start_week}-${end_week}, building...`);

    // Fetch projections for each week in parallel with caching and indexing
    const weekPromises = [];
    for (let week = start_week; week <= end_week; week++) {
      const weekCacheKey = `week_projections_${season}_${week}_${season_type}`;
      const weekIndexCacheKey = `${weekCacheKey}_index`;

      weekPromises.push(
        (async () => {
          // Check cache for indexed version first
          let weekIndex = projectionsCache.get<Record<string, any>>(weekIndexCacheKey);

          if (!weekIndex) {
            // Try to get array version
            let weekData = projectionsCache.get<any[]>(weekCacheKey);

            if (!weekData) {
              console.log(`[ProjectionsCache] Cache miss for ${weekCacheKey}, fetching from Sleeper...`);
              const response = await axios.get(
                `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${season_type}`
              );
              weekData = response.data;
              projectionsCache.set(weekCacheKey, weekData);
            } else {
              console.log(`[ProjectionsCache] Cache hit for ${weekCacheKey}`);
            }

            // Create index for fast lookups
            weekIndex = {};
            if (weekData) {
              for (const proj of weekData) {
                if (proj.player_id) {
                  weekIndex[proj.player_id] = proj;
                }
              }
            }

            // Store indexed version
            projectionsCache.set(weekIndexCacheKey, weekIndex);
            console.log(`[ProjectionsCache] Created index for ${weekCacheKey}`);
          } else {
            console.log(`[ProjectionsCache] Index cache hit for ${weekCacheKey}`);
          }

          return { index: weekIndex };
        })()
      );
    }

    const weekResponses = await Promise.all(weekPromises);

    // Build a complete aggregated dataset for ALL players (not just requested ones)
    // This allows future requests for different player sets to use the same cached aggregate
    const allPlayerAggregates: Record<string, any> = {};

    // Collect all unique player IDs across all weeks
    const allPlayerIds = new Set<string>();
    for (const response of weekResponses) {
      const weekIndex = response.index;
      for (const playerId of Object.keys(weekIndex)) {
        allPlayerIds.add(playerId);
      }
    }

    // Aggregate stats for ALL players
    for (const playerId of allPlayerIds) {
      const aggregatedStats: Record<string, number> = {};
      let weeksFound = 0;

      // Sum up stats across all weeks using indexed lookups
      for (const response of weekResponses) {
        const weekIndex = response.index;
        const playerWeekProjection = weekIndex[playerId]; // O(1) lookup

        if (playerWeekProjection && playerWeekProjection.stats) {
          weeksFound++;
          const stats = playerWeekProjection.stats;

          // Aggregate all numeric stats
          for (const [key, value] of Object.entries(stats)) {
            if (typeof value === "number") {
              aggregatedStats[key] = (aggregatedStats[key] || 0) + value;
            }
          }
        }
      }

      if (weeksFound > 0) {
        allPlayerAggregates[playerId] = {
          player_id: playerId,
          stats: aggregatedStats,
          weeks_included: weeksFound,
          week_range: `${start_week}-${end_week}`,
        };
      }
    }

    // Cache the complete aggregated dataset
    projectionsCache.set(aggregateCacheKey, allPlayerAggregates);
    console.log(`[ProjectionsCache] Cached aggregate for weeks ${start_week}-${end_week} with ${Object.keys(allPlayerAggregates).length} players`);

    // Filter to only requested players
    const projectionsMap: Record<string, any> = {};
    for (const playerId of player_ids) {
      if (allPlayerAggregates[playerId]) {
        projectionsMap[playerId] = allPlayerAggregates[playerId];
      }
    }

    res.status(200).json({
      success: true,
      data: projectionsMap,
      count: Object.keys(projectionsMap).length,
      weeks_queried: end_week - start_week + 1,
    });
  });
}

const playerStatsController = new PlayerStatsController();
export const getPlayerStats = playerStatsController.getPlayerStats;
export const getPlayerProjections = playerStatsController.getPlayerProjections;
export const getPlayerStatsById = playerStatsController.getPlayerStatsById;
export const getPlayerSeasonStats = playerStatsController.getPlayerSeasonStats;
export const getPlayerProjectionsById = playerStatsController.getPlayerProjectionsById;
export const getPlayerSeasonProjections = playerStatsController.getPlayerSeasonProjections;
export const getBulkPlayerSeasonStats = playerStatsController.getBulkPlayerSeasonStats;
export const getBulkPlayerSeasonProjections = playerStatsController.getBulkPlayerSeasonProjections;
export const getBulkPlayerWeekRangeProjections = playerStatsController.getBulkPlayerWeekRangeProjections;
