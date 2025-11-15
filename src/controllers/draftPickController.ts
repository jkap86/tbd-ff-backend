import { Request, Response } from "express";
import { BaseController } from "./BaseController";
import { eventBus } from "../index";
import {
  emitDraftPick,
  emitDraftStatusChange,
  stopTimerBroadcast,
} from "../socket/draftSocket";
import {
  getDraftOrder,
  getRosterAtPosition,
} from "../models/DraftOrder";
import {
  getDraftPicks,
  getDraftPicksWithDetails,
} from "../models/DraftPick";
import { getAvailablePlayersForDraft } from "../models/Player";
import { getRosterById } from "../models/Roster";
import { getLeagueById, updateLeague } from "../models/League";
import {
  stopAutoPickMonitoring,
} from "../services/autoPickService";
import { calculateADP } from "../services/adpService";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import { calculateCurrentRoster } from "../utils/draftCalculations";
import { logger } from "../utils/logger";

class DraftPickController extends BaseController {
  /**
   * Make a draft pick
   * POST /api/drafts/:draftId/pick
   */
  makeDraftPickHandler = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const pool = (await import("../config/database")).default;
    const client = await pool.connect();
    await setTransactionTimeouts(client);

    try {
      await client.query('BEGIN');

      const { draftId } = req.params;
      const { roster_id, player_id, is_auto_pick = false } = req.body;
      logger.info('[MakePick] Request started', { draftId, roster_id, player_id });


      if (!roster_id || !player_id) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: "roster_id and player_id are required",
        });
        return;
      }

      // Lock the draft row to prevent concurrent picks
      logger.info('[MakePick] Locking draft for update', { draftId });
      const draftResult = await client.query(
        'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId]
      );

      if (draftResult.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.warn('[MakePick] Draft not found', { draftId });
        res.status(404).json({
          success: false,
          message: "Draft not found",
        });
        return;
      }

      const draft = draftResult.rows[0];
      logger.info('[MakePick] Draft locked', { draftId, status: draft.status });

      // Check if draft is in progress or paused (picks allowed when paused)
      if (draft.status !== "in_progress" && draft.status !== "paused") {
        await client.query('ROLLBACK');
        logger.warn('[MakePick] Pick rejected - draft not in progress', {
          draftId,
          status: draft.status,
        });
        res.status(400).json({
          success: false,
          message: `Draft is not in progress (current status: ${draft.status})`,
        });
        return;
      }

      // Check if it's this roster's turn
      if (draft.current_roster_id !== roster_id) {
        await client.query('ROLLBACK');
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
          await client.query('ROLLBACK');
          res.status(401).json({
            success: false,
            message: "User not authenticated",
          });
          return;
        }

        const roster = await getRosterById(roster_id);
        if (!roster) {
          await client.query('ROLLBACK');
          res.status(404).json({
            success: false,
            message: "Roster not found",
          });
          return;
        }

        if (roster.user_id !== userId) {
          await client.query('ROLLBACK');
          res.status(403).json({
            success: false,
            message: "You can only make picks for your own roster",
          });
          return;
        }
      }

      // Check if player is already drafted (prevent double-draft)
      const existingPickResult = await client.query(
        'SELECT id FROM draft_picks WHERE draft_id = $1 AND player_id = $2',
        [draftId, player_id]
      );

      if (existingPickResult.rows.length > 0) {
        await client.query('ROLLBACK');
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

      // Get league and draft order for calculations
      const league = await getLeagueById(draft.league_id);
      const draftOrder = await getDraftOrder(parseInt(draftId));
      const totalRosters = league?.total_rosters || draftOrder.length;

      const { round, pickInRound } = calculateCurrentRoster(
        draft.current_pick,
        totalRosters,
        draft.draft_type,
        draft.third_round_reversal
      );

      // Get player's Sleeper ID for storage in draft_picks
      // draft_picks.player_id stores Sleeper player_id (VARCHAR), not database id (INTEGER)
      const { getPlayerById: fetchPlayer } = await import("../models/Player");
      const playerForPick = await fetchPlayer(player_id);
      if (!playerForPick) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "Player not found",
        });
        return;
      }
      const sleeperPlayerId = playerForPick.player_id;

      // Create the pick using the transaction client
      // Wrap in try-catch to handle unique constraint violations gracefully
      let pickResult;
      try {
        pickResult = await client.query(
          `INSERT INTO draft_picks (
            draft_id, pick_number, round, pick_in_round,
            roster_id, player_id, is_auto_pick, pick_time_seconds, pick_started_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            parseInt(draftId),
            draft.current_pick,
            round,
            pickInRound,
            roster_id,
            sleeperPlayerId,  // Store Sleeper ID, not database ID
            is_auto_pick,
            pickTimeSeconds,
            null
          ]
        );
      } catch (insertError: any) {
        // Check if this is a unique constraint violation on (draft_id, player_id)
        if (insertError.code === '23505' && insertError.constraint?.includes('player_id')) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            message: "This player has already been drafted by another team",
          });
          return;
        }
        // Re-throw other errors
        throw insertError;
      }

      const pick = pickResult.rows[0];

      // Decrement chess timer budget if applicable
      if (draft.timer_mode === 'chess' && pickTimeSeconds !== null) {
        try {
          // Deduct the time used from the roster's remaining time budget
          const updateTimeResult = await client.query(
            `UPDATE draft_order
             SET time_remaining_seconds = GREATEST(0, time_remaining_seconds - $1),
                 time_used_seconds = time_used_seconds + $1
             WHERE draft_id = $2 AND roster_id = $3
             RETURNING time_remaining_seconds, time_used_seconds`,
            [pickTimeSeconds, parseInt(draftId), roster_id]
          );

          if (updateTimeResult.rows.length > 0) {
            const { time_remaining_seconds, time_used_seconds } = updateTimeResult.rows[0];
            logger.info('[Draft] Chess timer updated', {
              roster_id,
              used: pickTimeSeconds,
              remaining: time_remaining_seconds,
              total_used: time_used_seconds,
            });
          } else {
            logger.error('[Draft] Failed to update chess timer - roster not found in draft_order', { roster_id });
          }
        } catch (error) {
          logger.error('[Draft] Failed to update chess timer', { roster_id, error });
          // Don't fail the pick if timer update fails, just log it
        }
      }

      // Calculate next pick
      const nextPickNumber = draft.current_pick + 1;
      const totalPicks = totalRosters * draft.rounds;

      logger.info('Pick calculation', {
        current_pick: draft.current_pick,
        next_pick: nextPickNumber,
        total_rosters: totalRosters,
        rounds: draft.rounds,
        total_picks: totalPicks,
      });

      let updatedDraft;

      if (nextPickNumber > totalPicks) {
        // Draft is complete - use two-phase commit with 'completing' status
        logger.info('[Draft] Draft is complete', { draftId, total_picks: totalPicks });

        // Phase 1: Mark draft as 'completing' within transaction
        const completingDraftResult = await client.query(
          `UPDATE drafts
           SET status = 'completing',
               pick_deadline = NULL,
               current_roster_id = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [draftId]
        );
        updatedDraft = completingDraftResult.rows[0];

        // Commit transaction with 'completing' status
        await client.query('COMMIT');

        // Phase 2: Perform side effects outside transaction
        try {
          // Assign drafted players to rosters
          const { assignDraftedPlayersToRosters } = await import("../models/Draft");
          await assignDraftedPlayersToRosters(parseInt(draftId));
        } catch (error) {
          logger.error('[Draft] Failed to assign players during completion', { draftId, error });

          // Phase 2 Error Handling: Rollback draft status from "completing" to "in_progress"
          try {
            logger.info('[Draft] Rolling back draft status from completing to in_progress', { draftId });
            const rollbackResult = await pool.query(
              `UPDATE drafts
               SET status = 'in_progress',
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING *`,
              [draftId]
            );

            if (rollbackResult.rows.length > 0) {
              const rolledBackDraft = rollbackResult.rows[0];
              logger.info('[Draft] Successfully rolled back draft to in_progress state', { draftId });

              // Notify clients about rollback
              emitDraftStatusChange(eventBus, parseInt(draftId), "in_progress", rolledBackDraft);
            } else {
              logger.error('[Draft] Rollback failed - draft not found', { draftId });
            }
          } catch (rollbackError) {
            logger.error('[Draft] CRITICAL: Rollback failed - draft stuck in completing state', {
              draftId,
              error: rollbackError,
            });
          }

          throw error; // Will be caught by outer catch block
        }

        // Phase 3: Mark draft as fully 'completed' after side effects succeed
        const completedDraftResult = await pool.query(
          `UPDATE drafts
           SET status = 'completed',
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [draftId]
        );
        updatedDraft = completedDraftResult.rows[0];
        logger.info('[Draft] Draft marked as completed after successful player assignment', { draftId });

        // Update league status to 'in_season'
        const league = await getLeagueById(draft.league_id);
        logger.info('[League] Before update', {
          league_id: league?.id,
          status: league?.status,
        });

        if (league) {
          const updatedLeague = await updateLeague(league.id, { status: "in_season" });
          logger.info('[League] After update', {
            league_id: updatedLeague?.id,
            status: updatedLeague?.status,
          });

          // Initialize season: generate matchups and calculate scores
          const { initializeSeasonFromLeague } = await import("../services/draftCompletionService");
          await initializeSeasonFromLeague(league);
        }

        // Stop timer broadcasts
        stopTimerBroadcast(parseInt(draftId));

        // Stop auto-pick monitoring
        stopAutoPickMonitoring(parseInt(draftId));

        // Emit status change to notify clients that draft is complete
        logger.info('[Draft] Emitting draft completion status', { draftId });
        emitDraftStatusChange(eventBus, parseInt(draftId), "completed", updatedDraft);

        // Trigger ADP recalculation (don't await - run in background)
        const season = league?.season || new Date().getFullYear().toString();
        calculateADP(season).catch(err =>
          logger.error('Failed to update ADP after draft', { error: err })
        );
      } else {
        // Advance to next pick
        const nextPickInfo = calculateCurrentRoster(
          nextPickNumber,
          totalRosters,
          draft.draft_type,
          draft.third_round_reversal
        );

        logger.info('[MakePick] Next pick calculation', {
          pick_number: nextPickNumber,
          round: nextPickInfo.round,
          pick_in_round: nextPickInfo.pickInRound,
          draft_position: nextPickInfo.draftPosition,
          total_rosters: totalRosters,
        });

        const nextRosterId = await getRosterAtPosition(
          parseInt(draftId),
          nextPickInfo.draftPosition
        );

        if (!nextRosterId) {
          // Get actual draft_order count to diagnose the issue
          const draftOrderCount = await (await import("../models/DraftOrder")).getDraftOrder(parseInt(draftId));
          const actualRosterCount = draftOrderCount.length;

          logger.error('[MakePick] ERROR: No roster found at draft position', {
            draftId,
            draft_position: nextPickInfo.draftPosition,
            expected_rosters: totalRosters,
            actual_rosters: actualRosterCount,
          });

          await client.query('ROLLBACK');
          res.status(500).json({
            success: false,
            message: `Draft order mismatch: looking for position ${nextPickInfo.draftPosition} but only ${actualRosterCount} teams in draft order (expected ${totalRosters}). League may have been modified after draft creation.`,
          });
          return;
        }

        logger.info('[MakePick] Found roster at position', {
          roster_id: nextRosterId,
          draft_position: nextPickInfo.draftPosition,
        });

        const nextPickDeadline = new Date();
        nextPickDeadline.setSeconds(
          nextPickDeadline.getSeconds() + draft.pick_time_seconds
        );

        // Update draft_order with deadline for next pick
        await client.query(
          `UPDATE draft_order
           SET pick_expiration = $1, pick_number = $2
           WHERE draft_id = $3 AND roster_id = $4`,
          [nextPickDeadline, nextPickNumber, draftId, nextRosterId]
        );

        const updateDraftResult = await client.query(
          `UPDATE drafts
           SET current_pick = $1,
               current_round = $2,
               current_roster_id = $3,
               pick_deadline = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING *`,
          [nextPickNumber, nextPickInfo.round, nextRosterId, nextPickDeadline, draftId]
        );
        updatedDraft = updateDraftResult.rows[0];

        // Commit transaction
        await client.query('COMMIT');
      }

      // Get player details and roster info for WebSocket emission (after successful commit)
      const { getPlayerById } = await import("../models/Player");
      const player = await getPlayerById(player_id);
      const roster = await getRosterById(roster_id);
      const { getUserById } = await import("../models/User");
      const user = roster?.user_id ? await getUserById(roster.user_id) : null;

      logger.info('[MakePick] Player details', {
        id: player?.id,
        full_name: player?.full_name,
        position: player?.position,
        team: player?.team,
      });
      logger.info('[MakePick] Roster details', {
        id: roster?.id,
        roster_id: roster?.roster_id,
        user_id: roster?.user_id,
      });
      logger.info('[MakePick] User details', { username: user?.username });

      // DEBUG: Log the raw pick object from database
      logger.debug('[MakePick] Raw pick from DB', {
        id: pick.id,
        player_id: pick.player_id,
        player_id_type: typeof pick.player_id,
        roster_id: pick.roster_id,
      });

      // Emit draft pick via WebSocket with player details and next deadline
      // NOTE: pick.player_id from database is Sleeper ID (VARCHAR)
      // Flutter needs database player ID (INTEGER) for matching in available players list
      const pickWithDetails = {
        ...pick,
        player_id: player_id,  // Use database ID for Flutter, not Sleeper ID from DB
        sleeper_player_id: pick.player_id,  // Include Sleeper ID for reference
        player_name: player?.full_name,
        player_position: player?.position,
        player_team: player?.team,
        roster_number: roster?.roster_id,
        picked_by_username: user?.username,
      };
      logger.info('[MakePick] Emitting pick with details', pickWithDetails);
      logger.debug('[MakePick] pickWithDetails.player_id', {
        value: pickWithDetails.player_id,
        type: typeof pickWithDetails.player_id,
      });

      // Include next deadline if draft continues
      if (updatedDraft.status === "in_progress" && updatedDraft.pick_deadline) {
        eventBus.emitToRoom(`draft_${draftId}`, "pick_made", {
          pick: pickWithDetails,
          draft: updatedDraft,
          next_deadline: updatedDraft.pick_deadline.toISOString(),
          server_time: new Date().toISOString(),
          timestamp: new Date(),
        });
      } else {
        emitDraftPick(eventBus, parseInt(draftId), pickWithDetails, updatedDraft);
      }

      const responseTime = Date.now() - startTime;
      logger.info('[MakePick] Request completed', {
        draftId,
        response_time_ms: responseTime,
      });

      // Transform pick object for HTTP response
      // Database stores Sleeper ID (string) in player_id column
      // Flutter expects database player ID (integer) for matching with available players
      const pickResponse = {
        ...pick,
        player_id: player_id,  // Use database player ID (integer), not Sleeper ID (string)
        sleeper_player_id: pick.player_id,  // Include Sleeper ID for reference
      };

      res.status(201).json({
        success: true,
        data: {
          pick: pickResponse,
          draft: updatedDraft,
        },
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      const responseTime = Date.now() - startTime;
      logger.error('[MakePick] Error', {
        response_time_ms: responseTime,
        error,
      });
      res.status(500).json({
        success: false,
        message: error.message || "Error making draft pick",
      });
    } finally {
      client.release();
    }
  };

  /**
   * Get all picks for a draft
   * GET /api/drafts/:draftId/picks
   */
  getDraftPicksHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const { withDetails } = req.query;

    let picks;
    if (withDetails === "true") {
      picks = await getDraftPicksWithDetails(parseInt(req.params.draftId));
    } else {
      picks = await getDraftPicks(parseInt(req.params.draftId));
    }

    this.respondSuccess(res, picks);
  });

  /**
   * Get available players for a draft with pagination
   * GET /api/drafts/:draftId/players/available
   * Query params: position, team, search, page (default 1), limit (default 50, max 100)
   */
  getAvailablePlayersHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const { position, team, search, page, limit } = req.query;

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : undefined;
    const limitNum = limit ? parseInt(limit as string, 10) : undefined;

    // Validate pagination parameters
    if (pageNum !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      this.respondBadRequest(res, "Invalid page parameter. Must be a positive integer.");
      return;
    }

    if (limitNum !== undefined && (isNaN(limitNum) || limitNum < 1 || limitNum > 100)) {
      this.respondBadRequest(res, "Invalid limit parameter. Must be between 1 and 100.");
      return;
    }

    const result = await getAvailablePlayersForDraft(parseInt(req.params.draftId), {
      position: position as string,
      team: team as string,
      search: search as string,
      page: pageNum,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  });
}

const controller = new DraftPickController();

// Export handlers
export const makeDraftPickHandler = controller.makeDraftPickHandler;
export const getDraftPicksHandler = controller.getDraftPicksHandler;
export const getAvailablePlayersHandler = controller.getAvailablePlayersHandler;
