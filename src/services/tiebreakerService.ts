import pool from "../config/database";
import { getPlayoffSettings } from "../models/PlayoffSettings";
import {
  getMatchupById,
  Matchup,
  PlayoffRound,
  TiebreakerMethod,
} from "../models/Matchup";

interface TiebreakerResult {
  winnerId: number | null;
  tiebreakerUsed: string | null;
}

export type BenchPointsResult = {
  roster_id: number;
  bench_points: number;
}

interface SeasonPointsResult {
  roster_id: number;
  points_for: number;
}

export type H2HResult = {
  roster_id: number;
  wins: number;
}

/**
 * Determine winner of a tied playoff matchup
 * @param matchupId - Matchup ID
 * @returns Winning roster_id or null if manual intervention needed
 */
export async function determinePlayoffWinner(
  matchupId: number
): Promise<TiebreakerResult> {
  try {
    // 1. Get matchup details
    const matchup = await getMatchupById(matchupId);
    if (!matchup) {
      throw new Error("Matchup not found");
    }

    // 2. Check if actually tied
    if (matchup.roster1_score !== matchup.roster2_score) {
      const winnerId =
        matchup.roster1_score > matchup.roster2_score
          ? matchup.roster1_id
          : matchup.roster2_id!;
      return { winnerId, tiebreakerUsed: null };
    }

    // Handle bye week
    if (!matchup.roster2_id) {
      return { winnerId: matchup.roster1_id, tiebreakerUsed: null };
    }

    console.log(
      `[Tiebreaker] Matchup ${matchupId} is tied at ${matchup.roster1_score}. Applying tiebreakers...`
    );

    // 3. Get playoff settings for tiebreaker priority
    const playoffSettings = await getPlayoffSettings(matchup.league_id);
    if (!playoffSettings) {
      throw new Error(
        `No playoff settings found for league ${matchup.league_id}`
      );
    }

    const tiebreakerPriority = playoffSettings.tiebreaker_priority || [
      "bench_points",
      "season_points_for",
      "higher_seed",
    ];

    // 4. Apply each tiebreaker in order until winner found
    let winnerId: number | null = null;
    let tiebreakerUsed: string | null = null;

    for (const method of tiebreakerPriority) {
      console.log(`[Tiebreaker] Trying method: ${method}`);
      winnerId = await applyTiebreaker(method, matchup);

      if (winnerId !== null) {
        tiebreakerUsed = method;
        console.log(
          `[Tiebreaker] Winner determined by ${method}: roster ${winnerId}`
        );
        break;
      }
    }

    // 5. Update matchup with tiebreaker info
    if (winnerId !== null && tiebreakerUsed !== null) {
      await updateMatchupTiebreaker(matchupId, tiebreakerUsed, winnerId);
    } else if (winnerId === null) {
      // Mark as requiring manual intervention
      await updateMatchupTiebreaker(
        matchupId,
        "manual",
        null,
        "Tiebreaker could not determine winner - commissioner intervention required"
      );
    }

    // 6. Return winner
    return { winnerId, tiebreakerUsed };
  } catch (error) {
    console.error("Error determining playoff winner:", error);
    throw error;
  }
}

/**
 * Apply a specific tiebreaker method
 * @param method - Tiebreaker method
 * @param matchup - Matchup data
 * @returns Winning roster_id or null if tie persists
 */
async function applyTiebreaker(
  method: TiebreakerMethod,
  matchup: Matchup
): Promise<number | null> {
  switch (method) {
    case "bench_points":
      return await applyBenchPointsTiebreaker(matchup);
    case "season_points_for":
      return await applySeasonPointsTiebreaker(matchup);
    case "h2h_record":
      return await applyH2HTiebreaker(matchup);
    case "higher_seed":
      return applyHigherSeedTiebreaker(matchup);
    case "manual":
      return null; // Requires commissioner
    default:
      console.warn(`[Tiebreaker] Unknown tiebreaker method: ${method}`);
      return null;
  }
}

