import pool from "../config/database";
import { logger } from "../config/logger";
import { isWeekComplete } from "./sleeperScheduleService";

/**
 * Update roster records (W-L-T) and points based on matchup results
 */
export async function finalizeWeekScores(
  leagueId: number,
  week: number,
  season: string,
  seasonType: string = "regular"
): Promise<void> {
  try {
    logger.info(`[FinalizeScores] Checking if week ${week} is complete...`);

    // Check if week is complete
    const weekComplete = await isWeekComplete(season, week, seasonType);

    if (!weekComplete) {
      logger.info(`[FinalizeScores] Week ${week} is not complete yet, skipping finalization`);
      return;
    }

    logger.info(`[FinalizeScores] Week ${week} is complete, finalizing scores...`);

    // Get all matchups for this week that haven't been finalized yet
    const matchupsQuery = `
      SELECT id, roster1_id, roster2_id, roster1_score, roster2_score
      FROM matchups
      WHERE league_id = $1 AND week = $2 AND season = $3 AND (finalized IS NULL OR finalized = FALSE)
    `;
    const matchupsResult = await pool.query(matchupsQuery, [
      leagueId,
      week,
      season,
    ]);
    const matchups = matchupsResult.rows;

    if (matchups.length === 0) {
      logger.info(`[FinalizeScores] All matchups for week ${week} already finalized`);
      return;
    }

    logger.info(`[FinalizeScores] Found ${matchups.length} matchups to finalize`);

    // Collect all unique roster IDs that need to be updated
    const rosterIds = new Set<number>();
    for (const matchup of matchups) {
      rosterIds.add(matchup.roster1_id);
      if (matchup.roster2_id !== null) {
        rosterIds.add(matchup.roster2_id);
      }
    }

    // Fetch all roster settings in one query
    const rostersQuery = `
      SELECT id, settings
      FROM rosters
      WHERE id = ANY($1::int[])
    `;
    const rostersResult = await pool.query(rostersQuery, [Array.from(rosterIds)]);
    const rostersMap = new Map(
      rostersResult.rows.map((r) => [r.id, r.settings || {}])
    );

    // Calculate new records for each roster
    const rosterUpdates = new Map<number, {
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
    }>();

    // Initialize all rosters with their current stats
    for (const [rosterId, settings] of rostersMap.entries()) {
      rosterUpdates.set(rosterId, {
        wins: Number(settings.wins) || 0,
        losses: Number(settings.losses) || 0,
        ties: Number(settings.ties) || 0,
        pointsFor: Number(settings.points_for) || 0,
        pointsAgainst: Number(settings.points_against) || 0,
      });
    }

    // Process each matchup and accumulate updates
    for (const matchup of matchups) {
      const { roster1_id, roster2_id, roster1_score, roster2_score } = matchup;

      const isByeWeek = roster2_id === null;
      const numScore1 = Number(roster1_score);
      const numScore2 = Number(roster2_score);

      // Update roster 1
      const roster1Update = rosterUpdates.get(roster1_id)!;
      roster1Update.pointsFor += numScore1;
      roster1Update.pointsAgainst += numScore2;

      if (!isByeWeek) {
        if (numScore1 > numScore2) {
          roster1Update.wins++;
        } else if (numScore1 < numScore2) {
          roster1Update.losses++;
        } else {
          roster1Update.ties++;
        }
      }

      // Update roster 2 if not bye week
      if (!isByeWeek) {
        const roster2Update = rosterUpdates.get(roster2_id!)!;
        roster2Update.pointsFor += numScore2;
        roster2Update.pointsAgainst += numScore1;

        if (numScore2 > numScore1) {
          roster2Update.wins++;
        } else if (numScore2 < numScore1) {
          roster2Update.losses++;
        } else {
          roster2Update.ties++;
        }
      }
    }

    // Batch update all rosters in a single query using CASE statements
    if (rosterUpdates.size > 0) {
      const rosterIdsList: number[] = [];
      const winsValues: number[] = [];
      const lossesValues: number[] = [];
      const tiesValues: number[] = [];
      const pointsForValues: number[] = [];
      const pointsAgainstValues: number[] = [];

      for (const [rosterId, update] of rosterUpdates.entries()) {
        rosterIdsList.push(rosterId);
        winsValues.push(update.wins);
        lossesValues.push(update.losses);
        tiesValues.push(update.ties);
        pointsForValues.push(update.pointsFor);
        pointsAgainstValues.push(update.pointsAgainst);
      }

      // Build the batch UPDATE query
      const batchUpdateQuery = `
        UPDATE rosters
        SET
          settings = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(settings, '{}'::jsonb),
                    '{wins}', to_jsonb(wins_data.value)
                  ),
                  '{losses}', to_jsonb(losses_data.value)
                ),
                '{ties}', to_jsonb(ties_data.value)
              ),
              '{points_for}', to_jsonb(pf_data.value)
            ),
            '{points_against}', to_jsonb(pa_data.value)
          ),
          updated_at = CURRENT_TIMESTAMP
        FROM
          (SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS value) AS wins_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($3::int[]) AS value) AS losses_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($4::int[]) AS value) AS ties_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($5::numeric[]) AS value) AS pf_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($6::numeric[]) AS value) AS pa_data
        WHERE
          rosters.id = wins_data.id
          AND rosters.id = losses_data.id
          AND rosters.id = ties_data.id
          AND rosters.id = pf_data.id
          AND rosters.id = pa_data.id
      `;

      await pool.query(batchUpdateQuery, [
        rosterIdsList,
        winsValues,
        lossesValues,
        tiesValues,
        pointsForValues,
        pointsAgainstValues,
      ]);

      logger.info(
        `[FinalizeScores] Batch updated ${rosterUpdates.size} rosters`
      );

      // Log individual roster updates for debugging
      for (const [rosterId, update] of rosterUpdates.entries()) {
        logger.info(
          `[UpdateRecord] Roster ${rosterId}: ${update.wins}-${update.losses}-${update.ties}, PF: ${update.pointsFor.toFixed(
            2
          )}, PA: ${update.pointsAgainst.toFixed(2)}`
        );
      }
    }

    // Batch update all matchups as finalized in a single query
    const matchupIds = matchups.map((m) => m.id);
    const batchMatchupUpdateQuery = `
      UPDATE matchups
      SET finalized = TRUE, status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::int[])
    `;
    await pool.query(batchMatchupUpdateQuery, [matchupIds]);

    logger.info(`[FinalizeScores] Successfully finalized week ${week} scores`);
  } catch (error) {
    logger.error("Error finalizing week scores:", { error });
    throw error;
  }
}

