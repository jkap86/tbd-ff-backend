import { Request, Response } from "express";
import axios from "axios";

const SLEEPER_API_BASE = "https://api.sleeper.com";

/**
 * Get player stats for a specific week
 * GET /api/player-stats/:season/:week
 */
export async function getPlayerStats(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { season, week } = req.params;
    const { season_type = "regular" } = req.query;

    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}/${week}?season_type=${season_type}`
    );

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    console.error("Error fetching player stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching player stats",
    });
  }
}

/**
 * Get player projections for a specific week
 * GET /api/player-projections/:season/:week
 */
export async function getPlayerProjections(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { season, week } = req.params;
    const { season_type = "regular" } = req.query;

    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${season_type}`
    );

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    console.error("Error fetching player projections:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching player projections",
    });
  }
}

/**
 * Get stats for a specific player
 * GET /api/player-stats/:season/:week/:playerId
 */
export async function getPlayerStatsById(
  req: Request,
  res: Response
): Promise<void> {
  try {
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
      res.status(404).json({
        success: false,
        message: "Player stats not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: playerStats,
    });
  } catch (error: any) {
    console.error("Error fetching player stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching player stats",
    });
  }
}

/**
 * Get full season stats for a specific player (no week = full season)
 * GET /api/player-stats/:season/:playerId
 */
export async function getPlayerSeasonStats(
  req: Request,
  res: Response
): Promise<void> {
  try {
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
      res.status(404).json({
        success: false,
        message: "Player season stats not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: playerStats,
    });
  } catch (error: any) {
    console.error("Error fetching player season stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching player season stats",
    });
  }
}

/**
 * Get projections for a specific player
 * GET /api/player-projections/:season/:week/:playerId
 */
export async function getPlayerProjectionsById(
  req: Request,
  res: Response
): Promise<void> {
  try {
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
      res.status(404).json({
        success: false,
        message: "Player projections not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: playerProjections,
    });
  } catch (error: any) {
    console.error("Error fetching player projections:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching player projections",
    });
  }
}

/**
 * Get full season projections for a specific player (no week = full season)
 * GET /api/player-projections/:season/:playerId
 */
export async function getPlayerSeasonProjections(
  req: Request,
  res: Response
): Promise<void> {
  try {
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
      res.status(404).json({
        success: false,
        message: "Player season projections not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: playerProjections,
    });
  } catch (error: any) {
    console.error("Error fetching player season projections:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching player season projections",
    });
  }
}

/**
 * Get bulk season stats for multiple players
 * POST /api/player-stats/bulk/:season
 * Body: { player_ids: string[], season_type?: string }
 */
export async function getBulkPlayerSeasonStats(
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

    // Fetch all season stats from Sleeper
    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}?season_type=${season_type}`
    );

    // Filter to only requested players and create a map
    const statsMap: Record<string, any> = {};
    const allStats = response.data;

    for (const playerId of player_ids) {
      const playerStat = allStats.find(
        (stat: any) => stat.player_id === playerId
      );
      if (playerStat) {
        statsMap[playerId] = playerStat;
      }
    }

    res.status(200).json({
      success: true,
      data: statsMap,
      count: Object.keys(statsMap).length,
    });
  } catch (error: any) {
    console.error("Error fetching bulk player season stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching bulk player season stats",
    });
  }
}

/**
 * Get bulk season projections for multiple players
 * POST /api/player-projections/bulk/:season
 * Body: { player_ids: string[], season_type?: string }
 */
export async function getBulkPlayerSeasonProjections(
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

    // Fetch all season projections from Sleeper
    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}?season_type=${season_type}`
    );

    // Filter to only requested players and create a map
    const projectionsMap: Record<string, any> = {};
    const allProjections = response.data;

    for (const playerId of player_ids) {
      const playerProjection = allProjections.find(
        (proj: any) => proj.player_id === playerId
      );
      if (playerProjection) {
        projectionsMap[playerId] = playerProjection;
      }
    }

    res.status(200).json({
      success: true,
      data: projectionsMap,
      count: Object.keys(projectionsMap).length,
    });
  } catch (error: any) {
    console.error("Error fetching bulk player season projections:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching bulk player season projections",
    });
  }
}

/**
 * Get bulk projections for multiple players across a week range
 * POST /api/player-projections/bulk/:season/weeks
 * Body: { player_ids: string[], start_week: number, end_week: number, season_type?: string }
 */
export async function getBulkPlayerWeekRangeProjections(
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

    if (start_week > end_week) {
      res.status(400).json({
        success: false,
        message: "start_week cannot be greater than end_week",
      });
      return;
    }

    // Fetch projections for each week in parallel
    const weekPromises = [];
    for (let week = start_week; week <= end_week; week++) {
      weekPromises.push(
        axios.get(
          `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${season_type}`
        )
      );
    }

    const weekResponses = await Promise.all(weekPromises);

    // Aggregate projections for each player
    const projectionsMap: Record<string, any> = {};

    for (const playerId of player_ids) {
      const aggregatedStats: Record<string, number> = {};
      let weeksFound = 0;

      // Sum up stats across all weeks
      for (const response of weekResponses) {
        const weekProjections = response.data;
        const playerWeekProjection = weekProjections.find(
          (proj: any) => proj.player_id === playerId
        );

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
        projectionsMap[playerId] = {
          player_id: playerId,
          stats: aggregatedStats,
          weeks_included: weeksFound,
          week_range: `${start_week}-${end_week}`,
        };
      }
    }

    res.status(200).json({
      success: true,
      data: projectionsMap,
      count: Object.keys(projectionsMap).length,
      weeks_queried: end_week - start_week + 1,
    });
  } catch (error: any) {
    console.error("Error fetching bulk player week range projections:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching bulk player week range projections",
    });
  }
}