/**
 * Calculate bench points for both teams
 * Bench points come from the bench array in the roster, not from weekly_lineups
 */
async function applyBenchPointsTiebreaker(
  matchup: Matchup
): Promise<number | null> {
  try {
    if (!matchup.roster2_id) {
      return null; // Bye week, no tiebreaker needed
    }

    // Get bench points from rosters
    // Bench players are stored in the roster's bench array
    const { getRosterById } = await import("../models/Roster");
    const { getPlayerStatsByWeek } = await import("../models/PlayerStats");
    const { calculateFantasyPoints } = await import("./scoringService");
    const { getLeagueById } = await import("../models/League");

    const roster1 = await getRosterById(matchup.roster1_id);
    const roster2 = await getRosterById(matchup.roster2_id);

    if (!roster1 || !roster2) {
      console.error("[Tiebreaker] Could not load rosters");
      return null;
    }

    // Get league for scoring settings
    const league = await getLeagueById(matchup.league_id);
    if (!league) {
      console.error("[Tiebreaker] Could not load league");
      return null;
    }

    const scoringSettings = league.scoring_settings || {};

    // Calculate bench points for roster1
    let roster1BenchPoints = 0;
    const bench1PlayerIds = roster1.bench || [];

    for (const playerId of bench1PlayerIds) {
      const stats = await getPlayerStatsByWeek(
        playerId,
        matchup.week,
        matchup.season,
        "regular"
      );
      if (stats) {
        const points = calculateFantasyPoints(stats, scoringSettings);
        roster1BenchPoints += points;
      }
    }

    // Calculate bench points for roster2
    let roster2BenchPoints = 0;
    const bench2PlayerIds = roster2.bench || [];

    for (const playerId of bench2PlayerIds) {
      const stats = await getPlayerStatsByWeek(
        playerId,
        matchup.week,
        matchup.season,
        "regular"
      );
      if (stats) {
        const points = calculateFantasyPoints(stats, scoringSettings);
        roster2BenchPoints += points;
      }
    }

    console.log(
      `[Tiebreaker] Bench points - Roster ${matchup.roster1_id}: ${roster1BenchPoints.toFixed(
        2
      )}, Roster ${matchup.roster2_id}: ${roster2BenchPoints.toFixed(2)}`
    );

    if (roster1BenchPoints > roster2BenchPoints) {
      return matchup.roster1_id;
    } else if (roster2BenchPoints > roster1BenchPoints) {
      return matchup.roster2_id;
    }

    // Still tied
    return null;
  } catch (error) {
    console.error("Error applying bench points tiebreaker:", error);
    return null;
  }
}

/**
 * Compare season-long points for
 */
async function applySeasonPointsTiebreaker(
  matchup: Matchup
): Promise<number | null> {
  try {
    if (!matchup.roster2_id) {
      return null; // Bye week, no tiebreaker needed
    }

    // Get points_for from roster settings
    const query = `
      SELECT
        r.id as roster_id,
        COALESCE((r.settings->>'points_for')::numeric, 0) as points_for
      FROM rosters r
      WHERE r.id IN ($1, $2)
    `;

    const result = await pool.query<SeasonPointsResult>(query, [
      matchup.roster1_id,
      matchup.roster2_id,
    ]);

    if (result.rows.length !== 2) {
      console.error("[Tiebreaker] Could not load season points for both teams");
      return null;
    }

    const roster1Points = result.rows.find(
      (r) => r.roster_id === matchup.roster1_id
    )?.points_for || 0;
    const roster2Points = result.rows.find(
      (r) => r.roster_id === matchup.roster2_id
    )?.points_for || 0;

    console.log(
      `[Tiebreaker] Season points - Roster ${matchup.roster1_id}: ${roster1Points}, Roster ${matchup.roster2_id}: ${roster2Points}`
    );

    if (roster1Points > roster2Points) {
      return matchup.roster1_id;
    } else if (roster2Points > roster1Points) {
      return matchup.roster2_id;
    }

    // Still tied
    return null;
  } catch (error) {
    console.error("Error applying season points tiebreaker:", error);
    return null;
  }
}

