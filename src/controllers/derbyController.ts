// Before refactor: 852 lines (before chat service refactor)
// After refactor: 734 lines
// Lines saved: 118 lines

import { Request, Response } from "express";
import pool from "../config/database";
import { getDraftById } from "../models/Draft";
import { getRostersByLeagueId } from "../models/Roster";
import { io } from "../index";
import { scheduleDerbyTimeout, cancelDerbyTimer } from "../socket/derbySocket";
import { BaseController } from "./BaseController";
import {
  sendSystemMessageSafe,
  sendCollapsibleSystemMessageSafe,
} from "../services/leagueChatService";

/**
 * Derby Controller
 * Implements the derby flow where teams draft for their draft position
 */
class DerbyController extends BaseController {
  /**
   * Start derby for a draft
   * POST /api/drafts/:draftId/derby/start
   */
  startDerby = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    console.log('[Derby] Starting derby for draft', draftId);

    // Get the draft
    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Check if user is commissioner
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only commissioner can start derby");
      return;
    }

    // Get all rosters for this league
    const rosters = await getRostersByLeagueId(draft.league_id);
    const rosterIds = rosters.map(r => r.id);

    // Import DraftDerby model functions
    const { createDraftDerby, startDraftDerby, getDraftDerbyByDraftId, getDraftDerbyWithDetails } = await import('../models/DraftDerby');

    // Check if derby already exists
    let derby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (!derby) {
      // Create new derby with draft order (not randomized)
      derby = await createDraftDerby(parseInt(draftId), rosterIds);
    }

    // Start the derby (sets first roster's turn)
    await startDraftDerby(parseInt(draftId));

    // Get full derby details with selections and available_positions
    const derbyWithDetails = await getDraftDerbyWithDetails(parseInt(draftId));

    if (!derbyWithDetails) {
      this.respondError(res, "Failed to get derby details after starting", 500);
      return;
    }

    // Calculate turn deadline
    const derbyTimeLimit = draft.derby_time_limit_seconds || 60;
    const turnDeadline = new Date(Date.now() + derbyTimeLimit * 1000);

    // Schedule automatic timeout
    scheduleDerbyTimeout(parseInt(draftId), turnDeadline);

    // Emit to socket with new schema
    io.to(`draft_${draftId}`).emit('derby:update', {
      draftId: parseInt(draftId),
      derby: derbyWithDetails,
      selectionOrder: derbyWithDetails.selection_order,
      currentRosterId: derbyWithDetails.current_turn_roster_id,
      skippedRosterIds: derbyWithDetails.skipped_roster_ids,
      onlySkippedRemaining: false,
      turnDeadline: turnDeadline.toISOString(),
      message: 'Derby has started - teams will now select their draft positions',
    });
    // Create system chat message for derby started
    await sendSystemMessageSafe(io, draft.league_id, "Derby has started - teams will now select their draft positions", {
      type: "derby_started",
      draft_id: parseInt(draftId),
    });

    this.respondSuccess(res, derbyWithDetails, "Derby started - teams can now select their draft positions");
  });

  /**
   * Get derby status
   * GET /api/drafts/:draftId/derby
   */
  getDerbyStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;

    // Use DraftDerby model function
    const { getDraftDerbyWithDetails, createDraftDerby } = await import('../models/DraftDerby');
    let derbyDetails = await getDraftDerbyWithDetails(parseInt(draftId));

    // If derby doesn't exist but draft has derby enabled, auto-create it
    if (!derbyDetails) {
      const draft = await getDraftById(parseInt(draftId));

      if (draft && draft.derby_enabled) {
        console.log('[Derby] Auto-creating derby for draft', draftId);

        // Get rosters and create derby
        const rosters = await getRostersByLeagueId(draft.league_id);
        const rosterIds = rosters.map(r => r.id);

        await createDraftDerby(parseInt(draftId), rosterIds);
        derbyDetails = await getDraftDerbyWithDetails(parseInt(draftId));
      }
    }

    if (!derbyDetails) {
      this.respondNotFound(res, "Derby not found for this draft");
      return;
    }

    // Get draft to find league_id for rosters
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Get roster details with user mappings
    const rostersResult = await pool.query(
      `SELECT r.id as roster_id, r.user_id, u.username
       FROM rosters r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.league_id = $1`,
      [draft.league_id]
    );

    console.log('[Derby] getDerbyStatus response - is_randomized:', derbyDetails.is_randomized);
    console.log('[Derby] getDerbyStatus response - selection_order length:', derbyDetails.selection_order?.length);
    console.log('[Derby] getDerbyStatus response - status:', derbyDetails.status);

    // Calculate turn deadline if derby is in progress with an active turn
    let turnDeadline: string | null = null;
    if (derbyDetails.status === 'in_progress' && derbyDetails.current_turn_started_at) {
      const derbyTimeLimit = draft.derby_time_limit_seconds || 60;
      const deadline = new Date(
        new Date(derbyDetails.current_turn_started_at).getTime() +
        derbyTimeLimit * 1000
      );
      turnDeadline = deadline.toISOString();
    }

    this.respondSuccess(res, {
      ...derbyDetails,
      rosters: rostersResult.rows,
      turnDeadline,
    });
  });

  /**
   * Create derby for a draft
   * POST /api/drafts/:draftId/derby/create
   */
  createDerby = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    // Get draft and league
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only commissioner can create derby");
      return;
    }

    // Import DraftDerby model functions
    const { createDraftDerby, getDraftDerbyByDraftId } = await import('../models/DraftDerby');

    // Check if derby already exists
    const existingDerby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (existingDerby) {
      this.respondSuccess(res, existingDerby, "Derby already exists");
      return;
    }

    // Get all rosters for this league
    const rosters = await getRostersByLeagueId(draft.league_id);
    const rosterIds = rosters.map(r => r.id);

    // Create new derby with draft order (not randomized)
    const derby = await createDraftDerby(parseInt(draftId), rosterIds);

    // Create system chat message for derby created
    await sendSystemMessageSafe(io, draft.league_id, "Derby has been created", {
      type: "derby_created",
      draft_id: parseInt(draftId),
    });

    this.respondCreated(res, derby);
  });

  /**
   * Select a draft position during derby
   * POST /api/drafts/:draftId/derby/select
   */
  selectDerbyPosition = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    console.log('[Derby] Request body:', req.body);
    const { rosterId, draftPosition } = req.body;
    const userId = this.getAuthenticatedUserId(req);

    console.log('[Derby] Position selection attempt:', { draftId, rosterId, draftPosition, userId });

    // Verify user owns this roster
    const rosterCheck = await pool.query(
      `SELECT r.id FROM rosters r
       JOIN leagues l ON l.id = r.league_id
       WHERE r.id = $1 AND r.user_id = $2`,
      [rosterId, userId]
    );

    if (rosterCheck.rows.length === 0) {
      this.respondForbidden(res, "You don't own this roster");
      return;
    }

    // Import DraftDerby model functions
    const { makeDerbySelection, getDraftDerbyWithDetails } = await import('../models/DraftDerby');

    // Make the selection using model function (handles all validation and turn logic)
    const selection = await makeDerbySelection(parseInt(draftId), rosterId, draftPosition);

    // Update draft_order table with selected position
    await pool.query(
      `INSERT INTO draft_order (draft_id, roster_id, draft_position)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id, roster_id)
       DO UPDATE SET draft_position = $3`,
      [draftId, rosterId, draftPosition]
    );

    // Get updated derby with details
    const derbyWithDetails = await getDraftDerbyWithDetails(parseInt(draftId));

    if (!derbyWithDetails) {
      this.respondError(res, "Error retrieving updated derby status");
      return;
    }

    const isComplete = derbyWithDetails.status === 'completed';
    const nextRosterId = derbyWithDetails.current_turn_roster_id;
    const skippedRosterIds = derbyWithDetails.skipped_roster_ids;
    const onlySkippedRemaining = nextRosterId === null && skippedRosterIds.length > 0;

    // Cancel current timer
    cancelDerbyTimer(parseInt(draftId));

    // Get draft for time limit
    const draft = await getDraftById(parseInt(draftId));
    const derbyTimeLimit = draft?.derby_time_limit_seconds || 60;

    // Get roster details
    const rostersResult = await pool.query(
      `SELECT r.id as roster_id, r.user_id, u.username
       FROM rosters r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.league_id = $1`,
      [draft?.league_id]
    );

    // Emit socket events
    io.to(`draft_${draftId}`).emit('derby:selection_made', {
      draftId: parseInt(draftId),
      rosterId,
      draftPosition,
      isComplete,
      selection: {
        id: selection.id,
        derby_id: selection.derby_id,
        roster_id: selection.roster_id,
        draft_position: selection.draft_position,
        selected_at: selection.selected_at,
      },
    });

    if (!isComplete) {
      // Determine which timer to use
      let timerDuration = derbyTimeLimit;
      if (onlySkippedRemaining) {
        timerDuration = draft?.derby_skipped_user_time_limit_seconds || derbyTimeLimit;
      }

      const newDeadline = new Date(Date.now() + timerDuration * 1000);

      // Schedule next timeout
      scheduleDerbyTimeout(parseInt(draftId), newDeadline);

      io.to(`draft_${draftId}`).emit('derby:turn_changed', {
        draftId: parseInt(draftId),
        currentRosterId: nextRosterId,
        skippedRosterIds,
        onlySkippedRemaining,
        turnDeadline: newDeadline.toISOString(),
      });
    } else {
      io.to(`draft_${draftId}`).emit('derby:completed', {
        draftId: parseInt(draftId),
        message: 'Derby completed - all positions selected',
      });
      // Create system chat message for derby completed with draft order
      console.log('[Derby] Derby completed, sending chat message. Draft:', draft?.id, 'League:', draft?.league_id);
      if (draft) {
        console.log('[Derby] Querying draft order for draftId:', draftId);
        // Get final draft order determined by derby
        const draftOrderResult = await pool.query(
          `SELECT dord.draft_position as position, r.id as roster_id, r.settings, u.username
           FROM draft_order dord
           JOIN rosters r ON r.id = dord.roster_id
           LEFT JOIN users u ON u.id = r.user_id
           WHERE dord.draft_id = $1
           ORDER BY dord.draft_position ASC`,
          [draftId]
        );

        console.log('[Derby] Draft order query returned', draftOrderResult.rows.length, 'rows');

        // Format draft order for chat message
        const draftOrderList = draftOrderResult.rows.map((row) => {
          const teamName = row.settings?.team_name;
          return {
            position: row.position,
            roster_id: row.roster_id,
            team_name: teamName || row.username || `Team ${row.roster_id}`,
            username: row.username,
          };
        });

        console.log('[Derby] Formatted draft order list:', JSON.stringify(draftOrderList, null, 2));

        await sendCollapsibleSystemMessageSafe(io, draft.league_id, "Derby has completed. Draft order set.", "derby_completed", {
          draft_id: parseInt(draftId),
          draft_order: draftOrderList,
        });
        console.log('[Derby] Derby completion message sent successfully');
      } else {
        console.log('[Derby] No draft found, cannot send completion message');
      }

    }

    this.respondSuccess(res, {
      derby: {
        ...derbyWithDetails,
        rosters: rostersResult.rows,
      },
      selection,
    }, isComplete ? "Derby completed!" : "Position selected successfully");
  });

  /**
   * Skip current derby turn (commissioner only)
   * POST /api/drafts/:draftId/derby/skip
   */
  skipDerbyTurn = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    console.log('[Derby] Skip turn attempt:', { draftId, userId });

    // Get draft and league for commissioner check
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only commissioner can skip turns");
      return;
    }

    // Import DraftDerby model functions
    const { skipDerbyTurn: skipDerbyTurnModel, getDraftDerbyWithDetails } = await import('../models/DraftDerby');

    // Skip turn using model function
    await skipDerbyTurnModel(parseInt(draftId));

    // Get updated derby with details
    const derbyWithDetails = await getDraftDerbyWithDetails(parseInt(draftId));

    if (!derbyWithDetails) {
      this.respondError(res, "Error retrieving updated derby status");
      return;
    }

    const isComplete = derbyWithDetails.status === 'completed';
    const nextRosterId = derbyWithDetails.current_turn_roster_id;
    const skippedRosterIds = derbyWithDetails.skipped_roster_ids;
    const onlySkippedRemaining = nextRosterId === null && skippedRosterIds.length > 0;

    // Cancel current timer
    cancelDerbyTimer(parseInt(draftId));

    // Get roster details
    const rostersResult = await pool.query(
      `SELECT r.id as roster_id, r.user_id, u.username
       FROM rosters r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.league_id = $1`,
      [draft.league_id]
    );

    // Emit socket events
    if (!isComplete) {
      // Determine which timer to use
      const derbyTimeLimit = draft.derby_time_limit_seconds || 60;
      let timerDuration = derbyTimeLimit;
      if (onlySkippedRemaining) {
        timerDuration = draft.derby_skipped_user_time_limit_seconds || derbyTimeLimit;
      }

      const newDeadline = new Date(Date.now() + timerDuration * 1000);

      // Schedule next timeout
      scheduleDerbyTimeout(parseInt(draftId), newDeadline);

      io.to(`draft_${draftId}`).emit('derby:turn_changed', {
        draftId: parseInt(draftId),
        currentRosterId: nextRosterId,
        skippedRosterIds,
        onlySkippedRemaining,
        turnDeadline: newDeadline.toISOString(),
        skipped: true,
      });
    } else {
      io.to(`draft_${draftId}`).emit('derby:completed', {
        draftId: parseInt(draftId),
        message: 'Derby completed',
      });
      // Create system chat message for derby completed with draft order
      console.log('[Derby] Derby completed via skip, sending chat message. Draft:', draft.id, 'League:', draft.league_id);

      console.log('[Derby] Querying draft order for draftId:', draftId);
      // Get final draft order determined by derby
      const draftOrderResult = await pool.query(
        `SELECT do.draft_position as position, r.id as roster_id, r.settings, u.username
         FROM draft_order do
         JOIN rosters r ON r.id = do.roster_id
         LEFT JOIN users u ON u.id = r.user_id
         WHERE do.draft_id = $1
         ORDER BY do.draft_position ASC`,
        [draftId]
      );

      // Format draft order for chat message
      const draftOrderList = draftOrderResult.rows.map((row) => {
        const teamName = row.settings?.team_name;
        return {
          position: row.position,
          roster_id: row.roster_id,
          team_name: teamName || row.username || `Team ${row.roster_id}`,
          username: row.username,
        };
      });

      await sendCollapsibleSystemMessageSafe(io, draft.league_id, "Derby has completed. Draft order set.", "derby_completed", {
        draft_id: parseInt(draftId),
        draft_order: draftOrderList,
      });
    }

    this.respondSuccess(res, {
      ...derbyWithDetails,
      rosters: rostersResult.rows,
    }, isComplete ? "Derby completed" : "Turn skipped");
  });

  /**
   * Randomize derby selection order (commissioner only, before derby starts)
   * POST /api/drafts/:draftId/derby/randomize
   */
  randomizeDerby = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    console.log('[Derby] Randomize order attempt:', { draftId, userId });

    // Get draft and league for commissioner check
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only commissioner can randomize derby order");
      return;
    }

    // Import DraftDerby model functions
    const { randomizeDerbyOrder } = await import('../models/DraftDerby');

    // Randomize order using model function
    const updatedDerby = await randomizeDerbyOrder(parseInt(draftId));

    // Get roster details for chat message
    const rostersResult = await pool.query(
      `SELECT r.id as roster_id, r.user_id, r.settings, u.username
       FROM rosters r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.league_id = $1`,
      [draft.league_id]
    );

    // Create roster lookup map
    const rosterMap = new Map(
      rostersResult.rows.map((r: any) => [r.roster_id, r])
    );

    // Map selection order to include roster details
    const derbyOrderList = updatedDerby.selection_order.map((rosterId: number, index: number) => {
      const roster = rosterMap.get(rosterId);
      const teamName = roster?.settings?.team_name || roster?.username || `Team ${rosterId}`;
      return {
        position: index + 1,
        roster_id: rosterId,
        team_name: teamName,
        username: roster?.username,
      };
    });

    console.log('[Derby] Derby order list for chat:', JSON.stringify(derbyOrderList, null, 2));

    // Emit socket event to notify all clients
    io.to(`draft_${draftId}`).emit('derby:update', {
      draftId: parseInt(draftId),
      derby: updatedDerby,
      selectionOrder: updatedDerby.selection_order,
      message: 'Derby selection order has been randomized',
    });

    // Create system chat message with collapsible derby order
    console.log('[Derby] Sending derby order randomized message with order:', JSON.stringify(derbyOrderList, null, 2));

    await sendCollapsibleSystemMessageSafe(io, draft.league_id, "Derby selection order has been randomized", "derby_order_randomized", {
      draft_id: parseInt(draftId),
      derby_order: derbyOrderList,
    });

    this.respondSuccess(res, updatedDerby, "Derby order randomized successfully");
  });

  /**
   * Pause derby timer
   * POST /api/drafts/:draftId/derby/pause
   */
  pauseDerby = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    console.log('[Derby] Pausing derby for draft', draftId);

    // Get the draft
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Check if user is commissioner
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);
    const commissionerId = league?.settings?.commissioner_id;

    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only commissioner can pause derby");
      return;
    }

    // Get derby
    const { getDraftDerbyByDraftId } = await import('../models/DraftDerby');
    const derby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (!derby) {
      this.respondNotFound(res, "Derby not found");
      return;
    }

    if (derby.status !== 'in_progress') {
      this.respondBadRequest(res, "Derby is not in progress");
      return;
    }

    // Cancel the timer
    cancelDerbyTimer(parseInt(draftId));

    // Emit socket event
    io.to(`draft_${draftId}`).emit('derby:paused', {
      draftId: parseInt(draftId),
      message: 'Derby has been paused',
    });

    this.respondSuccess(res, null, "Derby paused successfully");
  });

  /**
   * Resume derby timer
   * POST /api/drafts/:draftId/derby/resume
   */
  resumeDerby = this.asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.params;
    const userId = this.getAuthenticatedUserId(req);

    console.log('[Derby] Resuming derby for draft', draftId);

    // Get the draft
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Check if user is commissioner
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);
    const commissionerId = league?.settings?.commissioner_id;

    if (!commissionerId || commissionerId !== userId) {
      this.respondForbidden(res, "Only commissioner can resume derby");
      return;
    }

    // Get derby
    const { getDraftDerbyByDraftId } = await import('../models/DraftDerby');
    const derby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (!derby) {
      this.respondNotFound(res, "Derby not found");
      return;
    }

    if (derby.status !== 'in_progress') {
      this.respondBadRequest(res, "Derby is not in progress");
      return;
    }

    // Restart the timer for current turn
    if (derby.current_turn_roster_id) {
      // Get the time remaining from the request body
      const { timeRemainingSeconds } = req.body;

      if (timeRemainingSeconds && timeRemainingSeconds > 0) {
        // Resume with remaining time
        const turnDeadline = new Date(Date.now() + timeRemainingSeconds * 1000);
        scheduleDerbyTimeout(parseInt(draftId), turnDeadline);
      } else {
        // Fallback: use full time limit
        const derbyTimeLimit = draft.derby_time_limit_seconds || 60;
        const turnDeadline = new Date(Date.now() + derbyTimeLimit * 1000);
        scheduleDerbyTimeout(parseInt(draftId), turnDeadline);
      }
    }

    // Emit socket event (no deadline needed - frontend keeps its existing deadline)
    io.to(`draft_${draftId}`).emit('derby:resumed', {
      draftId: parseInt(draftId),
      message: 'Derby has been resumed',
    });

    this.respondSuccess(res, null, "Derby resumed successfully");
  });
}

const derbyController = new DerbyController();
export const startDerby = derbyController.startDerby;
export const getDerbyStatus = derbyController.getDerbyStatus;
export const createDerby = derbyController.createDerby;
export const selectDerbyPosition = derbyController.selectDerbyPosition;
export const skipDerbyTurn = derbyController.skipDerbyTurn;
export const randomizeDerby = derbyController.randomizeDerby;
export const pauseDerby = derbyController.pauseDerby;
export const resumeDerby = derbyController.resumeDerby;