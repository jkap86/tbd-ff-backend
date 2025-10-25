import { Request, Response } from "express";
import { bulkUpsertPlayers, getAllPlayers } from "../models/Player";
import https from "https";

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
 * Sync players from Sleeper API
 * POST /api/players/sync
 */
export async function syncPlayersHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    console.log("Fetching players from Sleeper API...");

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

    console.log(`Found ${activePlayers.length} active players`);

    // Bulk upsert players
    const upsertedCount = await bulkUpsertPlayers(activePlayers);

    res.status(200).json({
      success: true,
      message: `Successfully synced ${upsertedCount} active players from Sleeper`,
      data: {
        total_active: activePlayers.length,
        synced: upsertedCount,
      },
    });
  } catch (error: any) {
    console.error("Error syncing players:", error);
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
    console.error("Error getting players:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting players",
    });
  }
}
