import { Request, Response } from "express";
import { getPlayoffSettings, createOrUpdatePlayoffSettings } from "../models/PlayoffSettings";
import { getLeagueById } from "../models/League";
import { PlayoffRound } from "../models/Matchup";
import { generatePlayoffBracket } from "../services/playoffService";
import { advancePlayoffWinners, isPlayoffRoundComplete } from "../services/tiebreakerService";
import { calculateStandings } from "../services/standingsService";
import pool from "../config/database";

/**
 * GET /api/playoffs/league/:leagueId/settings
 * Get playoff settings for a league
 */
export async function getPlayoffSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    const settings = await getPlayoffSettings(parseInt(leagueId));

    if (!settings) {
      res.status(404).json({
        success: false,
        message: "Playoff settings not found for this league",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error("Error getting playoff settings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting playoff settings",
    });
  }
}

/**
 * POST /api/playoffs/league/:leagueId/settings
 * Create or update playoff settings (commissioner only)
 */
export async function updatePlayoffSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    // Verify user is commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can update playoff settings",
      });
      return;
    }

    // Validate request body
    const {
      playoff_teams,
      playoff_week_start,
      playoff_week_end,
      matchup_duration,
      include_consolation_bracket,
      reseed_rounds,
      tiebreaker_priority,
    } = req.body;

    // Validate playoff_teams
    if (playoff_teams !== undefined) {
      if (typeof playoff_teams !== "number" || playoff_teams < 2 || playoff_teams > 16) {
        res.status(400).json({
          success: false,
          message: "playoff_teams must be between 2 and 16",
        });
        return;
      }
    }

    // Validate playoff weeks
    if (playoff_week_start !== undefined || playoff_week_end !== undefined) {
      const start = playoff_week_start ?? 15;
      const end = playoff_week_end ?? 17;

      if (start < 1 || start > 18 || end < 1 || end > 18) {
        res.status(400).json({
          success: false,
          message: "Playoff weeks must be between 1 and 18",
        });
        return;
      }

      if (start > end) {
        res.status(400).json({
          success: false,
          message: "playoff_week_start must be before or equal to playoff_week_end",
        });
        return;
      }
    }

    // Validate matchup_duration
    if (matchup_duration !== undefined) {
      if (typeof matchup_duration !== "number" || matchup_duration < 1 || matchup_duration > 4) {
        res.status(400).json({
          success: false,
          message: "matchup_duration must be between 1 and 4 weeks",
        });
        return;
      }
    }

    // Validate tiebreaker_priority
    if (tiebreaker_priority !== undefined) {
      if (!Array.isArray(tiebreaker_priority) || tiebreaker_priority.length === 0) {
        res.status(400).json({
          success: false,
          message: "tiebreaker_priority must be a non-empty array",
        });
        return;
      }

      const validTiebreakers = ["bench_points", "season_points_for", "h2h_record", "higher_seed", "manual"];
      for (const method of tiebreaker_priority) {
        if (!validTiebreakers.includes(method)) {
          res.status(400).json({
            success: false,
            message: `Invalid tiebreaker method: ${method}. Valid methods are: ${validTiebreakers.join(", ")}`,
          });
          return;
        }
      }
    }

    // Create or update settings
    const updatedSettings = await createOrUpdatePlayoffSettings(parseInt(leagueId), {
      playoff_teams,
      playoff_week_start,
      playoff_week_end,
      matchup_duration,
      include_consolation_bracket,
      reseed_rounds,
      tiebreaker_priority,
    });

    res.status(200).json({
      success: true,
      data: updatedSettings,
      message: "Playoff settings updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating playoff settings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating playoff settings",
    });
  }
}

/**
 * POST /api/playoffs/league/:leagueId/generate
 * Generate playoff bracket (commissioner only)
 */
export async function generatePlayoffBracketHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season is required",
      });
      return;
    }

    // Verify commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can generate playoff brackets",
      });
      return;
    }

    // Get playoff settings
    const playoffSettings = await getPlayoffSettings(parseInt(leagueId));
    if (!playoffSettings) {
      res.status(400).json({
        success: false,
        message: "Playoff settings must be configured before generating bracket",
      });
      return;
    }

    // Generate playoff bracket
    await generatePlayoffBracket(parseInt(leagueId), season);

    res.status(201).json({
      success: true,
      message: "Playoff bracket generated successfully",
    });
  } catch (error: any) {
    console.error("Error generating playoff bracket:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating playoff bracket",
    });
  }
}

/**
 * GET /api/playoffs/league/:leagueId/bracket
 * Get playoff bracket matchups
 */
