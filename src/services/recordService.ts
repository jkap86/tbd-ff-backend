import pool from "../config/database";
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
    console.log(`[FinalizeScores] Checking if week ${week} is complete...`);

    // Check if week is complete
    const weekComplete = await isWeekComplete(season, week, seasonType);

    if (!weekComplete) {
      console.log(`[FinalizeScores] Week ${week} is not complete yet, skipping finalization`);
      return;
    }

    console.log(`[FinalizeScores] Week ${week} is complete, finalizing scores...`);

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
      console.log(`[FinalizeScores] All matchups for week ${week} already finalized`);
      return;
    }

    console.log(`[FinalizeScores] Found ${matchups.length} matchups to finalize`);

    // Process each matchup
    for (const matchup of matchups) {
      const { id, roster1_id, roster2_id, roster1_score, roster2_score } =
        matchup;

      // Update roster 1
      await updateRosterRecord(
        roster1_id,
        roster1_score,
        roster2_score,
        roster2_id === null // is bye week
      );

      // Update roster 2 if not bye week
      if (roster2_id !== null) {
        await updateRosterRecord(roster2_id, roster2_score, roster1_score, false);
      }

      // Mark matchup as finalized
      const updateMatchupQuery = `
        UPDATE matchups
        SET finalized = TRUE, status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      await pool.query(updateMatchupQuery, [id]);

      console.log(`[FinalizeScores] Finalized matchup ${id}`);
    }

    console.log(`[FinalizeScores] Successfully finalized week ${week} scores`);
  } catch (error) {
    console.error("Error finalizing week scores:", error);
    throw error;
  }
}

/**
 * Update a single roster's record and points
 */
async function updateRosterRecord(
  rosterId: number,
  scoreFor: number,
  scoreAgainst: number,
  isByeWeek: boolean
): Promise<void> {
  try {
    // Get current roster settings
    const rosterQuery = `SELECT settings FROM rosters WHERE id = $1`;
    const rosterResult = await pool.query(rosterQuery, [rosterId]);

    if (rosterResult.rows.length === 0) {
      console.error(`Roster ${rosterId} not found`);
      return;
    }

    const settings = rosterResult.rows[0].settings || {};

    // Current record - ensure numbers
    const wins = Number(settings.wins) || 0;
    const losses = Number(settings.losses) || 0;
    const ties = Number(settings.ties) || 0;
    const pointsFor = Number(settings.points_for) || 0;
    const pointsAgainst = Number(settings.points_against) || 0;

    // Determine result
    let newWins = wins;
    let newLosses = losses;
    let newTies = ties;

    if (!isByeWeek) {
      const numScoreFor = Number(scoreFor);
      const numScoreAgainst = Number(scoreAgainst);

      if (numScoreFor > numScoreAgainst) {
        newWins++;
      } else if (numScoreFor < numScoreAgainst) {
        newLosses++;
      } else {
        newTies++;
      }
    }

    // Update points - ensure numbers
    const newPointsFor = pointsFor + Number(scoreFor);
    const newPointsAgainst = pointsAgainst + Number(scoreAgainst);

    // Update roster settings
    const updatedSettings = {
      ...settings,
      wins: newWins,
      losses: newLosses,
      ties: newTies,
      points_for: newPointsFor,
      points_against: newPointsAgainst,
    };

    const updateQuery = `
      UPDATE rosters
      SET settings = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await pool.query(updateQuery, [JSON.stringify(updatedSettings), rosterId]);

    console.log(
      `[UpdateRecord] Roster ${rosterId}: ${newWins}-${newLosses}-${newTies}, PF: ${newPointsFor.toFixed(
        2
      )}, PA: ${newPointsAgainst.toFixed(2)}`
    );
  } catch (error) {
    console.error(`Error updating roster ${rosterId} record:`, error);
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
    console.log(`[ResetRecords] Reset all roster records for league ${leagueId}`);
  } catch (error) {
    console.error("Error resetting roster records:", error);
    throw error;
  }
}
