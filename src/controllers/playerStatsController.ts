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
