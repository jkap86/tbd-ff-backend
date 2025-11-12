// REFACTORED: Using BaseController pattern to eliminate repetitive try-catch blocks
// Before: 178 lines | After: 139 lines | Saved: 39 lines

import { Request, Response } from "express";
import { bulkUpsertPlayers, getAllPlayers, getPlayersByIds } from "../models/Player";
import https from "https";
import { logger } from "../utils/logger";
import { BaseController } from "./BaseController";

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

class PlayerController extends BaseController {
  /**
   * Sync players from Sleeper API
   * POST /api/players/sync
   */
  syncPlayersHandler = this.asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const upsertedCount = await syncPlayers();

    this.respondSuccess(res, {
      synced: upsertedCount,
    }, `Successfully synced ${upsertedCount} active players from Sleeper`);
  });

  /**
   * Get all players with optional filtering
   * GET /api/players
   */
  getPlayersHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { position, team, search } = req.query;

    const players = await getAllPlayers({
      position: position as string,
      team: team as string,
      search: search as string,
    });

    this.respondSuccess(res, players);
  });

  /**
   * Get multiple players by IDs (bulk fetch)
   * POST /api/players/bulk
   */
  getPlayersBulkHandler = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { player_ids } = req.body;

    if (!Array.isArray(player_ids)) {
      this.respondBadRequest(res, "player_ids must be an array");
      return;
    }

    // Convert to numbers and filter out invalid values
    const playerIds = player_ids
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    if (playerIds.length === 0) {
      this.respondSuccess(res, []);
      return;
    }

    const players = await getPlayersByIds(playerIds);
    this.respondSuccess(res, players);
  });
}

// Export controller instance methods as standalone functions
const controller = new PlayerController();
export const syncPlayersHandler = controller.syncPlayersHandler;
export const getPlayersHandler = controller.getPlayersHandler;
export const getPlayersBulkHandler = controller.getPlayersBulkHandler;
