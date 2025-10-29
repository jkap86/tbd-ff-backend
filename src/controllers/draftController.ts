import { Request, Response } from "express";
import {
  Draft,
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraft,
  pauseDraft,
  completeDraft,
  resetDraft,
} from "../models/Draft";
import { io } from "../index";
import {
  emitDraftPick,
  emitDraftStatusChange,
  emitDraftOrderUpdate,
} from "../socket/draftSocket";
import {
  setDraftOrder,
  getDraftOrder,
  getDraftOrderWithDetails,
  randomizeDraftOrder,
  getRosterAtPosition,
} from "../models/DraftOrder";
import {
  createDraftPick,
  getDraftPicks,
  getDraftPicksWithDetails,
  isPlayerDrafted,
} from "../models/DraftPick";
import { getAvailablePlayersForDraft } from "../models/Player";
import { getRostersByLeagueId, getRosterById } from "../models/Roster";
import { getLeagueById, updateLeague } from "../models/League";
import {
  startAutoPickMonitoring,
  stopAutoPickMonitoring,
} from "../services/autoPickService";
import { checkAndAutoPauseDraft } from "../services/draftScheduler";

/**
 * Calculate which roster should be picking based on current pick number
 * Handles snake, linear, and 3rd round reversal logic
 */
export function calculateCurrentRoster(
  pickNumber: number,
  totalRosters: number,
  draftType: "snake" | "linear" | "auction" | "slow_auction",
  thirdRoundReversal: boolean
): { round: number; pickInRound: number; draftPosition: number} {
  // Auction drafts don't use traditional pick order
  if (draftType === "auction" || draftType === "slow_auction") {
    return { round: 1, pickInRound: 1, draftPosition: 1 };
  }
  const round = Math.ceil(pickNumber / totalRosters);
  const pickInRound = ((pickNumber - 1) % totalRosters) + 1;

  let draftPosition: number;

  if (draftType === "linear") {
    // Linear: same order every round
    draftPosition = pickInRound;
  } else {
    // Snake draft logic
    let isReversed: boolean;

    if (thirdRoundReversal && round === 3) {
      // Round 3 with reversal: goes forward (not reversed)
      isReversed = false;
    } else if (thirdRoundReversal && round > 3) {
      // After round 3 with reversal: adjust the pattern
      // Round 4 should be reversed, Round 5 forward, etc.
      isReversed = round % 2 === 0;
    } else {
      // Normal snake: odd rounds forward, even rounds reversed
      isReversed = round % 2 === 0;
    }

    draftPosition = isReversed ? totalRosters - pickInRound + 1 : pickInRound;
  }

  return { round, pickInRound, draftPosition };
}

/**
 * Create a new draft for a league
 * POST /api/drafts/create
 */
export async function createDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      league_id,
      draft_type = "snake",
      third_round_reversal = false,
      pick_time_seconds = 90,
      rounds = 15,
      timer_mode = "traditional",
      team_time_budget_seconds,
      settings = {},
    } = req.body;

    // Validate required fields
    if (!league_id) {
      res.status(400).json({
        success: false,
        message: "League ID is required",
      });
      return;
    }

    // Validate draft type
    if (!["snake", "linear"].includes(draft_type)) {
      res.status(400).json({
        success: false,
        message: "Draft type must be 'snake' or 'linear'",
      });
      return;
    }

    // Validate timer mode
    if (!["traditional", "chess"].includes(timer_mode)) {
      res.status(400).json({
        success: false,
        message: "Timer mode must be 'traditional' or 'chess'",
      });
      return;
    }

    // Validate chess timer requirements
    if (timer_mode === "chess") {
      if (!team_time_budget_seconds || team_time_budget_seconds <= 0) {
        res.status(400).json({
          success: false,
          message: "Chess timer mode requires a positive team_time_budget_seconds value",
        });
        return;
      }
    }

    // Check if league exists
    const league = await getLeagueById(league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if draft already exists for this league
    const existingDraft = await getDraftByLeagueId(league_id);
    if (existingDraft) {
      res.status(400).json({
        success: false,
        message: "Draft already exists for this league",
      });
      return;
    }

    // Create the draft
    const draft = await createDraft({
      league_id,
      draft_type,
      third_round_reversal,
      pick_time_seconds,
      rounds,
      timer_mode,
      team_time_budget_seconds,
      settings,
    });

    res.status(201).json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    console.error("Error creating draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating draft",
    });
  }
}

