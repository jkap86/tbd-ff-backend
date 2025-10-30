import pool from "../config/database";
import { getPlayoffTeams, StandingsEntry } from "./standingsService";

/**
 * Playoff round types matching database enum
 */
export type PlayoffRound = "wildcard" | "quarterfinal" | "semifinal" | "final" | "third_place";

/**
 * Playoff settings from database
 */
export interface PlayoffSettings {
  id: number;
  league_id: number;
  playoff_teams: number;
  playoff_week_start: number;
  playoff_week_end: number;
  matchup_duration: number;
  include_consolation_bracket: boolean;
  reseed_rounds: boolean;
  tiebreaker_priority: string[];
}

/**
 * Bracket matchup structure before database insertion
 */
interface BracketMatchup {
  week: number;
  round: PlayoffRound;
  bracket_position: string;
  seed1: number;
  seed2: number | null; // null for bye
  roster1_id: number;
  roster2_id: number | null; // null for bye
  is_championship: boolean;
  is_consolation: boolean;
}

/**
 * Get playoff settings for a league
 * @param leagueId - League ID
 * @returns Playoff settings or null if not configured
 */
export async function getPlayoffSettings(
  leagueId: number
): Promise<PlayoffSettings | null> {
  try {
    const query = `
      SELECT * FROM playoff_settings
      WHERE league_id = $1
    `;
    const result = await pool.query(query, [leagueId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting playoff settings:", error);
    throw new Error("Error getting playoff settings");
  }
}

/**
 * Create or update playoff settings for a league
 * @param leagueId - League ID
 * @param settings - Playoff settings to save
 * @returns Created/updated playoff settings
 */
export async function savePlayoffSettings(
  leagueId: number,
  settings: Partial<Omit<PlayoffSettings, "id" | "league_id">>
): Promise<PlayoffSettings> {
  try {
    const query = `
      INSERT INTO playoff_settings (
        league_id,
        playoff_teams,
        playoff_week_start,
        playoff_week_end,
        matchup_duration,
        include_consolation_bracket,
        reseed_rounds,
        tiebreaker_priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (league_id)
      DO UPDATE SET
        playoff_teams = EXCLUDED.playoff_teams,
        playoff_week_start = EXCLUDED.playoff_week_start,
        playoff_week_end = EXCLUDED.playoff_week_end,
        matchup_duration = EXCLUDED.matchup_duration,
        include_consolation_bracket = EXCLUDED.include_consolation_bracket,
        reseed_rounds = EXCLUDED.reseed_rounds,
        tiebreaker_priority = EXCLUDED.tiebreaker_priority,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      leagueId,
      settings.playoff_teams || 6,
      settings.playoff_week_start || 15,
      settings.playoff_week_end || 17,
      settings.matchup_duration || 1,
      settings.include_consolation_bracket || false,
      settings.reseed_rounds || false,
      JSON.stringify(settings.tiebreaker_priority || ["bench_points", "season_points_for", "higher_seed"]),
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error saving playoff settings:", error);
    throw new Error("Error saving playoff settings");
  }
}

/**
 * Generate complete playoff bracket for a league
 * @param leagueId - League ID
 * @param season - Season year
 * @returns Promise that resolves when bracket is created
 */
export async function generatePlayoffBracket(
  leagueId: number,
  season: string
): Promise<void> {
  try {
    console.log(`[PlayoffService] Generating playoff bracket for league ${leagueId}, season ${season}`);

    // 1. Get playoff settings
    const settings = await getPlayoffSettings(leagueId);
    if (!settings) {
      throw new Error("Playoff settings not found. Please configure playoff settings first.");
    }

    // 2. Get seeded playoff teams from standings
    const teams = await getPlayoffTeams(leagueId);
    console.log(`[PlayoffService] Retrieved ${teams.length} playoff teams`);

    // 3. Validate team count matches settings
    if (teams.length < settings.playoff_teams) {
      throw new Error(
        `Not enough teams for playoffs. Expected ${settings.playoff_teams}, found ${teams.length}`
      );
    }

    // Trim to exact playoff team count
    const playoffTeams = teams.slice(0, settings.playoff_teams);

    // 4. Generate matchups based on format
    let matchups: BracketMatchup[];

    switch (settings.playoff_teams) {
      case 4:
        matchups = generate4TeamBracket(settings, playoffTeams);
        break;
      case 6:
        matchups = generate6TeamBracket(settings, playoffTeams);
        break;
      case 8:
        matchups = generate8TeamBracket(settings, playoffTeams);
        break;
      default:
        throw new Error(`Unsupported playoff team count: ${settings.playoff_teams}`);
    }

    console.log(`[PlayoffService] Generated ${matchups.length} playoff matchups`);

    // 5. Delete any existing playoff matchups for this league/season
    await deletePlayoffMatchups(leagueId, season);

    // 6. Insert matchups into database
    await insertBracketMatchups(leagueId, season, matchups);

    console.log(`[PlayoffService] Playoff bracket generation complete`);
  } catch (error) {
    console.error("Error generating playoff bracket:", error);
    throw error;
  }
}

/**
 * Generate 4-team bracket
 * Week 15-16: Semifinals (1v4, 2v3) - two-week matchups
 * Week 17: Championship (winner semi1 vs winner semi2)
 * Optional Week 17: 3rd place game (loser semi1 vs loser semi2)
 */
function generate4TeamBracket(
  settings: PlayoffSettings,
  teams: StandingsEntry[]
): BracketMatchup[] {
  const matchups: BracketMatchup[] = [];
  const startWeek = settings.playoff_week_start;
  const duration = settings.matchup_duration;

  // SEMIFINALS (Week 15-16 for 2-week, or Week 15 for 1-week)
  // Matchup 1: Seed 1 vs Seed 4
  matchups.push({
    week: startWeek,
    round: "semifinal",
    bracket_position: "semi1",
    seed1: 1,
    seed2: 4,
    roster1_id: teams[0].roster_id,
    roster2_id: teams[3].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  // Matchup 2: Seed 2 vs Seed 3
  matchups.push({
    week: startWeek,
    round: "semifinal",
    bracket_position: "semi2",
    seed1: 2,
    seed2: 3,
    roster1_id: teams[1].roster_id,
    roster2_id: teams[2].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  // CHAMPIONSHIP (Week 17 for 2-week semis, Week 16 for 1-week semis)
  const championshipWeek = duration === 2 ? startWeek + 2 : startWeek + 1;

  matchups.push({
    week: championshipWeek,
    round: "final",
    bracket_position: "championship",
    seed1: 0, // Placeholder - winner of semi1
    seed2: 0, // Placeholder - winner of semi2
    roster1_id: 0, // Placeholder
    roster2_id: 0, // Placeholder
    is_championship: true,
    is_consolation: false,
  });

  // 3RD PLACE GAME (optional, same week as championship)
  if (settings.include_consolation_bracket) {
    matchups.push({
      week: championshipWeek,
      round: "third_place",
      bracket_position: "3rd_place",
      seed1: 0, // Placeholder - loser of semi1
      seed2: 0, // Placeholder - loser of semi2
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });
  }

  return matchups;
}

/**
 * Generate 6-team bracket
 * Week 14: Wildcard round (3v6, 4v5) - Seeds 1 and 2 get BYE
 * Week 15-16: Semifinals (1 vs wildcard winner, 2 vs wildcard winner)
 * Week 17: Championship
 * Optional Week 17: 3rd place / 5th place games
 */
function generate6TeamBracket(
  settings: PlayoffSettings,
  teams: StandingsEntry[]
): BracketMatchup[] {
  const matchups: BracketMatchup[] = [];
  const startWeek = settings.playoff_week_start;
  const duration = settings.matchup_duration;

  // WILDCARD ROUND (Week 14)
  // Matchup 1: Seed 3 vs Seed 6
  matchups.push({
    week: startWeek,
    round: "wildcard",
    bracket_position: "3v6",
    seed1: 3,
    seed2: 6,
    roster1_id: teams[2].roster_id,
    roster2_id: teams[5].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  // Matchup 2: Seed 4 vs Seed 5
  matchups.push({
    week: startWeek,
    round: "wildcard",
    bracket_position: "4v5",
    seed1: 4,
    seed2: 5,
    roster1_id: teams[3].roster_id,
    roster2_id: teams[4].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  // SEMIFINALS (Week 15 for 1-week, Week 15-16 for 2-week)
  const semiWeek = startWeek + 1;

  // Matchup 1: Seed 1 (BYE) vs Winner of 3v6
  matchups.push({
    week: semiWeek,
    round: "semifinal",
    bracket_position: "semi1",
    seed1: 1,
    seed2: 0, // Placeholder - winner of 3v6
    roster1_id: teams[0].roster_id,
    roster2_id: 0, // Placeholder
    is_championship: false,
    is_consolation: false,
  });

  // Matchup 2: Seed 2 (BYE) vs Winner of 4v5
  matchups.push({
    week: semiWeek,
    round: "semifinal",
    bracket_position: "semi2",
    seed1: 2,
    seed2: 0, // Placeholder - winner of 4v5
    roster1_id: teams[1].roster_id,
    roster2_id: 0, // Placeholder
    is_championship: false,
    is_consolation: false,
  });

  // CHAMPIONSHIP (Week 17 for 2-week semis, Week 16 for 1-week semis)
  const championshipWeek = duration === 2 ? semiWeek + 2 : semiWeek + 1;

  matchups.push({
    week: championshipWeek,
    round: "final",
    bracket_position: "championship",
    seed1: 0, // Placeholder - winner of semi1
    seed2: 0, // Placeholder - winner of semi2
    roster1_id: 0, // Placeholder
    roster2_id: 0, // Placeholder
    is_championship: true,
    is_consolation: false,
  });

  // CONSOLATION GAMES (optional)
  if (settings.include_consolation_bracket) {
    // 3rd place game
    matchups.push({
      week: championshipWeek,
      round: "third_place",
      bracket_position: "3rd_place",
      seed1: 0, // Placeholder - loser of semi1
      seed2: 0, // Placeholder - loser of semi2
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });

    // 5th place game (losers of wildcard round)
    matchups.push({
      week: championshipWeek,
      round: "third_place",
      bracket_position: "5th_place",
      seed1: 0, // Placeholder - loser of 3v6
      seed2: 0, // Placeholder - loser of 4v5
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });
  }

  return matchups;
}

/**
 * Generate 8-team bracket
 * Week 14: Quarterfinals (1v8, 2v7, 3v6, 4v5)
 * Week 15: Semifinals (winner QF1 vs winner QF4, winner QF2 vs winner QF3)
 * Week 16-17: Championship (two-week final)
 * Optional: Consolation bracket for 5th-8th place
 */
function generate8TeamBracket(
  settings: PlayoffSettings,
  teams: StandingsEntry[]
): BracketMatchup[] {
  const matchups: BracketMatchup[] = [];
  const startWeek = settings.playoff_week_start;
  // const duration = settings.matchup_duration; // Reserved for future use

  // QUARTERFINALS (Week 14)
  matchups.push({
    week: startWeek,
    round: "quarterfinal",
    bracket_position: "1v8",
    seed1: 1,
    seed2: 8,
    roster1_id: teams[0].roster_id,
    roster2_id: teams[7].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  matchups.push({
    week: startWeek,
    round: "quarterfinal",
    bracket_position: "2v7",
    seed1: 2,
    seed2: 7,
    roster1_id: teams[1].roster_id,
    roster2_id: teams[6].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  matchups.push({
    week: startWeek,
    round: "quarterfinal",
    bracket_position: "3v6",
    seed1: 3,
    seed2: 6,
    roster1_id: teams[2].roster_id,
    roster2_id: teams[5].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  matchups.push({
    week: startWeek,
    round: "quarterfinal",
    bracket_position: "4v5",
    seed1: 4,
    seed2: 5,
    roster1_id: teams[3].roster_id,
    roster2_id: teams[4].roster_id,
    is_championship: false,
    is_consolation: false,
  });

  // SEMIFINALS (Week 15)
  const semiWeek = startWeek + 1;

  // Semi 1: Winner of 1v8 vs Winner of 4v5
  matchups.push({
    week: semiWeek,
    round: "semifinal",
    bracket_position: "semi1",
    seed1: 0, // Placeholder - winner of 1v8
    seed2: 0, // Placeholder - winner of 4v5
    roster1_id: 0, // Placeholder
    roster2_id: 0, // Placeholder
    is_championship: false,
    is_consolation: false,
  });

  // Semi 2: Winner of 2v7 vs Winner of 3v6
  matchups.push({
    week: semiWeek,
    round: "semifinal",
    bracket_position: "semi2",
    seed1: 0, // Placeholder - winner of 2v7
    seed2: 0, // Placeholder - winner of 3v6
    roster1_id: 0, // Placeholder
    roster2_id: 0, // Placeholder
    is_championship: false,
    is_consolation: false,
  });

  // CHAMPIONSHIP (Week 16-17 for 2-week final, Week 16 for 1-week)
  // For 8-team bracket, championship is typically 2-week to reduce variance
  const championshipWeek = semiWeek + 1;

  matchups.push({
    week: championshipWeek,
    round: "final",
    bracket_position: "championship",
    seed1: 0, // Placeholder - winner of semi1
    seed2: 0, // Placeholder - winner of semi2
    roster1_id: 0, // Placeholder
    roster2_id: 0, // Placeholder
    is_championship: true,
    is_consolation: false,
  });

  // CONSOLATION BRACKET (optional)
  if (settings.include_consolation_bracket) {
    // 3rd place game (losers of semifinals)
    matchups.push({
      week: championshipWeek,
      round: "third_place",
      bracket_position: "3rd_place",
      seed1: 0, // Placeholder - loser of semi1
      seed2: 0, // Placeholder - loser of semi2
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });

    // 5th-8th place bracket (quarterfinal losers)
    // These would be played in parallel with semifinals and finals

    // 5th place semifinal 1: Loser of 1v8 vs Loser of 4v5
    matchups.push({
      week: semiWeek,
      round: "semifinal",
      bracket_position: "consol_semi1",
      seed1: 0, // Placeholder - loser of 1v8
      seed2: 0, // Placeholder - loser of 4v5
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });

    // 5th place semifinal 2: Loser of 2v7 vs Loser of 3v6
    matchups.push({
      week: semiWeek,
      round: "semifinal",
      bracket_position: "consol_semi2",
      seed1: 0, // Placeholder - loser of 2v7
      seed2: 0, // Placeholder - loser of 3v6
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });

    // 5th place game
    matchups.push({
      week: championshipWeek,
      round: "third_place",
      bracket_position: "5th_place",
      seed1: 0, // Placeholder - winner of consol_semi1
      seed2: 0, // Placeholder - winner of consol_semi2
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });

    // 7th place game
    matchups.push({
      week: championshipWeek,
      round: "third_place",
      bracket_position: "7th_place",
      seed1: 0, // Placeholder - loser of consol_semi1
      seed2: 0, // Placeholder - loser of consol_semi2
      roster1_id: 0, // Placeholder
      roster2_id: 0, // Placeholder
      is_championship: false,
      is_consolation: true,
    });
  }

  return matchups;
}

/**
 * Insert bracket matchups into database
 * @param leagueId - League ID
 * @param season - Season year
 * @param matchups - Array of bracket matchups to insert
 */
async function insertBracketMatchups(
  leagueId: number,
  season: string,
  matchups: BracketMatchup[]
): Promise<void> {
  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const matchup of matchups) {
        const query = `
          INSERT INTO matchups (
            league_id,
            week,
            season,
            roster1_id,
            roster2_id,
            is_playoff,
            playoff_round,
            bracket_position,
            is_championship,
            is_consolation,
            seed1,
            seed2,
            status,
            roster1_score,
            roster2_score
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;

        const values = [
          leagueId,
          matchup.week,
          season,
          matchup.roster1_id,
          matchup.roster2_id,
          true, // is_playoff
          matchup.round,
          matchup.bracket_position,
          matchup.is_championship,
          matchup.is_consolation,
          matchup.seed1,
          matchup.seed2,
          "scheduled", // status
          0, // roster1_score
          0, // roster2_score
        ];

        await client.query(query, values);
      }

      await client.query("COMMIT");
      console.log(`[PlayoffService] Inserted ${matchups.length} matchups into database`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error inserting bracket matchups:", error);
    throw new Error("Error inserting bracket matchups");
  }
}

/**
 * Delete all playoff matchups for a league/season
 * @param leagueId - League ID
 * @param season - Season year
 */
async function deletePlayoffMatchups(
  leagueId: number,
  season: string
): Promise<void> {
  try {
    const query = `
      DELETE FROM matchups
      WHERE league_id = $1
        AND season = $2
        AND is_playoff = true
    `;

    const result = await pool.query(query, [leagueId, season]);
    console.log(`[PlayoffService] Deleted ${result.rowCount} existing playoff matchups`);
  } catch (error) {
    console.error("Error deleting playoff matchups:", error);
    throw new Error("Error deleting playoff matchups");
  }
}

/**
 * Get all playoff matchups for a league
 * @param leagueId - League ID
 * @param season - Season year
 * @returns Array of playoff matchups with roster details
 */
export async function getPlayoffMatchups(
  leagueId: number,
  season: string
): Promise<any[]> {
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
        AND m.season = $2
        AND m.is_playoff = true
      ORDER BY m.week, m.playoff_round, m.bracket_position
    `;

    const result = await pool.query(query, [leagueId, season]);
    return result.rows;
  } catch (error) {
    console.error("Error getting playoff matchups:", error);
    throw new Error("Error getting playoff matchups");
  }
}

/**
 * Get playoff matchups grouped by round
 * @param leagueId - League ID
 * @param season - Season year
 * @returns Object with matchups grouped by round
 */
export async function getPlayoffBracket(
  leagueId: number,
  season: string
): Promise<{
  wildcard: any[];
  quarterfinal: any[];
  semifinal: any[];
  final: any[];
  third_place: any[];
  consolation: any[];
}> {
  try {
    const matchups = await getPlayoffMatchups(leagueId, season);

    const bracket = {
      wildcard: matchups.filter(m => m.playoff_round === "wildcard" && !m.is_consolation),
      quarterfinal: matchups.filter(m => m.playoff_round === "quarterfinal" && !m.is_consolation),
      semifinal: matchups.filter(m => m.playoff_round === "semifinal" && !m.is_consolation),
      final: matchups.filter(m => m.playoff_round === "final"),
      third_place: matchups.filter(m => m.playoff_round === "third_place" && !m.is_consolation),
      consolation: matchups.filter(m => m.is_consolation && m.playoff_round !== "third_place"),
    };

    return bracket;
  } catch (error) {
    console.error("Error getting playoff bracket:", error);
    throw new Error("Error getting playoff bracket");
  }
}

/**
 * Update playoff matchup after a round completes
 * This advances winners to the next round
 * @param matchupId - ID of completed matchup
 */
export async function advancePlayoffWinner(matchupId: number): Promise<void> {
  try {
    // Get the completed matchup
    const matchupQuery = `
      SELECT * FROM matchups
      WHERE id = $1 AND is_playoff = true AND status = 'completed'
    `;
    const matchupResult = await pool.query(matchupQuery, [matchupId]);

    if (matchupResult.rows.length === 0) {
      throw new Error("Matchup not found or not completed");
    }

    const matchup = matchupResult.rows[0];

    // Determine winner
    const winnerId = matchup.roster1_score > matchup.roster2_score
      ? matchup.roster1_id
      : matchup.roster2_id;
    const winnerSeed = matchup.roster1_score > matchup.roster2_score
      ? matchup.seed1
      : matchup.seed2;

    // const loserId = matchup.roster1_score > matchup.roster2_score
    //   ? matchup.roster2_id
    //   : matchup.roster1_id;
    // const loserSeed = matchup.roster1_score > matchup.roster2_score
    //   ? matchup.seed2
    //   : matchup.seed1;

    // Logic to update next round matchup would go here
    // This is complex and depends on bracket structure
    // For now, this is a placeholder for future implementation

    console.log(`[PlayoffService] Matchup ${matchupId} winner: roster ${winnerId} (seed ${winnerSeed})`);
  } catch (error) {
    console.error("Error advancing playoff winner:", error);
    throw new Error("Error advancing playoff winner");
  }
}

/**
 * Validate playoff settings
 * @param settings - Playoff settings to validate
 * @returns true if valid, throws error otherwise
 */
export function validatePlayoffSettings(
  settings: Partial<PlayoffSettings>
): boolean {
  if (settings.playoff_teams !== undefined) {
    if (![4, 6, 8, 10, 12].includes(settings.playoff_teams)) {
      throw new Error("Playoff teams must be 4, 6, 8, 10, or 12");
    }
  }

  if (settings.matchup_duration !== undefined) {
    if (![1, 2].includes(settings.matchup_duration)) {
      throw new Error("Matchup duration must be 1 or 2 weeks");
    }
  }

  if (settings.playoff_week_start !== undefined && settings.playoff_week_end !== undefined) {
    if (settings.playoff_week_start < 1 || settings.playoff_week_start > 18) {
      throw new Error("Playoff week start must be between 1 and 18");
    }
    if (settings.playoff_week_end < settings.playoff_week_start) {
      throw new Error("Playoff week end must be after or equal to playoff week start");
    }
  }

  return true;
}
