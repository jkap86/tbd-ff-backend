import pool from "../config/database";

export interface StandingsEntry {
  roster_id: number;
  user_id: number;
  team_name: string;
  username: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  seed: number;
}

/**
 * Get playoff configuration from league settings
 * @param leagueId - League ID
 * @returns Object containing playoff teams count and tiebreaker method
 */
async function getPlayoffConfiguration(leagueId: number): Promise<{
  playoff_teams: number;
  tiebreaker: "points_for" | "h2h_record";
}> {
  try {
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(leagueId);

    if (!league) {
      throw new Error("League not found");
    }

    const settings = league.settings || {};

    // Default to 6 playoff teams if not specified
    const playoff_teams = settings.playoff_teams || 6;

    // Default to points_for tiebreaker if not specified
    const tiebreaker = settings.tiebreaker || "points_for";

    return { playoff_teams, tiebreaker };
  } catch (error) {
    console.error("Error getting playoff configuration:", error);
    throw error;
  }
}

/**
 * Calculate regular season standings with playoff seeding
 * @param leagueId - League ID
 * @param throughWeek - Optional: calculate through specific week
 * @returns Sorted array of standings with seeds assigned
 */
export async function calculateStandings(
  leagueId: number,
  _throughWeek?: number
): Promise<StandingsEntry[]> {
  try {
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(leagueId);

    if (!league) {
      throw new Error("League not found");
    }

    const settings = league.settings || {};
    const tiebreaker = settings.tiebreaker || "points_for";

    // Query to get all rosters with their records
    const query = `
      SELECT
        r.id as roster_id,
        r.user_id,
        COALESCE(r.settings->>'team_name', 'Team ' || r.roster_id) as team_name,
        u.username,
        COALESCE((r.settings->>'wins')::integer, 0) as wins,
        COALESCE((r.settings->>'losses')::integer, 0) as losses,
        COALESCE((r.settings->>'ties')::integer, 0) as ties,
        COALESCE((r.settings->>'points_for')::numeric, 0) as points_for,
        COALESCE((r.settings->>'points_against')::numeric, 0) as points_against
      FROM rosters r
      JOIN users u ON r.user_id = u.id
      WHERE r.league_id = $1
      ORDER BY r.roster_id
    `;

    const result = await pool.query(query, [leagueId]);
    let standings: StandingsEntry[] = result.rows.map((row) => ({
      roster_id: row.roster_id,
      user_id: row.user_id,
      team_name: row.team_name,
      username: row.username,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      points_for: parseFloat(row.points_for),
      points_against: parseFloat(row.points_against),
      seed: 0, // Will be assigned later
    }));

    // Handle edge case: no rosters
    if (standings.length === 0) {
      return [];
    }

    // Calculate win percentage for each team
    const standingsWithWinPct = standings.map((team) => {
      const totalGames = team.wins + team.losses + team.ties;
      const winPct = totalGames > 0
        ? (team.wins + team.ties * 0.5) / totalGames
        : 0;
      return { ...team, winPct };
    });

    // Sort by win percentage (descending)
    standingsWithWinPct.sort((a, b) => {
      if (b.winPct !== a.winPct) {
        return b.winPct - a.winPct;
      }
      // Win percentages are tied, will apply tiebreaker
      return 0;
    });

    // Group teams by win percentage to identify ties
    const winPctGroups: { [key: string]: typeof standingsWithWinPct } = {};
    standingsWithWinPct.forEach((team) => {
      const key = team.winPct.toFixed(4);
      if (!winPctGroups[key]) {
        winPctGroups[key] = [];
      }
      winPctGroups[key].push(team);
    });

    // Apply tiebreaker to each group with ties
    const sortedStandings: StandingsEntry[] = [];
    for (const winPct of Object.keys(winPctGroups).sort((a, b) => parseFloat(b) - parseFloat(a))) {
      const group = winPctGroups[winPct];

      if (group.length > 1) {
        // Multiple teams with same win percentage - apply tiebreaker
        const sortedGroup = await applyTiebreaker(group, tiebreaker, leagueId);
        sortedStandings.push(...sortedGroup);
      } else {
        // Only one team with this win percentage
        sortedStandings.push(group[0]);
      }
    }

    // Assign seeds 1 through N
    const finalStandings = sortedStandings.map((team, index) => ({
      roster_id: team.roster_id,
      user_id: team.user_id,
      team_name: team.team_name,
      username: team.username,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      points_for: team.points_for,
      points_against: team.points_against,
      seed: index + 1,
    }));

    return finalStandings;
  } catch (error) {
    console.error("Error calculating standings:", error);
    throw new Error("Error calculating standings");
  }
}

/**
 * Get top N teams for playoffs based on seeding
 * @param leagueId - League ID
 * @returns Array of playoff teams sorted by seed
 */