/**
 * Check head-to-head record during regular season
 */
async function applyH2HTiebreaker(
  matchup: Matchup
): Promise<number | null> {
  try {
    if (!matchup.roster2_id) {
      return null; // Bye week, no tiebreaker needed
    }

    // Query matchups table for these two rosters in regular season
    // Count wins for each roster
    const query = `
      SELECT
        CASE
          WHEN roster1_id = $1 AND roster1_score > roster2_score THEN $1
          WHEN roster2_id = $1 AND roster2_score > roster1_score THEN $1
          WHEN roster1_id = $2 AND roster1_score > roster2_score THEN $2
          WHEN roster2_id = $2 AND roster2_score > roster1_score THEN $2
        END as winner_id
      FROM matchups
      WHERE league_id = $3
        AND season = $4
        AND is_playoff = false
        AND status = 'completed'
        AND (
          (roster1_id = $1 AND roster2_id = $2) OR
          (roster1_id = $2 AND roster2_id = $1)
        )
        AND roster1_score != roster2_score
    `;

    const result = await pool.query(query, [
      matchup.roster1_id,
      matchup.roster2_id,
      matchup.league_id,
      matchup.season,
    ]);

    // Count wins for each team
    const roster1Wins = result.rows.filter(
      (r) => r.winner_id === matchup.roster1_id
    ).length;
    const roster2Wins = result.rows.filter(
      (r) => r.winner_id === matchup.roster2_id
    ).length;

    console.log(
      `[Tiebreaker] H2H record - Roster ${matchup.roster1_id}: ${roster1Wins} wins, Roster ${matchup.roster2_id}: ${roster2Wins} wins`
    );

    if (roster1Wins > roster2Wins) {
      return matchup.roster1_id;
    } else if (roster2Wins > roster1Wins) {
      return matchup.roster2_id;
    }

    // Still tied
    return null;
  } catch (error) {
    console.error("Error applying H2H tiebreaker:", error);
    return null;
  }
}

/**
 * Use seed as tiebreaker
 */
function applyHigherSeedTiebreaker(matchup: Matchup): number | null {
  if (!matchup.roster2_id || !matchup.seed1 || !matchup.seed2) {
    return null;
  }

  console.log(
    `[Tiebreaker] Seeds - Roster ${matchup.roster1_id}: seed ${matchup.seed1}, Roster ${matchup.roster2_id}: seed ${matchup.seed2}`
  );

  // Lower seed number is better
  if (matchup.seed1 < matchup.seed2) {
    return matchup.roster1_id;
  } else if (matchup.seed2 < matchup.seed1) {
    return matchup.roster2_id;
  }

  // Seeds are equal (shouldn't happen in playoffs)
  return null;
}

/**
 * Update matchup with tiebreaker information
 */
async function updateMatchupTiebreaker(
  matchupId: number,
  tiebreakerUsed: string,
  _winnerId: number | null,
  notes?: string
): Promise<void> {
  try {
    const query = `
      UPDATE matchups
      SET tiebreaker_used = $1,
          tiebreaker_notes = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;

    await pool.query(query, [
      tiebreakerUsed,
      notes || `Winner determined by ${tiebreakerUsed} tiebreaker`,
      matchupId,
    ]);

    console.log(
      `[Tiebreaker] Updated matchup ${matchupId} with tiebreaker: ${tiebreakerUsed}`
    );
  } catch (error) {
    console.error("Error updating matchup tiebreaker:", error);
    throw error;
  }
}

/**
 * Check if a playoff round is complete
 */
export async function isPlayoffRoundComplete(
  leagueId: number,
  round: PlayoffRound,
  season: string
): Promise<boolean> {
  try {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM matchups
      WHERE league_id = $1
        AND playoff_round = $2
        AND season = $3
        AND is_playoff = true
    `;

    const result = await pool.query(query, [leagueId, round, season]);
    const { total, completed } = result.rows[0];

    console.log(
      `[Playoff] Round ${round}: ${completed}/${total} matchups completed`
    );

    return parseInt(total) > 0 && parseInt(total) === parseInt(completed);
  } catch (error) {
    console.error("Error checking if playoff round is complete:", error);
    throw error;
  }
}

