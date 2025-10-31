import pool from "../config/database";
import { getLeagueById } from "../models/League";

export interface SeasonRolloverResult {
  success: boolean;
  newSeason: string;
  message: string;
}

/**
 * Check if a league can be reset
 * Dynasty leagues cannot be reset - use season rollover instead
 */
export async function canResetLeague(leagueId: number): Promise<{ allowed: boolean; reason?: string }> {
  const league = await getLeagueById(leagueId);

  if (!league) {
    return { allowed: false, reason: "League not found" };
  }

  if (league.league_type === 'dynasty') {
    return {
      allowed: false,
      reason: "Dynasty leagues cannot be reset. Use season rollover to start a new season while keeping rosters intact."
    };
  }

  return { allowed: true };
}

/**
 * Check if a player is eligible to be kept
 * Basic rules: Player must be on roster, season must be valid
 */
export async function isKeeperEligible(
  rosterId: number,
  playerId: string,
  season: string
): Promise<{ eligible: boolean; reason?: string }> {
  try {
    // Check if player is currently on this roster
    const rosterQuery = `
      SELECT starters, bench, taxi, ir
      FROM rosters
      WHERE id = $1
    `;
    const rosterResult = await pool.query(rosterQuery, [rosterId]);

    if (rosterResult.rows.length === 0) {
      return { eligible: false, reason: "Roster not found" };
    }

    const roster = rosterResult.rows[0];

    // Check if player exists in any roster array
    const starterIds = (roster.starters || []).map((s: any) => s.player_id);
    const allPlayerIds = [
      ...starterIds,
      ...(roster.bench || []),
      ...(roster.taxi || []),
      ...(roster.ir || [])
    ];

    if (!allPlayerIds.includes(playerId)) {
      return { eligible: false, reason: "Player not on roster" };
    }

    // Check if player is already a keeper for this season
    const keeperCheck = await pool.query(
      `SELECT id FROM keeper_selections
       WHERE roster_id = $1 AND player_id = $2 AND season = $3`,
      [rosterId, playerId, season]
    );

    if (keeperCheck.rows.length > 0) {
      return { eligible: false, reason: "Player already selected as keeper for this season" };
    }

    return { eligible: true };
  } catch (error: any) {
    console.error("Error checking keeper eligibility:", error);
    return { eligible: false, reason: error.message || "Failed to check eligibility" };
  }
}

/**
 * Rollover dynasty league to new season
 * Creates season_history records and increments current_season
 */
export async function rolloverSeason(
  leagueId: number,
  commissionerId: number
): Promise<SeasonRolloverResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get league and verify it's dynasty
    const league = await getLeagueById(leagueId);

    if (!league) {
      throw new Error("League not found");
    }

    if (league.league_type !== 'dynasty') {
      throw new Error("Only dynasty leagues can use season rollover");
    }

    // Verify user is commissioner
    const commissionerCheck = league.settings?.commissioner_id;
    if (commissionerCheck !== commissionerId) {
      throw new Error("Only the commissioner can rollover the season");
    }

    const currentSeason = league.current_season || league.season;
    const nextSeason = (parseInt(currentSeason) + 1).toString();

    // Archive current season to history
    const rostersQuery = `
      SELECT id, wins, losses, ties, points_for, points_against
      FROM rosters
      WHERE league_id = $1
    `;
    const rostersResult = await client.query(rostersQuery, [leagueId]);

    for (const roster of rostersResult.rows) {
      await client.query(
        `INSERT INTO season_history
         (roster_id, league_id, season, wins, losses, ties, points_for, points_against)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (roster_id, season) DO NOTHING`,
        [
          roster.id,
          leagueId,
          currentSeason,
          roster.wins || 0,
          roster.losses || 0,
          roster.ties || 0,
          roster.points_for || 0,
          roster.points_against || 0
        ]
      );
    }

    // Reset roster records for new season (keep players)
    await client.query(
      `UPDATE rosters
       SET wins = 0, losses = 0, ties = 0, points_for = 0, points_against = 0
       WHERE league_id = $1`,
      [leagueId]
    );

    // Update league to new season
    await client.query(
      `UPDATE leagues
       SET current_season = $1, status = 'pre_draft', season = $1
       WHERE id = $2`,
      [nextSeason, leagueId]
    );

    // Delete old matchups (will be regenerated after draft)
    await client.query(
      `DELETE FROM matchups WHERE league_id = $1`,
      [leagueId]
    );

    // Delete old weekly lineups
    await client.query(
      `DELETE FROM weekly_lineups WHERE league_id = $1`,
      [leagueId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      newSeason: nextSeason,
      message: `Season rolled over to ${nextSeason}. Previous season archived.`
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error("Error rolling over season:", error);
    return {
      success: false,
      newSeason: '',
      message: error.message || "Failed to rollover season"
    };
  } finally {
    client.release();
  }
}

/**
 * Finalize all keeper selections for a league
 * Locks in all keeper choices (usually done by commissioner before draft)
 */
export async function finalizeKeepers(
  leagueId: number,
  season: string
): Promise<{ success: boolean; message: string; keeperCount: number }> {
  try {
    // Get all rosters in league
    const rostersQuery = `SELECT id FROM rosters WHERE league_id = $1`;
    const rostersResult = await pool.query(rostersQuery, [leagueId]);

    if (rostersResult.rows.length === 0) {
      return { success: false, message: "No rosters found in league", keeperCount: 0 };
    }

    const rosterIds = rostersResult.rows.map(r => r.id);

    // Finalize all keeper selections for this season
    const result = await pool.query(
      `UPDATE keeper_selections
       SET is_finalized = TRUE
       WHERE roster_id = ANY($1) AND season = $2 AND is_finalized = FALSE
       RETURNING id`,
      [rosterIds, season]
    );

    return {
      success: true,
      message: `Finalized ${result.rowCount} keeper selections`,
      keeperCount: result.rowCount || 0
    };
  } catch (error: any) {
    console.error("Error finalizing keepers:", error);
    return {
      success: false,
      message: error.message || "Failed to finalize keepers",
      keeperCount: 0
    };
  }
}