export async function getPlayoffBracketHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season } = req.query;

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season parameter is required",
      });
      return;
    }

    // Query all playoff matchups for league
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
        AND m.is_playoff = TRUE
      ORDER BY m.week, m.playoff_round, m.bracket_position
    `;

    const result = await pool.query(query, [parseInt(leagueId), season]);

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("Error getting playoff bracket:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting playoff bracket",
    });
  }
}

/**
 * GET /api/playoffs/league/:leagueId/standings
 * Get playoff seedings/standings
 */
export async function getPlayoffStandingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId } = req.params;
    const { season } = req.query;

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!season) {
      res.status(400).json({
        success: false,
        message: "Season parameter is required",
      });
      return;
    }

    // Calculate standings with playoff seeds
    const standings = await calculateStandings(parseInt(leagueId));

    res.status(200).json({
      success: true,
      data: standings,
    });
  } catch (error: any) {
    console.error("Error getting playoff standings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting playoff standings",
    });
  }
}

/**
 * POST /api/playoffs/league/:leagueId/advance/:round
 * Manually advance winners from a round (commissioner only)
 */
export async function advancePlayoffRoundHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leagueId, round } = req.params;
    const { season } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!leagueId || isNaN(parseInt(leagueId))) {
      res.status(400).json({
        success: false,
        message: "Invalid league ID",
      });
      return;
    }

    if (!round || !season) {
      res.status(400).json({
        success: false,
        message: "Round and season are required",
      });
      return;
    }

    // Validate round is a valid PlayoffRound
    const validRounds: PlayoffRound[] = ["wildcard", "quarterfinal", "semifinal", "final", "third_place"];
    if (!validRounds.includes(round as PlayoffRound)) {
      res.status(400).json({
        success: false,
        message: `Invalid round. Valid rounds are: ${validRounds.join(", ")}`,
      });
      return;
    }

    // Verify commissioner
    const league = await getLeagueById(parseInt(leagueId));
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can advance playoff rounds",
      });
      return;
    }

    // Check if round is complete
    const isComplete = await isPlayoffRoundComplete(parseInt(leagueId), round as PlayoffRound, season);
    if (!isComplete) {
      res.status(400).json({
        success: false,
        message: "Round is not complete yet",
      });
      return;
    }

    // Advance playoff winners to next round
    await advancePlayoffWinners(parseInt(leagueId), round as PlayoffRound, season);

    res.status(200).json({
      success: true,
      message: `Successfully advanced winners from ${round}`,
    });
  } catch (error: any) {
    console.error("Error advancing playoff round:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error advancing playoff round",
    });
  }
}

/**
 * POST /api/playoffs/matchups/:matchupId/pick-winner
 * Manually select winner for tied matchup (commissioner only)
 */
export async function pickManualWinnerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { matchupId } = req.params;
    const { winnerId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!matchupId || isNaN(parseInt(matchupId))) {
      res.status(400).json({
        success: false,
        message: "Invalid matchup ID",
      });
      return;
    }

    if (!winnerId || isNaN(parseInt(winnerId))) {
      res.status(400).json({
        success: false,
        message: "Winner roster ID is required",
      });
      return;
    }

    // Get matchup details
    const matchupQuery = `
      SELECT m.*, l.settings
      FROM matchups m
      JOIN leagues l ON m.league_id = l.id
      WHERE m.id = $1
    `;
    const matchupResult = await pool.query(matchupQuery, [parseInt(matchupId)]);

    if (matchupResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Matchup not found",
      });
      return;
    }

    const matchup = matchupResult.rows[0];
    const leagueSettings = matchup.settings;

    // Verify commissioner
    const commissionerId = leagueSettings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can manually select winners",
      });
      return;
    }

    // Verify matchup is tied
    if (matchup.roster1_score !== matchup.roster2_score) {
      res.status(400).json({
        success: false,
        message: "Can only manually select winner for tied matchups",
      });
      return;
    }

    // Verify winnerId is valid (must be one of the two rosters)
    const winnerRosterId = parseInt(winnerId);
    if (winnerRosterId !== matchup.roster1_id && winnerRosterId !== matchup.roster2_id) {
      res.status(400).json({
        success: false,
        message: "Winner must be one of the teams in this matchup",
      });
      return;
    }

    // Update matchup with manual winner
    const updateQuery = `
      UPDATE matchups
      SET
        tiebreaker_used = 'manual',
        tiebreaker_notes = $1,
        manual_winner_selected_by = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const notes = `Manual winner selected: Roster ${winnerRosterId}`;
    const updateResult = await pool.query(updateQuery, [notes, userId, parseInt(matchupId)]);

    res.status(200).json({
      success: true,
      data: updateResult.rows[0],
      message: "Manual winner selected successfully",
    });
  } catch (error: any) {
    console.error("Error picking manual winner:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error picking manual winner",
    });
  }
}
