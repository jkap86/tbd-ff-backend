import axios from "axios";

const SLEEPER_GRAPHQL_URL = "https://sleeper.com/graphql";
const API_TIMEOUT = 30000; // 30 seconds

interface GameSchedule {
  game_id: string;
  metadata: any;
  status: string; // "in_progress", "complete", "pre_game"
  start_time: string;
}

interface ScheduleResponse {
  data: {
    scores: GameSchedule[];
  };
}

/**
 * Get NFL schedule for a specific week
 * Returns game status, start times, and metadata
 */
export async function getWeekSchedule(
  season: string,
  week: number,
  seasonType: string = "regular"
): Promise<GameSchedule[]> {
  try {
    const graphqlQuery = {
      query: `
        query batch_scores {
          scores(
            sport: "nfl"
            season_type: "${seasonType}"
            season: "${season}"
            week: ${week}
          ) {
            game_id
            metadata
            status
            start_time
          }
        }
      `,
    };

    const response = await axios.post<ScheduleResponse>(
      SLEEPER_GRAPHQL_URL,
      graphqlQuery,
      { timeout: API_TIMEOUT }
    );

    return response.data.data.scores || [];
  } catch (error) {
    console.error("Error fetching week schedule:", error);
    return [];
  }
}

/**
 * Check if a week is complete (all games finished)
 */
export async function isWeekComplete(
  season: string,
  week: number,
  seasonType: string = "regular"
): Promise<boolean> {
  try {
    const schedule = await getWeekSchedule(season, week, seasonType);

    if (schedule.length === 0) {
      return false; // No games found
    }

    // Week is complete if all games have status "complete"
    return schedule.every((game) => game.status === "complete");
  } catch (error) {
    console.error("Error checking if week is complete:", error);
    return false;
  }
}

/**
 * Get teams that are currently playing or have played
 * Returns map of team abbreviation -> game status
 */
export async function getTeamsWithGamesStarted(
  season: string,
  week: number,
  seasonType: string = "regular"
): Promise<Map<string, string>> {
  try {
    const schedule = await getWeekSchedule(season, week, seasonType);
    const teamsPlaying = new Map<string, string>();

    for (const game of schedule) {
      // Only include games that are in_progress or complete
      if (game.status === "in_progress" || game.status === "complete") {
        // Extract team abbreviations from metadata
        // Metadata typically has away_team and home_team
        if (game.metadata?.away_team) {
          teamsPlaying.set(game.metadata.away_team, game.status);
        }
        if (game.metadata?.home_team) {
          teamsPlaying.set(game.metadata.home_team, game.status);
        }
      }
    }

    return teamsPlaying;
  } catch (error) {
    console.error("Error getting teams with games started:", error);
    return new Map();
  }
}
