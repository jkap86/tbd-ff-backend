import axios from "axios";
import { PoolClient } from "pg";
import { SLEEPER_API_BASE } from "../config/sleeper";
import {
  BaseSyncService,
  SleeperData,
  SyncResult,
} from "./BaseSyncService";

interface SleeperProjection extends SleeperData {
  player_id: string;
  week?: number;
  season?: string;
  season_type?: string;
  [key: string]: any;
}

/**
 * Projections sync service - fetches and syncs player projections from Sleeper API
 */
class ProjectionsSyncService extends BaseSyncService<SleeperProjection> {
  constructor() {
    super("ProjectionsSync");
  }

  /**
   * Fetch projections from Sleeper API for a given week
   */
  protected async fetchFromApi(
    season: string,
    identifier: number | string,
    seasonType: string
  ): Promise<SleeperProjection[]> {
    const week = identifier;
    const response = await axios.get(
      `${SLEEPER_API_BASE}/projections/nfl/${season}/${week}?season_type=${seasonType}`
    );
    return response.data || [];
  }

  /**
   * Process a single projection record within a transaction
   */
  protected async processRecord(
    client: PoolClient,
    projection: SleeperProjection,
    season: string,
    identifier: number | string,
    seasonType: string
  ): Promise<void> {
    // Get player database ID
    const playerId = await this.getPlayerId(client, projection.player_id);
    if (!playerId) {
      return; // Skip if player not found
    }

    const week = identifier as number;

    // Build and execute UPSERT query
    const { query, params } = this.buildStatsUpsertQuery(
      "player_projections",
      playerId,
      week,
      season,
      seasonType,
      projection
    );

    await client.query(query, params);
  }

  /**
   * Sync player projections for a specific week
   */
  async syncWeekProjections(
    season: string,
    week: number,
    seasonType: string = "regular"
  ): Promise<SyncResult> {
    return this.syncData(season, week, seasonType, `week ${week}`);
  }

  /**
   * Sync multiple weeks in parallel
   */
  async syncWeekRange(
    season: string,
    startWeek: number,
    endWeek: number
  ): Promise<void> {
    const weeks: number[] = [];
    for (let week = startWeek; week <= endWeek; week++) {
      weeks.push(week);
    }

    return this.syncParallel(
      weeks,
      (week) => this.syncWeekProjections(season, week, "regular"),
      (week) => `Week ${week}`
    );
  }
}

// Export singleton instance
const projectionsSyncService = new ProjectionsSyncService();

// Export public API functions
export const syncWeekProjections = (
  season: string,
  week: number,
  seasonType?: string
): Promise<SyncResult> =>
  projectionsSyncService.syncWeekProjections(season, week, seasonType);

export const syncWeekRange = (
  season: string,
  startWeek: number,
  endWeek: number
): Promise<void> =>
  projectionsSyncService.syncWeekRange(season, startWeek, endWeek);
