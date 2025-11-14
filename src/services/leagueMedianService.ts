import pool from "../config/database";
import { logger } from "../config/logger";
import { setTransactionTimeouts } from "../utils/transactionTimeout";

/**
 * League Median Service
 *
 * Implements League Median scoring variant where each team has TWO matchups every week:
 * 1. Their normal head-to-head matchup against a leaguemate
 * 2. A matchup against the league median score (teams above median get W, below get L)
 */

/**
 * Calculate the median score for a specific week in a league
 *
 * Algorithm:
 * 1. Query all non-median matchups for that league/week
 * 2. Collect all roster scores (roster1_score and roster2_score from each matchup)
 * 3. Sort scores in ascending order
 * 4. Calculate median: odd = middle value, even = average of two middle values
 *
 * @param leagueId - League ID
 * @param week - Week number
 * @returns The median score, or 0 if no matchups exist
 */
export async function calculateWeekMedian(
  leagueId: number,
  week: number
): Promise<number> {
  try {
    // Query all non-median matchups for this league/week to get roster scores
    const query = `
      SELECT
        roster1_score,
        roster2_score
      FROM matchups
      WHERE league_id = $1
        AND week = $2
        AND (is_median_matchup IS NULL OR is_median_matchup = FALSE)
        AND roster1_score IS NOT NULL
        AND roster2_score IS NOT NULL
    `;

    const result = await pool.query(query, [leagueId, week]);

    // Edge case: no matchups exist
    if (result.rows.length === 0) {
      logger.info(`[LeagueMedian] No matchups found for league ${leagueId}, week ${week}`);
      return 0;
    }

    // Collect all scores from both roster1 and roster2
    const scores: number[] = [];
    for (const row of result.rows) {
      // Add both roster scores to our array
      scores.push(parseFloat(row.roster1_score));
      if (row.roster2_score !== null) {
        scores.push(parseFloat(row.roster2_score));
      }
    }

    // Edge case: handle null or invalid scores
    if (scores.length === 0) {
      logger.info(`[LeagueMedian] No valid scores found for league ${leagueId}, week ${week}`);
      return 0;
    }

    // Sort scores in ascending order
    scores.sort((a, b) => a - b);

    // Calculate median
    const middleIndex = Math.floor(scores.length / 2);
    let median: number;

    if (scores.length % 2 === 0) {
      // Even number of scores: average of two middle values
      median = (scores[middleIndex - 1] + scores[middleIndex]) / 2;
    } else {
      // Odd number of scores: middle value
      median = scores[middleIndex];
    }

    logger.info(
      `[LeagueMedian] Calculated median for league ${leagueId}, week ${week}: ${median.toFixed(2)} (from ${scores.length} scores)`
    );

    return median;
  } catch (error) {
    logger.error("Error calculating week median:", { error });
    throw new Error("Error calculating week median");
  }
}

/**
 * Generate median matchup records for all teams in a specific week
 *
 * Algorithm:
 * 1. Verify league has median matchups enabled
 * 2. Check if week is within configured range
 * 3. Get all rosters for the league
 * 4. Calculate week median
 * 5. Create median matchup for each roster
 *
 * @param leagueId - League ID
 * @param week - Week number
 * @param season - Season year (e.g., "2024")
 */