/**
 * Reset all roster records (for testing or league reset)
 */
export async function resetAllRosterRecords(leagueId: number): Promise<void> {
  try {
    const query = `
      UPDATE rosters
      SET settings = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(settings, '{}'::jsonb),
                '{wins}', '0'
              ),
              '{losses}', '0'
            ),
            '{ties}', '0'
          ),
          '{points_for}', '0'
        ),
        '{points_against}', '0'
      )
      WHERE league_id = $1
    `;

    await pool.query(query, [leagueId]);
    logger.info(`[ResetRecords] Reset all roster records for league ${leagueId}`);
  } catch (error) {
    logger.error("Error resetting roster records:", { error });
    throw error;
  }
}

/**
 * Recalculate all records from completed matchups
 * This is used to fix corrupted records
 */
export async function recalculateAllRecords(
  leagueId: number,
  season: string
): Promise<void> {
  try {
    logger.info(
      `[RecalculateRecords] Starting recalculation for league ${leagueId}`
    );

    // Get league to get start week
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(leagueId);
    const startWeek = league?.settings?.start_week || 1;

    logger.info(
      `[RecalculateRecords] League start week is ${startWeek}`
    );

    // First, reset all records to 0
    await resetAllRosterRecords(leagueId);

    // Mark all matchups as not finalized so they can be reprocessed
    const resetMatchupsQuery = `
      UPDATE matchups
      SET finalized = FALSE
      WHERE league_id = $1 AND season = $2
    `;
    await pool.query(resetMatchupsQuery, [leagueId, season]);

    // Get all completed matchups from start week onwards, in order by week
    const matchupsQuery = `
      SELECT id, week, roster1_id, roster2_id, roster1_score, roster2_score
      FROM matchups
      WHERE league_id = $1 AND season = $2 AND status = 'completed' AND week >= $3
      ORDER BY week ASC
    `;
    const matchupsResult = await pool.query(matchupsQuery, [leagueId, season, startWeek]);
    const matchups = matchupsResult.rows;

    logger.info(
      `[RecalculateRecords] Found ${matchups.length} completed matchups to process`
    );

    if (matchups.length === 0) {
      logger.info(`[RecalculateRecords] No matchups to process`);
      return;
    }

    // Collect all unique roster IDs that need to be updated
    const rosterIds = new Set<number>();
    for (const matchup of matchups) {
      rosterIds.add(matchup.roster1_id);
      if (matchup.roster2_id !== null) {
        rosterIds.add(matchup.roster2_id);
      }
    }

    // Initialize roster updates map with zeros
    const rosterUpdates = new Map<number, {
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
    }>();

    for (const rosterId of rosterIds) {
      rosterUpdates.set(rosterId, {
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      });
    }

    // Process each matchup and accumulate updates
    for (const matchup of matchups) {
      const { week, roster1_id, roster2_id, roster1_score, roster2_score } = matchup;

      const isByeWeek = roster2_id === null;
      const numScore1 = Number(roster1_score);
      const numScore2 = Number(roster2_score);

      logger.info(
        `[RecalculateRecords] Processing week ${week} matchup: Roster ${roster1_id} (${numScore1}) vs ${
          isByeWeek ? "BYE" : `Roster ${roster2_id} (${numScore2})`
        }`
      );

      // Update roster 1
      const roster1Update = rosterUpdates.get(roster1_id)!;
      roster1Update.pointsFor += numScore1;
      roster1Update.pointsAgainst += numScore2;

      if (!isByeWeek) {
        if (numScore1 > numScore2) {
          roster1Update.wins++;
        } else if (numScore1 < numScore2) {
          roster1Update.losses++;
        } else {
          roster1Update.ties++;
        }
      }

      // Update roster 2 if not bye week
      if (!isByeWeek) {
        const roster2Update = rosterUpdates.get(roster2_id!)!;
        roster2Update.pointsFor += numScore2;
        roster2Update.pointsAgainst += numScore1;

        if (numScore2 > numScore1) {
          roster2Update.wins++;
        } else if (numScore2 < numScore1) {
          roster2Update.losses++;
        } else {
          roster2Update.ties++;
        }
      }
    }

    // Batch update all rosters in a single query
    if (rosterUpdates.size > 0) {
      const rosterIdsList: number[] = [];
      const winsValues: number[] = [];
      const lossesValues: number[] = [];
      const tiesValues: number[] = [];
      const pointsForValues: number[] = [];
      const pointsAgainstValues: number[] = [];

      for (const [rosterId, update] of rosterUpdates.entries()) {
        rosterIdsList.push(rosterId);
        winsValues.push(update.wins);
        lossesValues.push(update.losses);
        tiesValues.push(update.ties);
        pointsForValues.push(update.pointsFor);
        pointsAgainstValues.push(update.pointsAgainst);
      }

      // Build the batch UPDATE query
      const batchUpdateQuery = `
        UPDATE rosters
        SET
          settings = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(settings, '{}'::jsonb),
                    '{wins}', to_jsonb(wins_data.value)
                  ),
                  '{losses}', to_jsonb(losses_data.value)
                ),
                '{ties}', to_jsonb(ties_data.value)
              ),
              '{points_for}', to_jsonb(pf_data.value)
            ),
            '{points_against}', to_jsonb(pa_data.value)
          ),
          updated_at = CURRENT_TIMESTAMP
        FROM
          (SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS value) AS wins_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($3::int[]) AS value) AS losses_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($4::int[]) AS value) AS ties_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($5::numeric[]) AS value) AS pf_data,
          (SELECT UNNEST($1::int[]) AS id, UNNEST($6::numeric[]) AS value) AS pa_data
        WHERE
          rosters.id = wins_data.id
          AND rosters.id = losses_data.id
          AND rosters.id = ties_data.id
          AND rosters.id = pf_data.id
          AND rosters.id = pa_data.id
      `;

      await pool.query(batchUpdateQuery, [
        rosterIdsList,
        winsValues,
        lossesValues,
        tiesValues,
        pointsForValues,
        pointsAgainstValues,
      ]);

      logger.info(
        `[RecalculateRecords] Batch updated ${rosterUpdates.size} rosters`
      );

      // Log individual roster final totals for debugging
      for (const [rosterId, update] of rosterUpdates.entries()) {
        logger.info(
          `[RecalculateRecords] Final - Roster ${rosterId}: ${update.wins}-${update.losses}-${update.ties}, PF: ${update.pointsFor.toFixed(
            2
          )}, PA: ${update.pointsAgainst.toFixed(2)}`
        );
      }
    }

    // Batch update all matchups as finalized in a single query
    const matchupIds = matchups.map((m) => m.id);
    const batchMatchupUpdateQuery = `
      UPDATE matchups
      SET finalized = TRUE
      WHERE id = ANY($1::int[])
    `;
    await pool.query(batchMatchupUpdateQuery, [matchupIds]);

    logger.info(
      `[RecalculateRecords] Successfully recalculated all records for league ${leagueId}`
    );
  } catch (error) {
    logger.error("Error recalculating records:", { error });
    throw error;
  }
}