/**
 * Get draft by ID
 * GET /api/drafts/:draftId
 */
export async function getDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    console.error("Error getting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft",
    });
  }
}

/**
 * Update draft settings
 * PUT /api/drafts/:draftId/settings
 */
export async function updateDraftSettingsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { draft_type, third_round_reversal, pick_time_seconds, rounds, timer_mode, team_time_budget_seconds, settings } = req.body;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Only allow core draft settings updates if draft hasn't started
    // But allow settings (like overnight pause) to be updated anytime
    const isCoreSettingsUpdate = draft_type || typeof third_round_reversal === 'boolean' || pick_time_seconds || rounds || timer_mode || team_time_budget_seconds;
    if (isCoreSettingsUpdate && draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Cannot update draft type, rounds, or timer settings after draft has started",
      });
      return;
    }

    // Validate timer mode if provided
    if (timer_mode && !["traditional", "chess"].includes(timer_mode)) {
      res.status(400).json({
        success: false,
        message: "Timer mode must be 'traditional' or 'chess'",
      });
      return;
    }

    // Validate chess timer requirements
    const finalTimerMode = timer_mode || draft.timer_mode;
    const finalTimeBudget = team_time_budget_seconds !== undefined ? team_time_budget_seconds : draft.team_time_budget_seconds;

    if (finalTimerMode === "chess" && (!finalTimeBudget || finalTimeBudget <= 0)) {
      res.status(400).json({
        success: false,
        message: "Chess timer mode requires a positive team_time_budget_seconds value",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
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
        message: "Only the commissioner can update draft settings",
      });
      return;
    }

    // Update draft settings
    const updates: Partial<Draft> = {};
    if (draft_type) updates.draft_type = draft_type;
    if (typeof third_round_reversal === 'boolean') updates.third_round_reversal = third_round_reversal;
    if (pick_time_seconds) updates.pick_time_seconds = pick_time_seconds;
    if (rounds) updates.rounds = rounds;
    if (timer_mode) updates.timer_mode = timer_mode;
    if (team_time_budget_seconds !== undefined) updates.team_time_budget_seconds = team_time_budget_seconds;
    if (settings) updates.settings = settings;

    const updatedDraft = await updateDraft(parseInt(draftId), updates);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error updating draft settings:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating draft settings",
    });
  }
}

/**
 * Get draft by league ID
 * GET /api/leagues/:leagueId/draft
 */
export async function getDraftByLeagueHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { leagueId } = req.params;

    const draft = await getDraftByLeagueId(parseInt(leagueId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found for this league",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: draft,
    });
  } catch (error: any) {
    console.error("Error getting draft by league:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft by league",
    });
  }
}

/**
 * Set draft order (manual or randomized)
 * POST /api/drafts/:draftId/order
 */
export async function setDraftOrderHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { randomize, order } = req.body;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get commissioner ID from league settings
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can set draft order",
      });
      return;
    }

    // Don't allow changing order after draft has started
    if (draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Cannot change draft order after draft has started",
      });
      return;
    }

    if (randomize) {
      // Get all rosters for the league
      const rosters = await getRostersByLeagueId(draft.league_id);
      const rosterIds = rosters.map((r) => r.id);

      await randomizeDraftOrder(parseInt(draftId), rosterIds);
    } else if (order && Array.isArray(order)) {
      // Manual order: validate format
      if (
        !order.every(
          (item) =>
            item.roster_id && item.draft_position && typeof item.roster_id === "number" && typeof item.draft_position === "number"
        )
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid order format. Each item must have roster_id and draft_position",
        });
        return;
      }

      await setDraftOrder(parseInt(draftId), order);
    } else {
      res.status(400).json({
        success: false,
        message: "Must provide either randomize=true or order array",
      });
      return;
    }

    // Get detailed draft order with team names and usernames
    const detailedDraftOrder = await getDraftOrderWithDetails(parseInt(draftId));

    // Emit draft order update via WebSocket
    emitDraftOrderUpdate(io, parseInt(draftId), detailedDraftOrder);

    // Return detailed draft order in HTTP response
    res.status(200).json({
      success: true,
      data: detailedDraftOrder,
    });
  } catch (error: any) {
    console.error("Error setting draft order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error setting draft order",
    });
  }
}

/**
 * Get draft order
 * GET /api/drafts/:draftId/order
 */
