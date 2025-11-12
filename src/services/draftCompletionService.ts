import { League } from "../models/League";
import { generateMatchupsForWeek, getMatchupsByLeagueAndWeek } from "../models/Matchup";
import { updateMatchupScoresForWeek } from "./scoringService";
import { finalizeWeekScores, recalculateAllRecords } from "./recordService";

/**
 * Service for handling draft/auction completion logic
 * Centralizes matchup generation and scoring initialization
 */

export interface SeasonInitializationOptions {
  leagueId: number;
  season: string;
  startWeek: number;
  playoffWeekStart: number;
  seasonType?: "regular" | "post";
}

/**
 * Initialize season after draft/auction completion
 * Generates matchups and calculates scores for all regular season weeks
 */
export async function initializeSeasonAfterDraft(
  options: SeasonInitializationOptions
): Promise<void> {
  const { leagueId, season, startWeek, playoffWeekStart, seasonType = "regular" } = options;

  console.log(`[SeasonInit] Initializing season for league ${leagueId}, season ${season}`);
  console.log(`[SeasonInit] Weeks: ${startWeek} to ${playoffWeekStart - 1}`);

  // Generate matchups for all weeks if they don't exist
  await generateAllMatchups(leagueId, season, startWeek, playoffWeekStart);

  // Calculate scores for all weeks
  await calculateAllWeekScores(leagueId, season, startWeek, playoffWeekStart, seasonType);

  // Recalculate all records to ensure consistency
  await recalculateSeasonRecords(leagueId, season);

  console.log(`[SeasonInit] Season initialization complete for league ${leagueId}`);
}

/**
 * Generate matchups for all regular season weeks
 * Only generates matchups that don't already exist
 */
async function generateAllMatchups(
  leagueId: number,
  season: string,
  startWeek: number,
  playoffWeekStart: number
): Promise<void> {
  console.log(`[SeasonInit] Checking/generating matchups for weeks ${startWeek}-${playoffWeekStart - 1}...`);

  for (let week = startWeek; week < playoffWeekStart; week++) {
    try {
      const existingMatchups = await getMatchupsByLeagueAndWeek(leagueId, week);

      if (existingMatchups.length === 0) {
        console.log(`[SeasonInit] Generating matchups for week ${week}...`);
        await generateMatchupsForWeek(leagueId, week, season);
      } else {
        console.log(`[SeasonInit] Matchups already exist for week ${week}, skipping...`);
      }
    } catch (error) {
      console.error(`[SeasonInit] Failed to generate matchups for week ${week}:`, error);
      // Continue with other weeks even if one fails
    }
  }

  console.log(`[SeasonInit] Matchup generation complete`);
}

/**
 * Calculate and finalize scores for all regular season weeks
 */
async function calculateAllWeekScores(
  leagueId: number,
  season: string,
  startWeek: number,
  playoffWeekStart: number,
  seasonType: "regular" | "post"
): Promise<void> {
  console.log(`[SeasonInit] Calculating scores for all weeks...`);

  for (let week = startWeek; week < playoffWeekStart; week++) {
    try {
      console.log(`[SeasonInit] Updating scores for week ${week}...`);
      await updateMatchupScoresForWeek(leagueId, week, season, seasonType);
      await finalizeWeekScores(leagueId, week, season, seasonType);
    } catch (error) {
      console.error(`[SeasonInit] Failed to update scores for week ${week}:`, error);
      // Continue with other weeks even if one fails
    }
  }

  console.log(`[SeasonInit] Score calculation complete`);
}

/**
 * Recalculate all records to ensure consistency after score updates
 */
async function recalculateSeasonRecords(
  leagueId: number,
  season: string
): Promise<void> {
  console.log(`[SeasonInit] Recalculating all records...`);

  try {
    await recalculateAllRecords(leagueId, season);
    console.log(`[SeasonInit] Record recalculation complete`);
  } catch (error) {
    console.error(`[SeasonInit] Failed to recalculate records:`, error);
    throw error; // This is critical, so rethrow
  }
}

/**
 * Helper to initialize season from a League object
 */
export async function initializeSeasonFromLeague(league: League): Promise<void> {
  const startWeek = league.settings?.start_week || 1;
  const playoffWeekStart = league.settings?.playoff_week_start || 15;

  await initializeSeasonAfterDraft({
    leagueId: league.id,
    season: league.season,
    startWeek,
    playoffWeekStart,
    seasonType: "regular",
  });
}