export async function generateMedianMatchups(
  leagueId: number,
  week: number,
  season: string
): Promise<void> {
  try {
    logger.info(`[LeagueMedian] Generating median matchups for league ${leagueId}, week ${week}, season ${season}`);

    // 1. Get league settings and verify median matchups are enabled
    const leagueQuery = `
      SELECT
        enable_league_median,
        median_matchup_week_start,
        median_matchup_week_end
      FROM leagues
      WHERE id = $1
    `;
    const leagueResult = await pool.query(leagueQuery, [leagueId]);

    if (leagueResult.rows.length === 0) {
      throw new Error("League not found");
    }

    const leagueSettings = leagueResult.rows[0];

    if (!leagueSettings.enable_league_median) {
      throw new Error("League median matchups are not enabled for this league");
    }

    // 2. Check if week is within the configured range
    const startWeek = leagueSettings.median_matchup_week_start;
    const endWeek = leagueSettings.median_matchup_week_end;

    if (startWeek !== null && week < startWeek) {
      logger.info(`[LeagueMedian] Week ${week} is before median matchup start week ${startWeek}, skipping`);
      return;
    }

    if (endWeek !== null && week > endWeek) {
      logger.info(`[LeagueMedian] Week ${week} is after median matchup end week ${endWeek}, skipping`);
      return;
    }

    // 3. Get all rosters for the league
    const rostersQuery = `
      SELECT id
      FROM rosters
      WHERE league_id = $1
      ORDER BY id
    `;
    const rostersResult = await pool.query(rostersQuery, [leagueId]);

    if (rostersResult.rows.length === 0) {
      throw new Error("No rosters found for this league");
    }

    const rosters = rostersResult.rows;

    // 4. Calculate the median score for this week
    // Note: If matchups haven't been scored yet, median will be 0
    const medianScore = await calculateWeekMedian(leagueId, week);

    // 5. Check for existing median matchups (avoid duplicates)
    const existingQuery = `
      SELECT COUNT(*) as count
      FROM matchups
      WHERE league_id = $1
        AND week = $2
        AND is_median_matchup = TRUE
    `;
    const existingResult = await pool.query(existingQuery, [leagueId, week]);
    const existingCount = parseInt(existingResult.rows[0].count);

    if (existingCount > 0) {
      logger.info(`[LeagueMedian] ${existingCount} median matchups already exist for week ${week}, skipping generation`);
      return;
    }

    // 6. Create median matchup for each roster
    const client = await pool.connect();
    await setTransactionTimeouts(client);
    try {
      await client.query("BEGIN");

      for (const roster of rosters) {
        const insertQuery = `
          INSERT INTO matchups (
            league_id,
            season,
            week,
            roster1_id,
            roster2_id,
            is_median_matchup,
            median_score,
            roster1_score,
            roster2_score,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        const values = [
          leagueId,
          season,
          week,
          roster.id,
          null, // roster2_id is null for median matchups
          true, // is_median_matchup
          medianScore,
          null, // roster1_score will be filled when week scores
          null, // roster2_score is always null for median matchups
          "scheduled", // status
        ];

        await client.query(insertQuery, values);
      }

      await client.query("COMMIT");
      logger.info(`[LeagueMedian] Created ${rosters.length} median matchups for week ${week}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error("Error generating median matchups:", { error });
    throw error;
  }
}

/**
 * Update median matchup results after regular matchups are scored
 *
 * Algorithm:
 * 1. Recalculate median score for the week
 * 2. Get all median matchups for league/week
 * 3. Fetch ALL regular matchup scores in ONE query (performance optimization)
 * 4. Build a roster_id -> score lookup map for O(1) access
 * 5. For each median matchup, use pre-fetched score from map to:
 *    - Update roster1_score with that score
 *    - Compare to median_score to determine winner
 *
 * @param leagueId - League ID
 * @param week - Week number
 */
export async function updateMedianMatchupResults(
  leagueId: number,
  week: number
): Promise<void> {
  try {
    logger.info(`[LeagueMedian] Updating median matchup results for league ${leagueId}, week ${week}`);

    // 1. Recalculate the median score based on current matchup results
    const medianScore = await calculateWeekMedian(leagueId, week);

    if (medianScore === 0) {
      logger.info(`[LeagueMedian] Median score is 0, regular matchups may not be scored yet`);
    }

    // 2. Get all median matchups for this league/week
    const medianMatchupsQuery = `
      SELECT
        m.id,
        m.roster1_id,
        m.median_score
      FROM matchups m
      WHERE m.league_id = $1
        AND m.week = $2
        AND m.is_median_matchup = TRUE
    `;

    const medianMatchupsResult = await pool.query(medianMatchupsQuery, [leagueId, week]);

    if (medianMatchupsResult.rows.length === 0) {
      logger.info(`[LeagueMedian] No median matchups found for week ${week}`);
      return;
    }

    // 3. Fetch all regular matchup scores for this week in ONE query
    const regularMatchupsQuery = `
      SELECT
        roster1_id,
        roster1_score,
        roster2_id,
        roster2_score
      FROM matchups
      WHERE league_id = $1
        AND week = $2
        AND (is_median_matchup IS NULL OR is_median_matchup = FALSE)
    `;

    const regularMatchupsResult = await pool.query(regularMatchupsQuery, [leagueId, week]);

    // 4. Create a lookup map: roster_id -> score (O(1) access)
    const rosterScoreMap = new Map<number, number>();

    for (const matchup of regularMatchupsResult.rows) {
      if (matchup.roster1_id && matchup.roster1_score !== null) {
        rosterScoreMap.set(matchup.roster1_id, parseFloat(matchup.roster1_score));
      }
      if (matchup.roster2_id && matchup.roster2_score !== null) {
        rosterScoreMap.set(matchup.roster2_id, parseFloat(matchup.roster2_score));
      }
    }

    logger.info(`[LeagueMedian] Loaded ${rosterScoreMap.size} roster scores into lookup map`);

    const client = await pool.connect();
    await setTransactionTimeouts(client);
    try {
      await client.query("BEGIN");

      // 5. For each median matchup, use the pre-fetched score from the map
      for (const medianMatchup of medianMatchupsResult.rows) {
        // Look up the roster's score from the pre-fetched map (O(1))
        const rosterScore = rosterScoreMap.get(medianMatchup.roster1_id);

        if (rosterScore === undefined) {
          logger.info(`[LeagueMedian] No regular matchup found for roster ${medianMatchup.roster1_id}`);
          continue;
        }

        // Determine winner: if roster score > median score, roster wins (winner_roster_id = roster1_id)
        // Otherwise, median wins (winner_roster_id = null)
        let winnerRosterId: number | null = null;
        if (rosterScore > medianScore) {
          winnerRosterId = medianMatchup.roster1_id;
        }
        // If tied or below median, winner stays null (median wins)

        // Update the median matchup with the roster's score, updated median score, and winner
        const updateQuery = `
          UPDATE matchups
          SET
            roster1_score = $1,
            median_score = $2,
            winner_roster_id = $3,
            status = 'completed',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `;

        await client.query(updateQuery, [
          rosterScore,
          medianScore,
          winnerRosterId,
          medianMatchup.id,
        ]);

        logger.info(
          `[LeagueMedian] Updated median matchup for roster ${medianMatchup.roster1_id}: score ${rosterScore.toFixed(2)} vs median ${medianScore.toFixed(2)}, winner: ${winnerRosterId || "median"}`
        );
      }

      await client.query("COMMIT");
      logger.info(`[LeagueMedian] Updated ${medianMatchupsResult.rows.length} median matchups`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error("Error updating median matchup results:", { error });
    throw error;
  }
}

/**
 * Generate median matchups for all weeks in the median matchup range
 *
 * Algorithm:
 * 1. Get league median settings
 * 2. Verify feature is enabled
 * 3. For each week in range, call generateMedianMatchups
 * 4. Return summary stats
 *
 * @param leagueId - League ID
 * @param season - Season year (e.g., "2024")
 * @returns Summary stats: weeks_generated, matchups_created
 */
export async function generateSeasonMedianMatchups(
  leagueId: number,
  season: string
): Promise<{ weeks_generated: number; matchups_created: number }> {
  try {
    logger.info(`[LeagueMedian] Generating season median matchups for league ${leagueId}, season ${season}`);

    // 1. Get league median settings
    const leagueQuery = `
      SELECT
        enable_league_median,
        median_matchup_week_start,
        median_matchup_week_end
      FROM leagues
      WHERE id = $1
    `;
    const leagueResult = await pool.query(leagueQuery, [leagueId]);

    if (leagueResult.rows.length === 0) {
      throw new Error("League not found");
    }

    const settings = leagueResult.rows[0];

    // 2. Verify feature is enabled
    if (!settings.enable_league_median) {
      throw new Error("League median matchups are not enabled for this league");
    }

    // Validate week range is configured
    if (settings.median_matchup_week_start === null || settings.median_matchup_week_end === null) {
      throw new Error("Median matchup week range is not configured");
    }

    const startWeek = settings.median_matchup_week_start;
    const endWeek = settings.median_matchup_week_end;

    if (startWeek > endWeek) {
      throw new Error("Invalid median matchup week range: start week is after end week");
    }

    // Get number of rosters to calculate total matchups
    const rostersQuery = `
      SELECT COUNT(*) as count
      FROM rosters
      WHERE league_id = $1
    `;
    const rostersResult = await pool.query(rostersQuery, [leagueId]);
    const rosterCount = parseInt(rostersResult.rows[0].count);

    // 3. Generate median matchups for each week in the range
    let weeksGenerated = 0;
    for (let week = startWeek; week <= endWeek; week++) {
      await generateMedianMatchups(leagueId, week, season);
      weeksGenerated++;
    }

    const matchupsCreated = weeksGenerated * rosterCount;

    logger.info(
      `[LeagueMedian] Season generation complete: ${weeksGenerated} weeks, ${matchupsCreated} matchups created`
    );

    return {
      weeks_generated: weeksGenerated,
      matchups_created: matchupsCreated,
    };
  } catch (error) {
    logger.error("Error generating season median matchups:", { error });
    throw error;
  }
}
