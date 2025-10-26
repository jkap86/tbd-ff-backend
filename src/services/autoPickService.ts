import { getDraftById, updateDraft, completeDraft } from "../models/Draft";
import { getDraftOrder, getRosterAtPosition } from "../models/DraftOrder";
import { createDraftPick } from "../models/DraftPick";
import { getAvailablePlayersForDraft } from "../models/Player";
import { getLeagueById, updateLeague } from "../models/League";
import { calculateCurrentRoster } from "../controllers/draftController";
import { emitDraftPick, emitDraftStatusChange } from "../socket/draftSocket";
import { io } from "../index";

// Map to track active timers for each draft
const activeTimers: Map<number, NodeJS.Timeout> = new Map();

/**
 * Start monitoring a draft for auto-picks
 */
export function startAutoPickMonitoring(draftId: number): void {
  // Clear existing timer if any
  stopAutoPickMonitoring(draftId);

  // Check every second for expired picks
  const timer = setInterval(async () => {
    await checkAndAutoPickIfNeeded(draftId);
  }, 1000);

  activeTimers.set(draftId, timer);
  console.log(`[AutoPick] Started monitoring draft ${draftId}`);
}

/**
 * Stop monitoring a draft
 */
export function stopAutoPickMonitoring(draftId: number): void {
  const timer = activeTimers.get(draftId);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(draftId);
    console.log(`[AutoPick] Stopped monitoring draft ${draftId}`);
  }
}

/**
 * Check if current pick has expired and auto-pick if needed
 */
async function checkAndAutoPickIfNeeded(draftId: number): Promise<void> {
  try {
    const draft = await getDraftById(draftId);

    // Only auto-pick for drafts in progress
    if (!draft || draft.status !== "in_progress") {
      stopAutoPickMonitoring(draftId);
      return;
    }

    // Check if pick deadline has passed
    if (!draft.pick_deadline) {
      return;
    }

    const now = new Date();
    const deadline = new Date(draft.pick_deadline);

    if (now >= deadline) {
      console.log(
        `[AutoPick] Pick deadline expired for draft ${draftId}, pick ${draft.current_pick}`
      );
      await performAutoPick(draftId, draft);
    }
  } catch (error) {
    console.error(`[AutoPick] Error checking draft ${draftId}:`, error);
  }
}

/**
 * Perform an automatic pick for the current roster
 */
