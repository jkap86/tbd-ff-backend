import axios from "axios";
import { PoolClient } from "pg";
import { SLEEPER_API_BASE } from "../config/sleeper";
import {
  BaseSyncService,
  SleeperData,
  SyncResult,
} from "./BaseSyncService";

interface SleeperStat extends SleeperData {
  player_id: string;
  week?: number;
  season?: string;
  season_type?: string;
  [key: string]: any;
}

/**
 * Stats sync service - fetches and syncs player stats from Sleeper API
 */
class StatsSyncService extends BaseSyncService<SleeperStat> {
  constructor() {
    super("StatsSync");
  }

  /**
   * Fetch stats from Sleeper API for a given season
   */
  protected async fetchFromApi(
    season: string,
    _identifier: number | string,
    seasonType: string
  ): Promise<SleeperStat[]> {
    const response = await axios.get(
      `${SLEEPER_API_BASE}/stats/nfl/${season}?season_type=${seasonType}`
    );
    return response.data || [];
  }

  /**
   * Process a single stat record within a transaction
   */
  protected async processRecord(
    client: PoolClient,
    stat: SleeperStat,
    season: string,
    _identifier: number | string,
    seasonType: string
  ): Promise<void> {
    // Get player database ID
    const playerId = await this.getPlayerId(client, stat.player_id);
    if (!playerId) {
      return; // Skip if player not found
    }

    const week = stat.week || 0; // 0 for season totals

    // Build and execute UPSERT query
    const { query, params } = this.buildStatsUpsertQuery(
      "player_stats",
      playerId,
      week,
      season,
      seasonType,
      stat
    );

    await client.query(query, params);
  }

  /**
   * Sync player stats for a specific season
   */
  async syncSeasonStats(
    season: string,
    seasonType: string = "regular"
  ): Promise<SyncResult> {
    return this.syncData(season, season, seasonType, season);
  }

  /**
   * Sync multiple seasons in parallel
   */
  async syncAllSeasons(seasons: string[]): Promise<void> {
    return this.syncParallel(
      seasons,
      (season) => this.syncSeasonStats(season, "regular"),
      (season) => `Season ${season}`
    );
  }
}

// Export singleton instance
const statsSyncService = new StatsSyncService();

// Export public API functions
export const syncSeasonStats = (
  season: string,
  seasonType?: string
): Promise<SyncResult> => statsSyncService.syncSeasonStats(season, seasonType);

export const syncAllSeasons = (seasons: string[]): Promise<void> =>
  statsSyncService.syncAllSeasons(seasons);