export async function getPlayoffTeams(
  leagueId: number
): Promise<StandingsEntry[]> {
  try {
    // Get playoff settings to determine how many teams
    const { playoff_teams } = await getPlayoffConfiguration(leagueId);

    // Get standings
    const standings = await calculateStandings(leagueId);

    // Return top N teams
    return standings.slice(0, playoff_teams);
  } catch (error) {
    console.error("Error getting playoff teams:", error);
    throw new Error("Error getting playoff teams");
  }
}

/**
 * Apply tiebreaker between teams with same record
 * @param teams - Teams with identical records
 * @param tiebreaker - Tiebreaker method to use
 * @param leagueId - League ID (needed for H2H lookup)
 * @returns Sorted teams with tiebreaker applied
 */
async function applyTiebreaker(
  teams: StandingsEntry[],
  tiebreaker: "points_for" | "h2h_record",
  leagueId: number
): Promise<StandingsEntry[]> {
  try {
    if (teams.length <= 1) {
      return teams;
    }

    if (tiebreaker === "points_for") {
      // Sort by points_for (descending), then by points_against (ascending)
      return teams.sort((a, b) => {
        if (b.points_for !== a.points_for) {
          return b.points_for - a.points_for;
        }
        // If points_for is also tied, use points_against (lower is better)
        return a.points_against - b.points_against;
      });
    } else if (tiebreaker === "h2h_record") {
      // Calculate head-to-head records between tied teams
      const h2hRecords = await calculateHeadToHeadRecords(
        teams.map(t => t.roster_id),
        leagueId
      );

      // Sort by H2H win percentage, then by points_for
      return teams.sort((a, b) => {
        const aH2H = h2hRecords[a.roster_id];
        const bH2H = h2hRecords[b.roster_id];

        if (bH2H.winPct !== aH2H.winPct) {
          return bH2H.winPct - aH2H.winPct;
        }

        // If H2H is tied, fall back to points_for
        if (b.points_for !== a.points_for) {
          return b.points_for - a.points_for;
        }

        // If still tied, use points_against
        return a.points_against - b.points_against;
      });
    }

    return teams;
  } catch (error) {
    console.error("Error applying tiebreaker:", error);
    throw error;
  }
}

/**
 * Calculate head-to-head records between specific teams
 * @param rosterIds - Array of roster IDs to calculate H2H for
 * @param leagueId - League ID
 * @returns Object mapping roster_id to their H2H record
 */
async function calculateHeadToHeadRecords(
  rosterIds: number[],
  leagueId: number
): Promise<{
  [rosterId: number]: {
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
  };
}> {
  try {
    // Initialize records for each team
    const records: {
      [rosterId: number]: {
        wins: number;
        losses: number;
        ties: number;
        winPct: number;
      };
    } = {};

    rosterIds.forEach(id => {
      records[id] = { wins: 0, losses: 0, ties: 0, winPct: 0 };
    });

    // Query matchups between these specific teams
    const query = `
      SELECT
        roster1_id,
        roster2_id,
        roster1_score,
        roster2_score,
        status
      FROM matchups
      WHERE league_id = $1
        AND status = 'completed'
        AND roster1_id = ANY($2)
        AND roster2_id = ANY($2)
        AND roster1_id != roster2_id
    `;

    const result = await pool.query(query, [leagueId, rosterIds]);
    const matchups = result.rows;

    // Process each matchup
    matchups.forEach(matchup => {
      const { roster1_id, roster2_id, roster1_score, roster2_score } = matchup;

      // Ensure both teams are in our list
      if (!rosterIds.includes(roster1_id) || !rosterIds.includes(roster2_id)) {
        return;
      }

      const score1 = parseFloat(roster1_score);
      const score2 = parseFloat(roster2_score);

      if (score1 > score2) {
        records[roster1_id].wins++;
        records[roster2_id].losses++;
      } else if (score2 > score1) {
        records[roster2_id].wins++;
        records[roster1_id].losses++;
      } else {
        records[roster1_id].ties++;
        records[roster2_id].ties++;
      }
    });

    // Calculate win percentage for each team
    rosterIds.forEach(id => {
      const record = records[id];
      const totalGames = record.wins + record.losses + record.ties;
      record.winPct = totalGames > 0
        ? (record.wins + record.ties * 0.5) / totalGames
        : 0;
    });

    return records;
  } catch (error) {
    console.error("Error calculating head-to-head records:", error);
    throw error;
  }
}

/**
 * Get standings with additional playoff context
 * @param leagueId - League ID
 * @returns Standings with playoff indicators
 */
export async function getStandingsWithPlayoffIndicators(
  leagueId: number
): Promise<Array<StandingsEntry & { is_playoff_team: boolean }>> {
  try {
    const { playoff_teams } = await getPlayoffConfiguration(leagueId);
    const standings = await calculateStandings(leagueId);

    return standings.map((team) => ({
      ...team,
      is_playoff_team: team.seed <= playoff_teams,
    }));
  } catch (error) {
    console.error("Error getting standings with playoff indicators:", error);
    throw new Error("Error getting standings with playoff indicators");
  }
}