/**
 * Advance winners from completed round to next round
 */
export async function advancePlayoffWinners(
  leagueId: number,
  completedRound: PlayoffRound,
  season: string
): Promise<void> {
  try {
    console.log(
      `[Playoff] Advancing winners from ${completedRound} to next round`
    );

    // 1. Get all completed matchups from this round
    const matchupsQuery = `
      SELECT * FROM matchups
      WHERE league_id = $1
        AND playoff_round = $2
        AND season = $3
        AND is_playoff = true
        AND status = 'completed'
      ORDER BY bracket_position
    `;

    const matchupsResult = await pool.query(matchupsQuery, [
      leagueId,
      completedRound,
      season,
    ]);

    const completedMatchups = matchupsResult.rows;

    if (completedMatchups.length === 0) {
      console.log(`[Playoff] No completed matchups found for ${completedRound}`);
      return;
    }

    // 2. Get playoff settings
    const playoffSettings = await getPlayoffSettings(leagueId);
    if (!playoffSettings) {
      throw new Error(`No playoff settings found for league ${leagueId}`);
    }

    // 3. Determine next round
    const nextRound = getNextPlayoffRound(completedRound);
    if (!nextRound) {
      console.log(`[Playoff] ${completedRound} is the final round`);
      return;
    }

    // 4. For each matchup, get winner and advance
    for (const matchup of completedMatchups) {
      // Determine winner (considering tiebreakers)
      let winnerId: number;
      let winnerSeed: number;

      if (matchup.roster1_score > matchup.roster2_score) {
        winnerId = matchup.roster1_id;
        winnerSeed = matchup.seed1;
      } else if (matchup.roster2_score > matchup.roster1_score) {
        winnerId = matchup.roster2_id;
        winnerSeed = matchup.seed2;
      } else {
        // Tied - use tiebreaker result
        const tiebreakerResult = await determinePlayoffWinner(matchup.id);
        if (!tiebreakerResult.winnerId) {
          console.error(
            `[Playoff] Cannot advance from matchup ${matchup.id} - no winner determined`
          );
          continue;
        }
        winnerId = tiebreakerResult.winnerId;
        winnerSeed =
          winnerId === matchup.roster1_id ? matchup.seed1 : matchup.seed2;
      }

      // 5. Update next round matchup
      await updateNextRoundMatchup(
        leagueId,
        season,
        nextRound,
        matchup.bracket_position,
        winnerId,
        winnerSeed,
        playoffSettings.reseed_rounds
      );
    }

    console.log(
      `[Playoff] Successfully advanced winners from ${completedRound} to ${nextRound}`
    );
  } catch (error) {
    console.error("Error advancing playoff winners:", error);
    throw error;
  }
}

/**
 * Get the next playoff round
 */
function getNextPlayoffRound(currentRound: PlayoffRound): PlayoffRound | null {
  const rounds: PlayoffRound[] = [
    "wildcard",
    "quarterfinal",
    "semifinal",
    "final",
  ];
  const index = rounds.indexOf(currentRound);
  return index >= 0 && index < rounds.length - 1 ? rounds[index + 1] : null;
}

/**
 * Update next round matchups with winners
 */
