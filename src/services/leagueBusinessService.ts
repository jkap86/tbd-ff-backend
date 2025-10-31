import pool from "../config/database";
import {
  createLeague,
  getLeagueById,
  CreateLeagueInput,
  League,
} from "../models/League";

/**
 * Service layer for league business logic
 * Handles complex operations involving multiple models and database transactions
 */
export class LeagueBusinessService {
  /**
   * Create a new league with all default settings and auto-generate matchups
   * @param _userId - The user ID who is creating the league (becomes commissioner)
   * @param leagueData - League creation data
   * @returns The created league
   */
  async createLeagueWithDefaults(
    _userId: number,
    leagueData: CreateLeagueInput
  ): Promise<League> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Create the league
      const league = await createLeague(leagueData);

      // Auto-generate matchups for all regular season weeks
      const startWeek = leagueData.settings?.start_week || 1;
      const playoffWeekStart = leagueData.settings?.playoff_week_start || 15;
      const { generateMatchupsForWeek } = await import("../models/Matchup");

      console.log(
        `[LeagueBusinessService] Auto-generating matchups for weeks ${startWeek} to ${playoffWeekStart - 1}...`
      );

      for (let week = startWeek; week < playoffWeekStart; week++) {
        try {
          await generateMatchupsForWeek(league.id, week, leagueData.season);
          console.log(
            `[LeagueBusinessService] Generated matchups for week ${week}`
          );
        } catch (error) {
          console.error(
            `[LeagueBusinessService] Failed to generate matchups for week ${week}:`,
            error
          );
          // Continue with other weeks even if one fails
        }
      }

      await client.query("COMMIT");

      return league;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[LeagueBusinessService] Error creating league:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get league with verification
   * @param leagueId - The league ID
   * @returns The league or null if not found
   */
  async getLeague(leagueId: number): Promise<League | null> {
    return await getLeagueById(leagueId);
  }
}

// Export singleton instance
export const leagueBusinessService = new LeagueBusinessService();
