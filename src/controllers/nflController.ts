// Before refactor: 44 lines
// After refactor: 33 lines
// Lines saved: 11 lines
import { Request, Response } from "express";
import { getCurrentNFLWeek } from "../services/currentWeekService";
import { getWeekSchedule } from "../services/sleeperScheduleService";
import { BaseController } from "./BaseController";

class NFLController extends BaseController {
  /**
   * Get current NFL week
   * GET /api/nfl/current-week?season=2025
   */
  getCurrentWeek = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, season_type = "regular" } = req.query;

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    const currentWeek = await getCurrentNFLWeek(
      season as string,
      season_type as string
    );

    this.respondSuccess(res, {
      season: season as string,
      week: currentWeek,
      season_type: season_type as string,
    });
  });

  /**
   * Get NFL schedule for a specific week
   * Returns team matchups
   * GET /api/nfl/schedule?season=2025&week=1&season_type=regular
   */
  getSchedule = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, week, season_type = "regular" } = req.query;

    if (!season || !week) {
      this.respondBadRequest(res, "Season and week are required");
      return;
    }

    const weekNumber = parseInt(week as string, 10);
    if (isNaN(weekNumber)) {
      this.respondBadRequest(res, "Week must be a valid number");
      return;
    }

    // Get schedule from Sleeper
    const games = await getWeekSchedule(
      season as string,
      weekNumber,
      season_type as string
    );

    // Build opponent map (team -> opponent)
    const schedule: Record<string, string> = {};

    for (const game of games) {
      const homeTeam = game.metadata?.home_team;
      const awayTeam = game.metadata?.away_team;

      if (homeTeam && awayTeam) {
        // Home team's opponent is away team
        schedule[homeTeam] = `@${awayTeam}`;
        // Away team's opponent is home team
        schedule[awayTeam] = `vs ${homeTeam}`;
      }
    }

    this.respondSuccess(res, {
      season: season as string,
      week: weekNumber,
      season_type: season_type as string,
      schedule,
    });
  });

  /**
   * Get bye weeks for all NFL teams in a season
   * Returns map of team -> bye week number
   * GET /api/nfl/bye-weeks?season=2025&season_type=regular
   */
  getByeWeeks = this.asyncHandler(async (req: Request, res: Response) => {
    const { season, season_type = "regular" } = req.query;

    if (!season) {
      this.respondBadRequest(res, "Season is required");
      return;
    }

    // Check weeks 1-18 to find bye weeks
    const byeWeeks: Record<string, number> = {};
    const allTeams = new Set<string>();

    // First, collect all teams by checking early weeks
    for (let week = 1; week <= 3; week++) {
      const games = await getWeekSchedule(
        season as string,
        week,
        season_type as string
      );

      for (const game of games) {
        if (game.metadata?.home_team) allTeams.add(game.metadata.home_team);
        if (game.metadata?.away_team) allTeams.add(game.metadata.away_team);
      }
    }

    // Now check each week to find which teams don't have games (bye week)
    for (let week = 1; week <= 18; week++) {
      const games = await getWeekSchedule(
        season as string,
        week,
        season_type as string
      );

      const teamsPlayingThisWeek = new Set<string>();
      for (const game of games) {
        if (game.metadata?.home_team)
          teamsPlayingThisWeek.add(game.metadata.home_team);
        if (game.metadata?.away_team)
          teamsPlayingThisWeek.add(game.metadata.away_team);
      }

      // Teams not playing this week have a bye
      for (const team of allTeams) {
        if (!teamsPlayingThisWeek.has(team) && !byeWeeks[team]) {
          byeWeeks[team] = week;
        }
      }
    }

    this.respondSuccess(res, {
      season: season as string,
      season_type: season_type as string,
      bye_weeks: byeWeeks,
    });
  });
}

const nflController = new NFLController();
export const getCurrentWeek = nflController.getCurrentWeek;
export const getSchedule = nflController.getSchedule;
export const getByeWeeks = nflController.getByeWeeks;