export async function getDraftOrderHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draftOrder = await getDraftOrderWithDetails(parseInt(draftId));

    res.status(200).json({
      success: true,
      data: draftOrder,
    });
  } catch (error: any) {
    console.error("Error getting draft order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft order",
    });
  }
}

/**
 * Start a draft
 * POST /api/drafts/:draftId/start
 */
export async function startDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if draft order is set
    const draftOrder = await getDraftOrder(parseInt(draftId));
    if (draftOrder.length === 0) {
      res.status(400).json({
        success: false,
        message: "Draft order must be set before starting",
      });
      return;
    }

    // Check if already started
    if (draft.status !== "not_started") {
      res.status(400).json({
        success: false,
        message: "Draft has already started",
      });
      return;
    }

    // Calculate first roster to pick
    const league = await getLeagueById(draft.league_id);
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { draftPosition } = calculateCurrentRoster(
      1,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    const firstRosterId = await getRosterAtPosition(
      parseInt(draftId),
      draftPosition
    );

    // Set pick deadline
    const pickDeadline = new Date();
    pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

    // Start the draft
    const updatedDraft = await updateDraft(parseInt(draftId), {
      status: "in_progress",
      started_at: new Date(),
      current_pick: 1,
      current_round: 1,
      current_roster_id: firstRosterId!,
      pick_deadline: pickDeadline,
    });

    // Update league status to 'drafting'
    if (league) {
      await updateLeague(league.id, { status: "drafting" });
    }

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

    // Start auto-pick monitoring
    startAutoPickMonitoring(parseInt(draftId));

    // Check if draft should be immediately auto-paused for overnight
    await checkAndAutoPauseDraft(parseInt(draftId));

    // Get the latest draft state (may have been auto-paused)
    const finalDraft = await getDraftById(parseInt(draftId));

    res.status(200).json({
      success: true,
      data: finalDraft,
    });
  } catch (error: any) {
    console.error("Error starting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error starting draft",
    });
  }
}

/**
 * Make a draft pick
 * POST /api/drafts/:draftId/pick
 */