async function performAutoPick(draftId: number, draft: any): Promise<void> {
  try {
    const rosterId = draft.current_roster_id;
    if (!rosterId) {
      console.error(`[AutoPick] No current roster for draft ${draftId}`);
      return;
    }

    // Get the best available player
    const player = await selectBestAvailablePlayer(draftId, rosterId);

    if (!player) {
      console.error(`[AutoPick] No available players for draft ${draftId}`);
      return;
    }

    console.log(
      `[AutoPick] Auto-picking player ${player.id} (${player.full_name}) for roster ${rosterId}`
    );
    console.log(`[AutoPick] Player details:`, {
      id: player.id,
      full_name: player.full_name,
      position: player.position,
      team: player.team,
    });

    // Get league and draft order for calculations
    const league = await getLeagueById(draft.league_id);
    const draftOrder = await getDraftOrder(draftId);
    const totalRosters = league?.total_rosters || draftOrder.length;

    const { round, pickInRound } = calculateCurrentRoster(
      draft.current_pick,
      totalRosters,
      draft.draft_type,
      draft.third_round_reversal
    );

    // Create the auto-pick
    const pick = await createDraftPick({
      draft_id: draftId,
      pick_number: draft.current_pick,
      round,
      pick_in_round: pickInRound,
      roster_id: rosterId,
      player_id: player.id,
      is_auto_pick: true,
      pick_time_seconds: 0, // Time expired
    });

    console.log(`[AutoPick] Created pick:`, pick);

    // Calculate next pick
    const nextPickNumber = draft.current_pick + 1;
    const totalPicks = totalRosters * draft.rounds;

    let updatedDraft;

    if (nextPickNumber > totalPicks) {
      // Draft is complete
      console.log(`[AutoPick] Draft ${draftId} is complete! Total picks: ${totalPicks}`);
      updatedDraft = await completeDraft(draftId);

      // Update league status to 'in_season'
      if (league) {
        await updateLeague(league.id, { status: "in_season" });
        console.log(`[AutoPick] League ${league.id} status updated to in_season`);
      }

      stopAutoPickMonitoring(draftId);

      // Emit status change to notify clients that draft is complete
      emitDraftStatusChange(io, draftId, "completed", updatedDraft);
    } else {
      // Move to next pick
      const nextPickInfo = calculateCurrentRoster(
        nextPickNumber,
        totalRosters,
        draft.draft_type,
        draft.third_round_reversal
      );

      const nextRosterId = await getRosterAtPosition(
        draftId,
        nextPickInfo.draftPosition
      );

      if (!nextRosterId) {
        console.error(
          `[AutoPick] Could not find roster at position ${nextPickInfo.draftPosition}`
        );
        return;
      }

      // Calculate new pick deadline
      const pickDeadline = new Date();
      pickDeadline.setSeconds(
        pickDeadline.getSeconds() + draft.pick_time_seconds
      );

      updatedDraft = await updateDraft(draftId, {
        current_pick: nextPickNumber,
        current_round: nextPickInfo.round,
        current_roster_id: nextRosterId,
        pick_deadline: pickDeadline,
      });
    }

    // Get roster and user details for WebSocket emission
    const { getRosterById } = await import("../models/Roster");
    const roster = await getRosterById(rosterId);
    const { getUserById } = await import("../models/User");
    const user = roster?.user_id ? await getUserById(roster.user_id) : null;

    // Emit socket event for the auto-pick
    const pickWithDetails = {
      ...pick,
      player_name: player.full_name,
      player_position: player.position,
      player_team: player.team,
      roster_number: roster?.roster_id,
      picked_by_username: user?.username,
    };
    console.log(`[AutoPick] Emitting pick with details:`, pickWithDetails);
    emitDraftPick(io, draftId, pickWithDetails, updatedDraft);

    // Emit auto-pick notification
    io.to(`draft_${draftId}`).emit("auto_pick_made", {
      draftId,
      pickNumber: draft.current_pick,
      rosterId,
      playerId: player.id,
      playerName: player.name,
      playerPosition: player.position,
      round,
      pickInRound,
    });

    console.log(
      `[AutoPick] Successfully auto-picked ${player.name} for roster ${rosterId}`
    );
  } catch (error) {
    console.error(`[AutoPick] Error performing auto-pick:`, error);
  }
}

/**
 * Select the best available player based on ADP and roster needs
 */
async function selectBestAvailablePlayer(
  draftId: number,
  _rosterId: number
): Promise<any | null> {
  try {
    // Get available players sorted by search_rank (best available by default)
    const allAvailablePlayers = await getAvailablePlayersForDraft(draftId);

    if (allAvailablePlayers.length === 0) {
      return null;
    }

    // Limit to top 100 for performance
    const availablePlayers = allAvailablePlayers.slice(0, 100);

    // TODO: Future enhancement - analyze roster needs
    // const allPicks = await getDraftPicks(draftId);
    // const rosterPicks = allPicks.filter((pick) => pick.roster_id === rosterId);
    // Count positions already drafted and pick based on needs

    // Simple strategy: Pick best available by position priority
    // Priority order: QB, RB, WR, TE, FLEX positions first
    const positionPriority = ["QB", "RB", "WR", "TE", "K", "DEF"];

    // Try to find best player following position priority
    for (const position of positionPriority) {
      const playerOfPosition = availablePlayers.find(
        (p) => p.position === position
      );
      if (playerOfPosition) {
        return playerOfPosition;
      }
    }

    // If no priority position found, just take best available
    return availablePlayers[0];
  } catch (error) {
    console.error(`[AutoPick] Error selecting best player:`, error);
    return null;
  }
}

/**
 * Stop all auto-pick monitoring (cleanup on server shutdown)
 */
export function stopAllAutoPickMonitoring(): void {
  for (const [draftId, timer] of activeTimers.entries()) {
    clearInterval(timer);
    console.log(`[AutoPick] Stopped monitoring draft ${draftId}`);
  }
  activeTimers.clear();
}
