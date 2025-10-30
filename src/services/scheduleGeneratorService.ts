import pool from "../config/database";
import { getRostersByLeagueId } from "../models/Roster";
import { createMatchup, deleteMatchupsForWeek } from "../models/Matchup";
import { getLeagueById } from "../models/League";

export interface ScheduleMatchup {
  roster1_id: number;
  roster2_id: number | null; // null for bye week
}

export interface GenerateScheduleResult {
  success: boolean;
  matchups: any[];
  message: string;
  errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Generate full season schedule for a league using round-robin algorithm
 *
 * @param leagueId - The league ID
 * @param season - The season year (e.g., "2024")
 * @param startWeek - First week of regular season
 * @param endWeek - Last week of regular season
 * @param regenerate - If true, delete and regenerate existing matchups
 * @returns Result object with success status, matchups, and message
 */
export async function generateFullSeasonSchedule(
  leagueId: number,
  season: string,
  startWeek: number,
  endWeek: number,
  regenerate: boolean = false
): Promise<GenerateScheduleResult> {
  try {
    // Get league and rosters
    const league = await getLeagueById(leagueId);
    if (!league) {
      return {
        success: false,
        matchups: [],
        message: "League not found",
        errors: ["League not found"],
      };
    }

    const rosters = await getRostersByLeagueId(leagueId);
    if (rosters.length < 2) {
      return {
        success: false,
        matchups: [],
        message: "League must have at least 2 teams to generate matchups",
        errors: ["League must have at least 2 teams"],
      };
    }

    const totalWeeks = endWeek - startWeek + 1;
    const totalTeams = rosters.length;
    const rosterIds = rosters.map((r) => r.id);

    // Validate week range
    if (startWeek < 1 || endWeek > 18 || startWeek >= endWeek) {
      return {
        success: false,
        matchups: [],
        message: "Invalid week range",
        errors: ["Invalid week range: startWeek must be < endWeek, and both must be between 1-18"],
      };
    }

    // Check for existing matchups if not regenerating
    if (!regenerate) {
      const existingQuery = `
        SELECT COUNT(*) as count FROM matchups
        WHERE league_id = $1 AND season = $2 AND week >= $3 AND week <= $4
      `;
      const existingResult = await pool.query(existingQuery, [
        leagueId,
        season,
        startWeek,
        endWeek,
      ]);

      if (parseInt(existingResult.rows[0].count) > 0) {
        return {
          success: false,
          matchups: [],
          message: "Matchups already exist for this season. Use regenerate=true to overwrite.",
          errors: ["Matchups already exist"],
        };
      }
    }

    // Delete existing matchups if regenerating
    if (regenerate) {
      console.log(`[ScheduleGenerator] Deleting existing matchups for weeks ${startWeek}-${endWeek}...`);
      for (let week = startWeek; week <= endWeek; week++) {
        await deleteMatchupsForWeek(leagueId, week);
      }
    }

    // Generate all matchups for the season
    const allMatchups: any[] = [];
    console.log(`[ScheduleGenerator] Generating ${totalWeeks} weeks of matchups for ${totalTeams} teams...`);

    for (let weekOffset = 0; weekOffset < totalWeeks; weekOffset++) {
      const week = startWeek + weekOffset;
      const weekMatchups = generateRoundRobinWeek(rosterIds, weekOffset + 1);

      // Create matchups in database
      for (const matchup of weekMatchups) {
        const created = await createMatchup({
          league_id: leagueId,
          week,
          season,
          roster1_id: matchup.roster1_id,
          roster2_id: matchup.roster2_id,
        });
        allMatchups.push(created);
      }

      console.log(`[ScheduleGenerator] Generated ${weekMatchups.length} matchups for week ${week}`);
    }

    // Validate the schedule
    const validation = validateSchedule(allMatchups, totalTeams, totalWeeks);
    if (!validation.valid) {
      console.error("[ScheduleGenerator] Schedule validation failed:", validation.errors);
      return {
        success: false,
        matchups: allMatchups,
        message: "Schedule generated but validation failed",
        errors: validation.errors,
      };
    }

    console.log(`[ScheduleGenerator] Successfully generated and validated ${allMatchups.length} matchups`);

    return {
      success: true,
      matchups: allMatchups,
      message: `Successfully generated ${allMatchups.length} matchups for ${totalWeeks} weeks`,
    };
  } catch (error: any) {
    console.error("[ScheduleGenerator] Error generating full season schedule:", error);
    return {
      success: false,
      matchups: [],
      message: error.message || "Error generating schedule",
      errors: [error.message],
    };
  }
}

/**
 * Generate matchups for a single week using the circle method (round-robin)
 *
 * Circle Method Algorithm:
 * - Fix one team in position (team 0)
 * - Rotate all other teams clockwise around the circle
 * - For even teams: Each rotation produces n/2 matchups with no byes
 * - For odd teams: Add a dummy team, one real team gets bye (paired with dummy)
 *
 * Example for 8 teams, week 1:
 *   Positions: [0, 1, 2, 3, 4, 5, 6, 7]
 *   Matchups: 0-7, 1-6, 2-5, 3-4
 *
 * Example for 8 teams, week 2:
 *   Positions: [0, 7, 1, 2, 3, 4, 5, 6] (rotated clockwise, 0 stays fixed)
 *   Matchups: 0-6, 7-5, 1-4, 2-3
 *
 * @param rosterIds - Array of roster IDs
 * @param weekNumber - Week number (1-based)
 * @param totalTeams - Total number of teams in league
 * @returns Array of matchup pairs for this week
 */
export function generateRoundRobinWeek(
  rosterIds: number[],
  weekNumber: number
): ScheduleMatchup[] {
  const matchups: ScheduleMatchup[] = [];
  const teams = [...rosterIds];

  // For odd number of teams, add a dummy team for bye weeks
  const hasOddTeams = teams.length % 2 === 1;
  if (hasOddTeams) {
    teams.push(-1); // -1 represents a bye (dummy team)
  }

  const numTeams = teams.length;
  const rotations = (weekNumber - 1) % (numTeams - 1);

  // Create the rotation for this week
  // Position 0 is always fixed, positions 1 to n-1 rotate
  const rotated = [teams[0]]; // Keep first team fixed

  // Rotate the remaining teams
  for (let i = 1; i < numTeams; i++) {
    const originalIndex = ((i - rotations - 1 + numTeams - 1) % (numTeams - 1)) + 1;
    rotated.push(teams[originalIndex]);
  }

  // Create matchups: pair teams from opposite ends of the circle
  // Team at position i plays team at position (n-1-i)
  const halfPoint = Math.floor(numTeams / 2);
  for (let i = 0; i < halfPoint; i++) {
    const team1 = rotated[i];
    const team2 = rotated[numTeams - 1 - i];

    // Handle bye weeks (when paired with dummy team -1)
    if (team1 === -1) {
      matchups.push({
        roster1_id: team2,
        roster2_id: null,
      });
    } else if (team2 === -1) {
      matchups.push({
        roster1_id: team1,
        roster2_id: null,
      });
    } else {
      matchups.push({
        roster1_id: team1,
        roster2_id: team2,
      });
    }
  }

  return matchups;
}

/**
 * Validate that a schedule has no duplicates and covers all teams properly
 *
 * Checks:
 * - Each team plays the correct number of games
 * - No team plays itself
 * - No duplicate matchups
 * - Bye weeks distributed fairly (for odd team counts)
 *
 * @param matchups - Array of all matchups
 * @param totalTeams - Total number of teams
 * @param totalWeeks - Total number of weeks
 * @returns Validation result with errors if any
 */
export function validateSchedule(
  matchups: any[],
  totalTeams: number,
  totalWeeks: number
): ValidationResult {
  const errors: string[] = [];

  // Track games per team
  const gamesPerTeam = new Map<number, number>();
  const byesPerTeam = new Map<number, number>();
  const opponentsPerTeam = new Map<number, Set<number>>();

  // Initialize tracking
  const uniqueRosterIds = new Set<number>();
  matchups.forEach((m) => {
    if (m.roster1_id) uniqueRosterIds.add(m.roster1_id);
    if (m.roster2_id) uniqueRosterIds.add(m.roster2_id);
  });

  uniqueRosterIds.forEach((id) => {
    gamesPerTeam.set(id, 0);
    byesPerTeam.set(id, 0);
    opponentsPerTeam.set(id, new Set());
  });

  // Track matchups by week to check for conflicts
  const matchupsByWeek = new Map<number, Set<number>>();

  // Analyze each matchup
  for (const matchup of matchups) {
    const { week, roster1_id, roster2_id } = matchup;

    // Initialize week tracking
    if (!matchupsByWeek.has(week)) {
      matchupsByWeek.set(week, new Set());
    }
    const weekRosters = matchupsByWeek.get(week)!;

    // Check team plays itself
    if (roster1_id === roster2_id && roster2_id !== null) {
      errors.push(`Week ${week}: Team ${roster1_id} is matched against itself`);
    }

    // Check roster1 not already playing this week
    if (weekRosters.has(roster1_id)) {
      errors.push(`Week ${week}: Team ${roster1_id} appears in multiple matchups`);
    }
    weekRosters.add(roster1_id);

    // Handle bye week
    if (roster2_id === null) {
      const byeCount = byesPerTeam.get(roster1_id) || 0;
      byesPerTeam.set(roster1_id, byeCount + 1);
    } else {
      // Check roster2 not already playing this week
      if (weekRosters.has(roster2_id)) {
        errors.push(`Week ${week}: Team ${roster2_id} appears in multiple matchups`);
      }
      weekRosters.add(roster2_id);

      // Track games and opponents
      const games1 = gamesPerTeam.get(roster1_id) || 0;
      const games2 = gamesPerTeam.get(roster2_id) || 0;
      gamesPerTeam.set(roster1_id, games1 + 1);
      gamesPerTeam.set(roster2_id, games2 + 1);

      // Track opponents for duplicate detection
      const opponents1 = opponentsPerTeam.get(roster1_id)!;
      const opponents2 = opponentsPerTeam.get(roster2_id)!;

      if (opponents1.has(roster2_id)) {
        errors.push(`Duplicate matchup: Team ${roster1_id} plays Team ${roster2_id} multiple times`);
      }

      opponents1.add(roster2_id);
      opponents2.add(roster1_id);
    }
  }

  // Check game counts
  const hasOddTeams = totalTeams % 2 === 1;

  gamesPerTeam.forEach((games, teamId) => {
    const byes = byesPerTeam.get(teamId) || 0;
    const totalScheduled = games + byes;

    // For odd teams, each team should have exactly 1 bye
    if (hasOddTeams && byes !== 1) {
      errors.push(`Team ${teamId} has ${byes} bye(s), expected 1`);
    }

    // For even teams, no byes
    if (!hasOddTeams && byes > 0) {
      errors.push(`Team ${teamId} has ${byes} bye(s), but league has even number of teams`);
    }

    // Total scheduled should equal total weeks
    if (totalScheduled !== totalWeeks) {
      errors.push(
        `Team ${teamId} has ${totalScheduled} weeks scheduled, expected ${totalWeeks}`
      );
    }
  });

  // Check that all teams are included
  if (uniqueRosterIds.size !== totalTeams) {
    errors.push(
      `Schedule includes ${uniqueRosterIds.size} teams, but league has ${totalTeams} teams`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a matchup between two teams already exists in a specific week
 *
 * @param existingMatchups - Array of existing matchups
 * @param roster1 - First roster ID
 * @param roster2 - Second roster ID
 * @param week - Week number
 * @returns True if conflict exists
 */
export function hasConflict(
  existingMatchups: any[],
  roster1: number,
  roster2: number,
  week: number
): boolean {
  return existingMatchups.some((m) => {
    if (m.week !== week) return false;

    // Check if either roster is already playing this week
    const rostersInMatch = [m.roster1_id, m.roster2_id].filter((id) => id !== null);
    return rostersInMatch.includes(roster1) || rostersInMatch.includes(roster2);
  });
}

/**
 * Get matchup statistics for a schedule
 * Useful for debugging and verification
 *
 * @param matchups - Array of matchups
 * @returns Statistics object
 */
export function getScheduleStats(matchups: any[]): {
  totalMatchups: number;
  totalWeeks: number;
  teamsInvolved: number;
  byeWeeks: number;
  gamesPerTeam: Map<number, number>;
} {
  const weekSet = new Set<number>();
  const teamSet = new Set<number>();
  const gamesPerTeam = new Map<number, number>();
  let byeWeeks = 0;

  matchups.forEach((m) => {
    weekSet.add(m.week);

    if (m.roster1_id) {
      teamSet.add(m.roster1_id);
      gamesPerTeam.set(m.roster1_id, (gamesPerTeam.get(m.roster1_id) || 0) + 1);
    }

    if (m.roster2_id) {
      teamSet.add(m.roster2_id);
      gamesPerTeam.set(m.roster2_id, (gamesPerTeam.get(m.roster2_id) || 0) + 1);
    } else {
      byeWeeks++;
    }
  });

  return {
    totalMatchups: matchups.length,
    totalWeeks: weekSet.size,
    teamsInvolved: teamSet.size,
    byeWeeks,
    gamesPerTeam,
  };
}
