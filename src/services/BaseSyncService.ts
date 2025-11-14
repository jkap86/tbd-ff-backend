import { PoolClient } from "pg";
import pool from "../config/database";
import { logger } from "../utils/logger";

/**
 * Result of a sync operation
 */
export interface SyncResult {
  synced: number;
  errors: number;
}

/**
 * Base interface for Sleeper API data
 */
export interface SleeperData {
  player_id: string;
  week?: number;
  season?: string;
  season_type?: string;
  [key: string]: any;
}

/**
 * Abstract base class for sync services that fetch data from Sleeper API
 * and sync it to the database using batch processing and transactions.
 */
export abstract class BaseSyncService<T extends SleeperData> {
  protected readonly batchSize: number = 100;
  protected readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Fetch data from Sleeper API
   * Must be implemented by subclasses to specify the endpoint
   */
  protected abstract fetchFromApi(
    season: string,
    identifier: number | string,
    seasonType: string
  ): Promise<T[]>;

  /**
   * Process a single record within a transaction
   * Must be implemented by subclasses to specify the table and columns
   */
  protected abstract processRecord(
    client: PoolClient,
    record: T,
    season: string,
    identifier: number | string,
    seasonType: string
  ): Promise<void>;

  /**
   * Get player database ID from Sleeper player_id
   */
  protected async getPlayerId(
    client: PoolClient,
    sleeperPlayerId: string
  ): Promise<number | null> {
    const playerResult = await client.query(
      "SELECT id FROM players WHERE player_id = $1",
      [sleeperPlayerId]
    );

    if (playerResult.rows.length === 0) {
      logger.warn(
        `[${this.serviceName}] Player not found for player_id ${sleeperPlayerId}, skipping`
      );
      return null;
    }

    return playerResult.rows[0].id;
  }

  /**
   * Process a batch of records within a transaction
   */
  protected async processBatch(
    records: T[],
    season: string,
    identifier: number | string,
    seasonType: string
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const record of records) {
        await this.processRecord(client, record, season, identifier, seasonType);
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
   * Sync data from Sleeper API in batches
   */
  protected async syncData(
    season: string,
    identifier: number | string,
    seasonType: string,
    identifierLabel: string
  ): Promise<SyncResult> {
    logger.info(
      `[${this.serviceName}] Starting sync for ${season} ${identifierLabel} ${seasonType}...`
    );

    try {
      // Fetch data from Sleeper API
      const data = await this.fetchFromApi(season, identifier, seasonType);

      if (!data || data.length === 0) {
        logger.info(
          `[${this.serviceName}] No data found for ${season} ${identifierLabel}`
        );
        return { synced: 0, errors: 0 };
      }

      logger.info(
        `[${this.serviceName}] Fetched ${data.length} records from Sleeper`
      );

      let synced = 0;
      let errors = 0;

      // Process in batches for better performance
      for (let i = 0; i < data.length; i += this.batchSize) {
        const batch = data.slice(i, i + this.batchSize);

        try {
          await this.processBatch(batch, season, identifier, seasonType);
          synced += batch.length;
        } catch (error) {
          logger.error(
            `[${this.serviceName}] Error processing batch ${i}-${i + batch.length}:`,
            error
          );
          errors += batch.length;
        }
      }

      logger.info(
        `[${this.serviceName}] Completed: ${synced} synced, ${errors} errors`
      );
      return { synced, errors };
    } catch (error) {
      logger.error(
        `[${this.serviceName}] Error syncing data for ${season} ${identifierLabel}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Sync multiple items in parallel using Promise.allSettled
   */
  protected async syncParallel<I>(
    items: I[],
    syncFn: (item: I) => Promise<SyncResult>,
    getLabel: (item: I) => string
  ): Promise<void> {
    logger.info(
      `[${this.serviceName}] Syncing ${items.length} items in parallel...`
    );

    const promises = items.map((item) => syncFn(item));
    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      const label = getLabel(items[index]);
      if (result.status === "fulfilled") {
        logger.info(
          `[${this.serviceName}] ${label}: ${result.value.synced} synced, ${result.value.errors} errors`
        );
      } else {
        logger.error(
          `[${this.serviceName}] ${label} failed:`,
          result.reason
        );
      }
    });
  }

  /**
   * Build a stats/projections UPSERT query with parameters
   * Common for both stats and projections tables
   */
  protected buildStatsUpsertQuery(
    tableName: string,
    playerId: number,
    week: number,
    season: string,
    seasonType: string,
    data: T
  ): { query: string; params: any[] } {
    const query = `
      INSERT INTO ${tableName} (
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
    `;

    const params = [
      playerId,
      week,
      season,
      seasonType,
      data.pass_att || 0,
      data.pass_cmp || 0,
      data.pass_yd || 0,
      data.pass_td || 0,
      data.pass_int || 0,
      data.pass_2pt || 0,
      data.rush_att || 0,
      data.rush_yd || 0,
      data.rush_td || 0,
      data.rush_2pt || 0,
      data.rec_tgt || 0,
      data.rec || 0,
      data.rec_yd || 0,
      data.rec_td || 0,
      data.rec_2pt || 0,
      data.fum_lost || 0,
      data.fgm || 0,
      data.fga || 0,
      data.fgm_0_19 || 0,
      data.fgm_20_29 || 0,
      data.fgm_30_39 || 0,
      data.fgm_40_49 || 0,
      data.fgm_50p || 0,
      data.xpm || 0,
      data.xpa || 0,
      data.def_td || 0,
      data.st_td || 0,
      data.def_int || 0,
      data.def_fr || 0,
      data.def_sack || 0,
      data.def_safe || 0,
      data.def_pa || 0,
      data.def_ya || 0,
      data.tkl_solo || 0,
      data.tkl_ast || 0,
      data.tkl_loss || 0,
      data.qb_hit || 0,
      data.pass_def || 0,
    ];

    return { query, params };
  }
}