async function updateNextRoundMatchup(
  leagueId: number,
  season: string,
  nextRound: PlayoffRound,
  bracketPosition: string,
  winnerId: number,
  winnerSeed: number,
  reseedRounds: boolean
): Promise<void> {
  try {
    // Bracket position mapping:
    // "1" from current round -> goes to "1" in next round (slot 1 or 2 depending on logic)
    // This is simplified - in production you'd have more complex bracket logic

    // For reseeding, we need to wait until all winners are determined
    // then recreate matchups with highest seed vs lowest seed
    if (reseedRounds) {
      console.log(
        `[Playoff] Reseeding enabled - will reseed after all ${nextRound} matchups are created`
      );
      // TODO: Implement reseeding logic
      // This would involve collecting all winners, sorting by seed,
      // and pairing highest vs lowest
    }

    // For now, use simple bracket advancement
    // This is a placeholder - real bracket logic would be more complex
    const targetBracketPosition = Math.ceil(parseInt(bracketPosition) / 2).toString();

    // Determine if this winner goes to roster1 or roster2 slot
    const isFirstSlot = parseInt(bracketPosition) % 2 === 1;

    const updateField = isFirstSlot ? "roster1_id" : "roster2_id";
    const updateSeedField = isFirstSlot ? "seed1" : "seed2";

    const query = `
      UPDATE matchups
      SET ${updateField} = $1,
          ${updateSeedField} = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE league_id = $3
        AND season = $4
        AND playoff_round = $5
        AND bracket_position = $6
        AND is_playoff = true
    `;

    await pool.query(query, [
      winnerId,
      winnerSeed,
      leagueId,
      season,
      nextRound,
      targetBracketPosition,
    ]);

    console.log(
      `[Playoff] Advanced roster ${winnerId} (seed ${winnerSeed}) to ${nextRound} matchup ${targetBracketPosition}`
    );
  } catch (error) {
    console.error("Error updating next round matchup:", error);
    throw error;
  }
}

/**
 * Get winner of a playoff matchup (considering tiebreakers)
 * @param matchupId - Matchup ID
 * @returns Winning roster_id or null if not yet determined
 */
export async function getPlayoffMatchupWinner(
  matchupId: number
): Promise<number | null> {
  try {
    const matchup = await getMatchupById(matchupId);
    if (!matchup) {
      return null;
    }

    // If not completed, no winner yet
    if (matchup.status !== "completed") {
      return null;
    }

    // If not tied, return winner based on score
    if (matchup.roster1_score > matchup.roster2_score) {
      return matchup.roster1_id;
    } else if (
      matchup.roster2_id &&
      matchup.roster2_score > matchup.roster1_score
    ) {
      return matchup.roster2_id;
    }

    // Tied - apply tiebreakers
    const result = await determinePlayoffWinner(matchupId);
    return result.winnerId;
  } catch (error) {
    console.error("Error getting playoff matchup winner:", error);
    throw error;
  }
}

/**
 * Manually set winner of a playoff matchup (commissioner override)
 */
export async function setManualPlayoffWinner(
  matchupId: number,
  winnerId: number,
  commissionerId: number
): Promise<void> {
  try {
    const matchup = await getMatchupById(matchupId);
    if (!matchup) {
      throw new Error("Matchup not found");
    }

    // Validate winner is one of the teams in the matchup
    if (winnerId !== matchup.roster1_id && winnerId !== matchup.roster2_id) {
      throw new Error("Winner must be one of the teams in the matchup");
    }

    const query = `
      UPDATE matchups
      SET tiebreaker_used = 'manual',
          tiebreaker_notes = 'Manual winner selection by commissioner',
          manual_winner_selected_by = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await pool.query(query, [commissionerId, matchupId]);

    console.log(
      `[Playoff] Manual winner set for matchup ${matchupId}: roster ${winnerId} by commissioner ${commissionerId}`
    );
  } catch (error) {
    console.error("Error setting manual playoff winner:", error);
    throw error;
  }
}
