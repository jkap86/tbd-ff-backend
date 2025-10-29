import pool from "../config/database";

export interface Matchup {
  id: number;
  league_id: number;
  week: number;
  season: string;
  roster1_id: number;
  roster2_id: number | null; // null for bye week
  roster1_score: number;
  roster2_score: number;
  status: "scheduled" | "in_progress" | "completed";
  created_at: Date;
  updated_at: Date;
}

export interface MatchupWithRosters extends Matchup {
  roster1_team_name?: string;
  roster1_username?: string;
  roster2_team_name?: string;
  roster2_username?: string;
}

/**
 * Create a matchup
 */
export async function createMatchup(matchupData: {
  league_id: number;
  week: number;
  season: string;
  roster1_id: number;
  roster2_id: number | null;
}): Promise<Matchup> {
  try {
    const query = `
      INSERT INTO matchups (league_id, week, season, roster1_id, roster2_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [
      matchupData.league_id,
      matchupData.week,
      matchupData.season,
      matchupData.roster1_id,
      matchupData.roster2_id,
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error creating matchup:", error);
    throw new Error("Error creating matchup");
  }
}

/**
 * Get matchups for a league and week
 */
export async function getMatchupsByLeagueAndWeek(
  leagueId: number,
  week: number
): Promise<MatchupWithRosters[]> {
  try {
    const query = `
      SELECT
        m.*,
        r1.settings->>'team_name' as roster1_team_name,
        u1.username as roster1_username,
        r2.settings->>'team_name' as roster2_team_name,
        u2.username as roster2_username
      FROM matchups m
      LEFT JOIN rosters r1 ON m.roster1_id = r1.id
      LEFT JOIN users u1 ON r1.user_id = u1.id
      LEFT JOIN rosters r2 ON m.roster2_id = r2.id
      LEFT JOIN users u2 ON r2.user_id = u2.id
      WHERE m.league_id = $1 AND m.week = $2
      ORDER BY m.id
    `;

    const result = await pool.query(query, [leagueId, week]);
    return result.rows;
  } catch (error) {
    console.error("Error getting matchups:", error);
    throw new Error("Error getting matchups");
  }
}

/**
 * Get all matchups for a league
 */
export async function getMatchupsByLeague(
  leagueId: number
): Promise<MatchupWithRosters[]> {
  try {
    const query = `
      SELECT
        m.*,
        r1.settings->>'team_name' as roster1_team_name,
        u1.username as roster1_username,
        r2.settings->>'team_name' as roster2_team_name,
        u2.username as roster2_username
      FROM matchups m
      LEFT JOIN rosters r1 ON m.roster1_id = r1.id
      LEFT JOIN users u1 ON r1.user_id = u1.id
      LEFT JOIN rosters r2 ON m.roster2_id = r2.id
      LEFT JOIN users u2 ON r2.user_id = u2.id
      WHERE m.league_id = $1
      ORDER BY m.week, m.id
    `;

    const result = await pool.query(query, [leagueId]);
    return result.rows;
  } catch (error) {
    console.error("Error getting matchups:", error);
    throw new Error("Error getting matchups");
  }
}

/**
 * Get matchup by ID
 */
export async function getMatchupById(
  matchupId: number
): Promise<MatchupWithRosters | null> {
  try {
    const query = `
      SELECT
        m.*,
        r1.settings->>'team_name' as roster1_team_name,
        u1.username as roster1_username,
        r2.settings->>'team_name' as roster2_team_name,
        u2.username as roster2_username
      FROM matchups m
      LEFT JOIN rosters r1 ON m.roster1_id = r1.id
      LEFT JOIN users u1 ON r1.user_id = u1.id
      LEFT JOIN rosters r2 ON m.roster2_id = r2.id
      LEFT JOIN users u2 ON r2.user_id = u2.id
      WHERE m.id = $1
    `;

    const result = await pool.query(query, [matchupId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error getting matchup:", error);
    throw new Error("Error getting matchup");
  }
}

/**
 * Get matchup details with full roster and player information
 */
export async function getMatchupDetails(matchupId: number): Promise<any> {
  try {
    // Get the matchup with basic info
    const matchup = await getMatchupById(matchupId);

    if (!matchup) {
      return null;
    }

    // Get roster with players for both teams
    const { getRosterWithPlayers } = await import("./Roster");

    const roster1Data = await getRosterWithPlayers(matchup.roster1_id);
    const roster2Data = matchup.roster2_id
      ? await getRosterWithPlayers(matchup.roster2_id)
      : null;

    return {
      matchup,
      roster1: roster1Data,
      roster2: roster2Data,
    };
  } catch (error) {
    console.error("Error getting matchup details:", error);
    throw new Error("Error getting matchup details");
  }
}

/**
 * Get matchup details with player scores
 */
export async function getMatchupDetailsWithScores(
  matchupId: number
): Promise<any> {
  try {
    // Get the matchup with basic info
    const matchup = await getMatchupById(matchupId);

    if (!matchup) {
      return null;
    }

    // Get league to access scoring settings
    const { getLeagueById } = await import("./League");
    const league = await getLeagueById(matchup.league_id);

    if (!league) {
      throw new Error("League not found");
    }

    const scoringSettings = league.scoring_settings || {};

    // Get weekly lineup with players for both teams
    const { getWeeklyLineupWithPlayers } = await import("./WeeklyLineup");
    const { getPlayerStatsByWeek } = await import("./PlayerStats");
    const { calculateFantasyPoints } = await import("../services/scoringService");
    const { getRosterWithPlayers } = await import("./Roster");
    const { fetchSleeperProjections, convertSleeperProjectionToStats } = await import("../services/sleeperProjectionsService");

    // Get roster 1 weekly lineup
    const roster1Lineup = await getWeeklyLineupWithPlayers(
      matchup.roster1_id,
      matchup.week,
      matchup.season
    );

    // Get roster 1 bench players from the roster
    const roster1Data = await getRosterWithPlayers(matchup.roster1_id);

    console.log(`[MatchupScores] Loading scores for week ${matchup.week}, season ${matchup.season}`);

    // Fetch projections as fallback
    const projections = await fetchSleeperProjections(matchup.season, matchup.week, "regular");
    console.log(`[MatchupScores] Fetched projections for ${Object.keys(projections).length} players`);
    console.log(`[MatchupScores] Sample projection keys:`, Object.keys(projections).slice(0, 5));

    // Calculate scores for roster 1 starters (from weekly lineup)
    if (roster1Lineup && roster1Lineup.starters) {
      for (const slot of roster1Lineup.starters) {
        if (slot.player && slot.player.id) {
          console.log(`[MatchupScores] Processing player ${slot.player.full_name}, DB player_id: ${slot.player.player_id}, DB id: ${slot.player.id}`);

          const stats = await getPlayerStatsByWeek(
            slot.player.id,
            matchup.week,
            matchup.season,
            "regular"
          );

          if (stats) {
            // Use actual stats if available
            console.log(`[MatchupScores] Player ${slot.player.full_name}: Using actual stats`);
            slot.player.stats = stats;
            slot.player.fantasy_points = calculateFantasyPoints(stats, scoringSettings);
            console.log(`[MatchupScores] ${slot.player.full_name} scored ${slot.player.fantasy_points} points`);
          } else {
            // Use projections as fallback - convert to stats format and calculate
            console.log(`[MatchupScores] Looking up projection for player_id: ${slot.player.player_id}`);
            const projection = projections[slot.player.player_id];
            if (projection) {
              console.log(`[MatchupScores] Player ${slot.player.full_name} (${slot.player.player_id}): Using projected stats`);
              console.log(`[MatchupScores] Raw projection data:`, projection);
              const projectedStats = convertSleeperProjectionToStats(
                projection,
                slot.player.id,
                matchup.week,
                matchup.season
              );
              console.log(`[MatchupScores] Converted stats:`, {
                pass_yd: projectedStats.passing_yards,
                pass_td: projectedStats.passing_touchdowns,
                rush_yd: projectedStats.rushing_yards,
                rush_td: projectedStats.rushing_touchdowns,
                rec: projectedStats.receiving_receptions,
                rec_yd: projectedStats.receiving_yards,
                rec_td: projectedStats.receiving_touchdowns
              });
              console.log(`[MatchupScores] Scoring settings:`, scoringSettings);
              slot.player.fantasy_points = calculateFantasyPoints(projectedStats as any, scoringSettings);
              slot.player.is_projection = true;
              console.log(`[MatchupScores] ${slot.player.full_name} projected ${slot.player.fantasy_points} points using league scoring`);
            } else {
              console.log(`[MatchupScores] Player ${slot.player.full_name} (${slot.player.player_id}): No stats or projections available`);
              slot.player.fantasy_points = 0;
            }
          }
        }
      }
    }

    // Use weekly lineup starters for roster1
    if (roster1Data && roster1Lineup) {
      roster1Data.starters = roster1Lineup.starters;
    }

    // Calculate scores for roster 1 bench
    if (roster1Data && roster1Data.bench) {
      for (let i = 0; i < roster1Data.bench.length; i++) {
        const player = roster1Data.bench[i];
        if (player && player.id) {
          const stats = await getPlayerStatsByWeek(
            player.id,
            matchup.week,
            matchup.season,
            "regular"
          );

          if (stats) {
            roster1Data.bench[i].stats = stats;
            roster1Data.bench[i].fantasy_points = calculateFantasyPoints(stats, scoringSettings);
          } else {
            // Use projections as fallback
            const projection = projections[player.player_id];
            if (projection) {
              const projectedStats = convertSleeperProjectionToStats(
                projection,
                player.id,
                matchup.week,
                matchup.season
              );
              roster1Data.bench[i].fantasy_points = calculateFantasyPoints(projectedStats as any, scoringSettings);
              roster1Data.bench[i].is_projection = true;
            } else {
              roster1Data.bench[i].fantasy_points = 0;
            }
          }
        }
      }
    }

    // Get roster 2 data (if not bye week)
    let roster2Data = null;
    if (matchup.roster2_id) {
      // Get roster 2 weekly lineup
      const roster2Lineup = await getWeeklyLineupWithPlayers(
        matchup.roster2_id,
        matchup.week,
        matchup.season
      );

      roster2Data = await getRosterWithPlayers(matchup.roster2_id);

      // Calculate scores for roster 2 starters (from weekly lineup)
      if (roster2Lineup && roster2Lineup.starters) {
        for (const slot of roster2Lineup.starters) {
          if (slot.player && slot.player.id) {
            const stats = await getPlayerStatsByWeek(
              slot.player.id,
              matchup.week,
              matchup.season,
              "regular"
            );

            if (stats) {
              slot.player.stats = stats;
              slot.player.fantasy_points = calculateFantasyPoints(stats, scoringSettings);
            } else {
              // Use projections as fallback
              const projection = projections[slot.player.player_id];
              if (projection) {
                const projectedStats = convertSleeperProjectionToStats(
                  projection,
                  slot.player.id,
                  matchup.week,
                  matchup.season
                );
                slot.player.fantasy_points = calculateFantasyPoints(projectedStats as any, scoringSettings);
                slot.player.is_projection = true;
              } else {
                slot.player.fantasy_points = 0;
              }
            }
          }
        }
      }

      // Use weekly lineup starters for roster2
      if (roster2Data && roster2Lineup) {
        roster2Data.starters = roster2Lineup.starters;
      }

      // Calculate scores for roster 2 bench
      if (roster2Data && roster2Data.bench) {
        for (let i = 0; i < roster2Data.bench.length; i++) {
          const player = roster2Data.bench[i];
          if (player && player.id) {
            const stats = await getPlayerStatsByWeek(
              player.id,
              matchup.week,
              matchup.season,
              "regular"
            );

            if (stats) {
              roster2Data.bench[i].stats = stats;
              roster2Data.bench[i].fantasy_points = calculateFantasyPoints(stats, scoringSettings);
            } else {
              // Use projections as fallback
              const projection = projections[player.player_id];
              if (projection) {
                const projectedPoints = projection.pts_ppr || projection.pts_half_ppr || projection.pts_std || 0;
                roster2Data.bench[i].fantasy_points = projectedPoints;
                roster2Data.bench[i].is_projection = true;
              } else {
                roster2Data.bench[i].fantasy_points = 0;
              }
            }
          }
        }
      }
    }

    return {
      matchup,
      roster1: roster1Data,
      roster2: roster2Data,
    };
  } catch (error) {
    console.error("Error getting matchup details with scores:", error);
    throw new Error("Error getting matchup details with scores");
  }
}

/**
 * Update matchup scores
 */
export async function updateMatchupScores(
  matchupId: number,
  roster1Score: number,
  roster2Score: number
): Promise<Matchup> {
  try {
    const query = `
      UPDATE matchups
      SET roster1_score = $1,
          roster2_score = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [
      roster1Score,
      roster2Score,
      matchupId,
    ]);

    if (result.rows.length === 0) {
      throw new Error("Matchup not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating matchup scores:", error);
    throw new Error("Error updating matchup scores");
  }
}