export async function makeDraftPickHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { roster_id, player_id, is_auto_pick = false } = req.body;

    if (!roster_id || !player_id) {
      res.status(400).json({
        success: false,
        message: "roster_id and player_id are required",
      });
      return;
    }

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if draft is in progress
    if (draft.status !== "in_progress") {
      res.status(400).json({
        success: false,
        message: "Draft is not in progress",
      });
      return;
    }

    // Check if it's this roster's turn
    if (draft.current_roster_id !== roster_id) {
      res.status(400).json({
        success: false,
        message: "It is not this roster's turn to pick",
      });
      return;
    }

    // Verify that the user making the pick owns the roster (unless it's an auto-pick)
    if (!is_auto_pick) {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
        return;
      }

      const roster = await getRosterById(roster_id);
      if (!roster) {
        res.status(404).json({
          success: false,
          message: "Roster not found",
        });
        return;
      }

      if (roster.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only make picks for your own roster",
        });
        return;
      }
    }

    // Check if player is already drafted
    const alreadyDrafted = await isPlayerDrafted(
      parseInt(draftId),
      player_id
    );
    if (alreadyDrafted) {
      res.status(400).json({
        success: false,
        message: "Player has already been drafted",
      });
      return;
    }

    // Calculate pick time
    const pickTimeSeconds = draft.pick_deadline
      ? Math.max(
          0,
          draft.pick_time_seconds -
            Math.floor(
              (new Date().getTime() - new Date(draft.pick_deadline).getTime()) /
                1000
            ) +
            draft.pick_time_seconds
        )
      : null;

    // Create the pick
    const league = await getLeagueById(draft.league_id);
    const draftOrder = await getDraftOrder(parseInt(draftId));
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { round, pickInRound } = calculateCurrentRoster(
      draft.current_pick,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    const pick = await createDraftPick({
      draft_id: parseInt(draftId),
      pick_number: draft.current_pick,
      round,
      pick_in_round: pickInRound,
      roster_id,
      player_id,
      is_auto_pick,
      pick_time_seconds: pickTimeSeconds ?? undefined,
    });

    // Calculate next pick
    const nextPickNumber = draft.current_pick + 1;
    const totalPicks = totalRosters * draft.rounds;

    console.log(`Pick calculation - Current pick: ${draft.current_pick}, Next pick: ${nextPickNumber}, Total rosters: ${totalRosters}, Rounds: ${draft.rounds}, Total picks: ${totalPicks}`);

    let updatedDraft;

    if (nextPickNumber > totalPicks) {
      // Draft is complete
      console.log(`Draft ${draftId} is complete! Total picks: ${totalPicks}`);
      updatedDraft = await completeDraft(parseInt(draftId));

      // Assign drafted players to rosters
      const { assignDraftedPlayersToRosters } = await import("../models/Draft");
      await assignDraftedPlayersToRosters(parseInt(draftId));

      // Update league status to 'in_season'
      const league = await getLeagueById(draft.league_id);
      console.log(`League before update:`, league ? `ID ${league.id}, Status: ${league.status}` : 'not found');
      if (league) {
        const updatedLeague = await updateLeague(league.id, { status: "in_season" });
        console.log(`League after update:`, updatedLeague ? `ID ${updatedLeague.id}, Status: ${updatedLeague.status}` : 'update failed');

        const startWeek = league.settings?.start_week || 1;
        const playoffWeekStart = league.settings?.playoff_week_start || 15;

        // Generate matchups if they don't exist (e.g., after league reset)
        console.log(`[DraftComplete] Checking/generating matchups...`);
        const { generateMatchupsForWeek } = await import("../models/Matchup");
        const { getMatchupsByLeagueAndWeek } = await import("../models/Matchup");

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            const existingMatchups = await getMatchupsByLeagueAndWeek(league.id, week);
            if (existingMatchups.length === 0) {
              console.log(`[DraftComplete] Generating matchups for week ${week}...`);
              await generateMatchupsForWeek(league.id, week, league.season);
            }
          } catch (error) {
            console.error(`[DraftComplete] Failed to generate matchups for week ${week}:`, error);
          }
        }

        // Calculate scores for all weeks that have already occurred
        console.log(`[DraftComplete] Calculating scores for all weeks...`);
        const { updateMatchupScoresForWeek } = await import("../services/scoringService");
        const { finalizeWeekScores, recalculateAllRecords } = await import("../services/recordService");

        for (let week = startWeek; week < playoffWeekStart; week++) {
          try {
            console.log(`[DraftComplete] Updating scores for week ${week}...`);
            await updateMatchupScoresForWeek(league.id, week, league.season, "regular");
            await finalizeWeekScores(league.id, week, league.season, "regular");
          } catch (error) {
            console.error(`[DraftComplete] Failed to update scores for week ${week}:`, error);
          }
        }

        // Recalculate all records to ensure they're correct after score updates
        console.log(`[DraftComplete] Recalculating all records...`);
        try {
          await recalculateAllRecords(league.id, league.season);
        } catch (error) {
          console.error(`[DraftComplete] Failed to recalculate records:`, error);
        }
      }

      // Stop auto-pick monitoring
      stopAutoPickMonitoring(parseInt(draftId));

      // Emit status change to notify clients that draft is complete
      console.log(`Emitting draft completion status for draft ${draftId}`);
      emitDraftStatusChange(io, parseInt(draftId), "completed", updatedDraft);
    } else {
      // Advance to next pick
      const nextPickInfo = calculateCurrentRoster(
        nextPickNumber,
        totalRosters,
        draft.draft_type,
        draft.third_round_reversal
      );

      const nextRosterId = await getRosterAtPosition(
        parseInt(draftId),
        nextPickInfo.draftPosition
      );

      const nextPickDeadline = new Date();
      nextPickDeadline.setSeconds(
        nextPickDeadline.getSeconds() + draft.pick_time_seconds
      );

      updatedDraft = await updateDraft(parseInt(draftId), {
        current_pick: nextPickNumber,
        current_round: nextPickInfo.round,
        current_roster_id: nextRosterId!,
        pick_deadline: nextPickDeadline,
      });
    }

    // Get player details and roster info for WebSocket emission
    const { getPlayerById } = await import("../models/Player");
    const player = await getPlayerById(player_id);
    const roster = await getRosterById(roster_id);
    const { getUserById } = await import("../models/User");
    const user = roster?.user_id ? await getUserById(roster.user_id) : null;

    console.log(`[MakePick] Player details:`, {
      id: player?.id,
      full_name: player?.full_name,
      position: player?.position,
      team: player?.team,
    });
    console.log(`[MakePick] Roster details:`, {
      id: roster?.id,
      roster_id: roster?.roster_id,
      user_id: roster?.user_id,
    });
    console.log(`[MakePick] User details:`, { username: user?.username });

    // Emit draft pick via WebSocket with player details
    const pickWithDetails = {
      ...pick,
      player_name: player?.full_name,
      player_position: player?.position,
      player_team: player?.team,
      roster_number: roster?.roster_id,
      picked_by_username: user?.username,
    };
    console.log(`[MakePick] Emitting pick with details:`, pickWithDetails);
    emitDraftPick(io, parseInt(draftId), pickWithDetails, updatedDraft);

    res.status(201).json({
      success: true,
      data: {
        pick,
        draft: updatedDraft,
      },
    });
  } catch (error: any) {
    console.error("Error making draft pick:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error making draft pick",
    });
  }
}

