import { Request, Response } from "express";
import { bulkUpsertPlayers, getAllPlayers, getPlayersByIds } from "../models/Player";
import https from "https";
import { logger } from "../utils/logger";

/**
 * Fetch players from Sleeper API
 */
async function fetchSleeperPlayers(): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get("https://api.sleeper.app/v1/players/nfl", (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const players = JSON.parse(data);
            resolve(players);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

/**
 * Sync players from Sleeper (reusable function for scheduler)
 */
export async function syncPlayers(): Promise<number> {
  try {
    console.log("[PlayerSync] Fetching players from Sleeper API...");

    // Fetch players from Sleeper API
    const sleeperPlayersData = await fetchSleeperPlayers();

    // Transform data - filter for active players and extract needed fields
    const activePlayers = Object.entries(sleeperPlayersData)
      .filter(([_, playerData]: [string, any]) => {
        // Only include active players
        return playerData.active === true;
      })
      .map(([playerId, playerData]: [string, any]) => ({
        player_id: playerId,
        full_name: playerData.full_name || `${playerData.first_name || ""} ${playerData.last_name || ""}`.trim() || "Unknown",
        position: playerData.position || "UNK",
        team: playerData.team || null,
        age: playerData.age || null,
        years_exp: playerData.years_exp || null,
        search_rank: playerData.search_rank || null,
        fantasy_data_id: playerData.fantasy_data_id || null,
      }))
      .filter((player) => player.full_name !== "Unknown"); // Filter out players without names

    console.log(`[PlayerSync] Found ${activePlayers.length} active players`);

    // Bulk upsert players
    const upsertedCount = await bulkUpsertPlayers(activePlayers);

    console.log(`[PlayerSync] Successfully synced ${upsertedCount} players`);
    return upsertedCount;
  } catch (error: any) {
    logger.error("[PlayerSync] Error syncing players:", error);
    throw error;
  }
}

/**
 * Sync players from Sleeper API
 * POST /api/players/sync
 */
export async function syncPlayersHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const upsertedCount = await syncPlayers();

    res.status(200).json({
      success: true,
      message: `Successfully synced ${upsertedCount} active players from Sleeper`,
      data: {
        synced: upsertedCount,
      },
    });
  } catch (error: any) {
    logger.error("Error syncing players:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error syncing players from Sleeper",
    });
  }
}

/**
 * Get all players with optional filtering
 * GET /api/players
 */
export async function getPlayersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { position, team, search } = req.query;

    const players = await getAllPlayers({
      position: position as string,
      team: team as string,
      search: search as string,
    });

    res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error: any) {
    logger.error("Error getting players:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting players",
    });
  }
}

/**
 * Get multiple players by IDs (bulk fetch)
 * POST /api/players/bulk
 */
export async function getPlayersBulkHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { player_ids } = req.body;

    if (!Array.isArray(player_ids)) {
      res.status(400).json({
        success: false,
        message: "player_ids must be an array",
      });
      return;
    }

    // Convert to numbers and filter out invalid values
    const playerIds = player_ids
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    if (playerIds.length === 0) {
      res.status(200).json({
        success: true,
        data: [],
      });
      return;
    }

    const players = await getPlayersByIds(playerIds);

    res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error: any) {
    logger.error("Error getting players by IDs:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting players by IDs",
    });
  }
}