/**
 * Update matchup status
 */
export async function updateMatchupStatus(
  matchupId: number,
  status: "scheduled" | "in_progress" | "completed"
): Promise<Matchup> {
  try {
    const query = `
      UPDATE matchups
      SET status = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, matchupId]);

    if (result.rows.length === 0) {
      throw new Error("Matchup not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating matchup status:", error);
    throw new Error("Error updating matchup status");
  }
}

/**
 * Generate matchups for a league week (simple round-robin)
 * This creates head-to-head matchups for all rosters
 */
export async function generateMatchupsForWeek(
  leagueId: number,
  week: number,
  season: string
): Promise<Matchup[]> {
  try {
    // Get all rosters for the league
    const { getRostersByLeagueId } = await import("./Roster");
    const rosters = await getRostersByLeagueId(leagueId);

    if (rosters.length < 2) {
      throw new Error("League must have at least 2 teams to generate matchups");
    }

    const matchups: Matchup[] = [];

    // Auto-populate weekly lineups from default roster for all rosters
    const { getOrCreateWeeklyLineup, updateWeeklyLineup } = await import("./WeeklyLineup");

    console.log(`[GenerateMatchups] Auto-populating weekly lineups for week ${week}...`);

    for (const roster of rosters) {
      // Get or create weekly lineup
      await getOrCreateWeeklyLineup(roster.id, week, season);

      // Copy starters from default roster to weekly lineup (exclude BN slots)
      if (roster.starters && Array.isArray(roster.starters)) {
        const nonBenchStarters = roster.starters.filter((slot: any) => {
          const slotName = slot.slot || '';
          return !slotName.startsWith('BN');
        });
        await updateWeeklyLineup(roster.id, week, season, nonBenchStarters);
        console.log(`[GenerateMatchups] Copied ${nonBenchStarters.length} starters (excluding BN) to week ${week} for roster ${roster.id}`);
      }
    }

    // Simple round-robin: pair rosters sequentially
    // For odd number of teams, last team gets a bye
    for (let i = 0; i < rosters.length; i += 2) {
      const roster1 = rosters[i];
      const roster2 = i + 1 < rosters.length ? rosters[i + 1] : null;

      const matchup = await createMatchup({
        league_id: leagueId,
        week,
        season,
        roster1_id: roster1.id,
        roster2_id: roster2 ? roster2.id : null,
      });

      matchups.push(matchup);
    }

    return matchups;
  } catch (error) {
    console.error("Error generating matchups:", error);
    throw new Error("Error generating matchups");
  }
}

/**
 * Delete all matchups for a league week
 */
export async function deleteMatchupsForWeek(
  leagueId: number,
  week: number
): Promise<void> {
  try {
    const query = `
      DELETE FROM matchups
      WHERE league_id = $1 AND week = $2
    `;

    await pool.query(query, [leagueId, week]);
  } catch (error) {
    console.error("Error deleting matchups:", error);
    throw new Error("Error deleting matchups");
  }
}

/**
 * Delete all matchups for a league
 */
export async function deleteMatchupsForLeague(leagueId: number): Promise<void> {
  try {
    const query = `
      DELETE FROM matchups
      WHERE league_id = $1
    `;

    await pool.query(query, [leagueId]);
    console.log(`[Matchup] Deleted all matchups for league ${leagueId}`);
  } catch (error) {
    console.error("Error deleting matchups for league:", error);
    throw new Error("Error deleting matchups for league");
  }
}