/**
 * Get all picks for a draft
 * GET /api/drafts/:draftId/picks
 */
export async function getDraftPicksHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { withDetails } = req.query;

    let picks;
    if (withDetails === "true") {
      picks = await getDraftPicksWithDetails(parseInt(draftId));
    } else {
      picks = await getDraftPicks(parseInt(draftId));
    }

    res.status(200).json({
      success: true,
      data: picks,
    });
  } catch (error: any) {
    console.error("Error getting draft picks:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting draft picks",
    });
  }
}

/**
 * Get available players for a draft
 * GET /api/drafts/:draftId/players/available
 */
export async function getAvailablePlayersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;
    const { position, team, search } = req.query;

    const players = await getAvailablePlayersForDraft(parseInt(draftId), {
      position: position as string,
      team: team as string,
      search: search as string,
    });

    res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error: any) {
    console.error("Error getting available players:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting available players",
    });
  }
}

/**
 * Pause draft
 * POST /api/drafts/:draftId/pause
 */
export async function pauseDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
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
        message: "Only the commissioner can pause the draft",
      });
      return;
    }

    if (draft.status !== "in_progress") {
      res.status(400).json({
        success: false,
        message: "Draft is not in progress",
      });
      return;
    }

    const updatedDraft = await pauseDraft(parseInt(draftId));

    // Stop auto-pick monitoring when paused
    stopAutoPickMonitoring(parseInt(draftId));

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "paused", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error pausing draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error pausing draft",
    });
  }
}

/**
 * Resume draft
 * POST /api/drafts/:draftId/resume
 */
export async function resumeDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
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
        message: "Only the commissioner can resume the draft",
      });
      return;
    }

    if (draft.status !== "paused") {
      res.status(400).json({
        success: false,
        message: "Draft is not paused",
      });
      return;
    }

    // Reset pick deadline
    const pickDeadline = new Date();
    pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

    const updatedDraft = await updateDraft(parseInt(draftId), {
      status: "in_progress",
      pick_deadline: pickDeadline,
    });

    // Restart auto-pick monitoring when resumed
    startAutoPickMonitoring(parseInt(draftId));

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error resuming draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resuming draft",
    });
  }
}

/**
 * Manually trigger roster assignment from draft picks
 * POST /api/drafts/:draftId/assign-rosters
 */
export async function assignRostersHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    console.log(`[AssignRostersHandler] Manually triggering roster assignment for draft ${draftId}`);

    const { assignDraftedPlayersToRosters } = await import("../models/Draft");
    await assignDraftedPlayersToRosters(parseInt(draftId));

    console.log(`[AssignRostersHandler] Roster assignment completed successfully`);

    res.status(200).json({
      success: true,
      message: "Rosters assigned successfully",
    });
  } catch (error: any) {
    console.error("Error assigning rosters:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error assigning rosters",
    });
  }
}

/**
 * Reset draft - clears all picks and resets to not_started
 * POST /api/drafts/:draftId/reset
 */
export async function resetDraftHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const league = await getLeagueById(draft.league_id);
    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Get commissioner ID from league settings
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only the commissioner can reset the draft",
      });
      return;
    }

    // Stop auto-pick monitoring
    stopAutoPickMonitoring(parseInt(draftId));

    // Reset the draft
    const updatedDraft = await resetDraft(parseInt(draftId));

    // Emit draft status change via WebSocket
    emitDraftStatusChange(io, parseInt(draftId), "not_started", updatedDraft);

    res.status(200).json({
      success: true,
      data: updatedDraft,
    });
  } catch (error: any) {
    console.error("Error resetting draft:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resetting draft",
    });
  }
}
