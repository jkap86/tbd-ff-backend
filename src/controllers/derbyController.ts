import { Request, Response } from "express";
import pool from "../config/database";
import { getDraftById } from "../models/Draft";
import { getRostersByLeagueId } from "../models/Roster";
import { io } from "../index";
import { scheduleDerbyTimeout, cancelDerbyTimer } from "../socket/derbySocket";

/**
 * Derby Controller
 * Implements the derby flow where teams draft for their draft position
 */

/**
 * Start derby for a draft
 * POST /api/drafts/:draftId/derby/start
 */
export async function startDerby(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    console.log('[Derby] Starting derby for draft', draftId);

    // Get the draft
    const draft = await getDraftById(parseInt(draftId));

    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const { getLeagueById } = await import("../models/League");
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
        message: "Only commissioner can start derby",
      });
      return;
    }

    // Get all rosters for this league
    const rosters = await getRostersByLeagueId(draft.league_id);
    const rosterIds = rosters.map(r => r.id);

    // Import DraftDerby model functions
    const { createDraftDerby, startDraftDerby, getDraftDerbyByDraftId } = await import('../models/DraftDerby');

    // Check if derby already exists
    let derby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (!derby) {
      // Create new derby with draft order (not randomized)
      derby = await createDraftDerby(parseInt(draftId), rosterIds);
    }

    // Start the derby (sets first roster's turn)
    const startedDerby = await startDraftDerby(parseInt(draftId));

    // Calculate turn deadline
    const derbyTimeLimit = draft.derby_time_limit_seconds || 60;
    const turnDeadline = new Date(Date.now() + derbyTimeLimit * 1000);

    // Schedule automatic timeout
    scheduleDerbyTimeout(parseInt(draftId), turnDeadline);

    // Emit to socket with new schema
    io.to(`draft_${draftId}`).emit('derby:update', {
      draftId: parseInt(draftId),
      derby: startedDerby,
      selectionOrder: startedDerby.selection_order,
      currentRosterId: startedDerby.current_turn_roster_id,
      skippedRosterIds: startedDerby.skipped_roster_ids,
      onlySkippedRemaining: false,
      turnDeadline: turnDeadline.toISOString(),
      message: 'Derby has started - teams will now select their draft positions',
    });
    // Create system chat message for derby started
    try {
      const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
      const { emitLeagueChat } = await import("../socket/leagueSocket");

      const chatMessage = await createLeagueChatMessage({
        league_id: draft.league_id,
        user_id: null, // System message
        message: "Derby has started - teams will now select their draft positions",
        message_type: "system",
        metadata: {
          type: "derby_started",
          draft_id: parseInt(draftId),
        },
      });

      // Emit chat message to all league members
      emitLeagueChat(io, draft.league_id, chatMessage);
    } catch (chatError) {
      console.error("Error sending derby started chat message:", chatError);
      // Don't fail the request if chat message fails
    }

    res.status(200).json({
      success: true,
      data: startedDerby,
      message: "Derby started - teams can now select their draft positions",
    });

  } catch (error: any) {
    console.error('[Derby] Error starting derby:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error starting derby",
    });
  }
}

/**
 * Get derby status
 * GET /api/drafts/:draftId/derby
 */
export async function getDerbyStatus(req: Request, res: Response): Promise<void> {
  try {
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
      res.status(404).json({
        success: false,
        message: "Derby not found for this draft",
      });
      return;
    }

    // Get draft to find league_id for rosters
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
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

    res.status(200).json({
      success: true,
      data: {
        ...derbyDetails,
        rosters: rostersResult.rows,
      },
    });

  } catch (error: any) {
    console.error('[Derby] Error getting derby status:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error getting derby status",
    });
  }
}

/**
 * Create derby for a draft
 * POST /api/drafts/:draftId/derby/create
 */
export async function createDerby(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    // Get draft and league
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can create derby",
      });
      return;
    }

    // Import DraftDerby model functions
    const { createDraftDerby, getDraftDerbyByDraftId } = await import('../models/DraftDerby');

    // Check if derby already exists
    const existingDerby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (existingDerby) {
      res.status(200).json({
        success: true,
        data: existingDerby,
        message: "Derby already exists",
      });
      return;
    }

    // Get all rosters for this league
    const rosters = await getRostersByLeagueId(draft.league_id);
    const rosterIds = rosters.map(r => r.id);

    // Create new derby with draft order (not randomized)
    const derby = await createDraftDerby(parseInt(draftId), rosterIds);
    // Create system chat message for derby created
    try {
      const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
      const { emitLeagueChat } = await import("../socket/leagueSocket");

      const chatMessage = await createLeagueChatMessage({
        league_id: draft.league_id,
        user_id: null, // System message
        message: "Derby has been created",
        message_type: "system",
        metadata: {
          type: "derby_created",
          draft_id: parseInt(draftId),
        },
      });

      // Emit chat message to all league members
      emitLeagueChat(io, draft.league_id, chatMessage);
    } catch (chatError) {
      console.error("Error sending derby created chat message:", chatError);
      // Don't fail the request if chat message fails
    }

    res.status(201).json({
      success: true,
      data: derby,
    });

  } catch (error: any) {
    console.error('[Derby] Error creating derby:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating derby",
    });
  }
}

/**
 * Select a draft position during derby
 * POST /api/drafts/:draftId/derby/select
 */
export async function selectDerbyPosition(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    console.log('[Derby] Request body:', req.body);
    const { rosterId, draftPosition } = req.body;
    const userId = req.user?.userId;

    console.log('[Derby] Position selection attempt:', { draftId, rosterId, draftPosition, userId });

    // Verify user owns this roster
    const rosterCheck = await pool.query(
      `SELECT r.id FROM rosters r
       JOIN leagues l ON l.id = r.league_id
       WHERE r.id = $1 AND r.user_id = $2`,
      [rosterId, userId]
    );

    if (rosterCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: "You don't own this roster",
      });
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
      res.status(500).json({
        success: false,
        message: "Error retrieving updated derby status",
      });
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
      // Create system chat message for derby completed
      if (draft) {
        try {
          const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
          const { emitLeagueChat } = await import("../socket/leagueSocket");

          const chatMessage = await createLeagueChatMessage({
            league_id: draft.league_id,
            user_id: null, // System message
            message: "Derby completed - all positions selected",
            message_type: "system",
            metadata: {
              type: "derby_completed",
              draft_id: parseInt(draftId),
            },
          });

          // Emit chat message to all league members
          emitLeagueChat(io, draft.league_id, chatMessage);
        } catch (chatError) {
          console.error("Error sending derby completed chat message:", chatError);
          // Don't fail the request if chat message fails
        }
      }

    }

    res.status(200).json({
      success: true,
      data: {
        derby: {
          ...derbyWithDetails,
          rosters: rostersResult.rows,
        },
        selection,
      },
      message: isComplete ? "Derby completed!" : "Position selected successfully",
    });

  } catch (error: any) {
    console.error('[Derby] Error selecting position:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error selecting position",
    });
  }
}

/**
 * Skip current derby turn (commissioner only)
 * POST /api/drafts/:draftId/derby/skip
 */
export async function skipDerbyTurn(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    console.log('[Derby] Skip turn attempt:', { draftId, userId });

    // Get draft and league for commissioner check
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can skip turns",
      });
      return;
    }

    // Import DraftDerby model functions
    const { skipDerbyTurn: skipDerbyTurnModel, getDraftDerbyWithDetails } = await import('../models/DraftDerby');

    // Skip turn using model function
    await skipDerbyTurnModel(parseInt(draftId));

    // Get updated derby with details
    const derbyWithDetails = await getDraftDerbyWithDetails(parseInt(draftId));

    if (!derbyWithDetails) {
      res.status(500).json({
        success: false,
        message: "Error retrieving updated derby status",
      });
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
    }

    res.status(200).json({
      success: true,
      data: {
        ...derbyWithDetails,
        rosters: rostersResult.rows,
      },
      message: isComplete ? "Derby completed" : "Turn skipped",
    });

  } catch (error: any) {
    console.error('[Derby] Error skipping turn:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error skipping turn",
    });
  }
}

/**
 * Randomize derby selection order (commissioner only, before derby starts)
 * POST /api/drafts/:draftId/derby/randomize
 */
export async function randomizeDerby(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    console.log('[Derby] Randomize order attempt:', { draftId, userId });

    // Get draft and league for commissioner check
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);

    if (!league) {
      res.status(404).json({
        success: false,
        message: "League not found",
      });
      return;
    }

    // Check if user is commissioner
    const commissionerId = league.settings?.commissioner_id;
    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can randomize derby order",
      });
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
    try {
      const { createLeagueChatMessage } = await import("../models/LeagueChatMessage");
      const { emitLeagueChat } = await import("../socket/leagueSocket");

      const metadata = {
        type: "derby_order_randomized",
        draft_id: parseInt(draftId),
        collapsible: true,
        details: {
          derby_order: derbyOrderList,
        },
      };

      console.log('[Derby] Chat message metadata:', JSON.stringify(metadata, null, 2));

      const chatMessage = await createLeagueChatMessage({
        league_id: draft.league_id,
        user_id: null, // System message
        message: "Derby selection order has been randomized",
        message_type: "system",
        metadata: metadata,
      });

      // Emit chat message to all league members
      emitLeagueChat(io, draft.league_id, chatMessage);
    } catch (chatError) {
      console.error("Error sending derby order randomized chat message:", chatError);
      // Don't fail the request if chat message fails
    }

    res.status(200).json({
      success: true,
      data: updatedDerby,
      message: "Derby order randomized successfully",
    });

  } catch (error: any) {
    console.error('[Derby] Error randomizing order:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error randomizing derby order",
    });
  }
}

/**
 * Pause derby timer
 * POST /api/drafts/:draftId/derby/pause
 */
export async function pauseDerby(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    console.log('[Derby] Pausing derby for draft', draftId);

    // Get the draft
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);
    const commissionerId = league?.settings?.commissioner_id;

    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can pause derby",
      });
      return;
    }

    // Get derby
    const { getDraftDerbyByDraftId } = await import('../models/DraftDerby');
    const derby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (!derby) {
      res.status(404).json({
        success: false,
        message: "Derby not found",
      });
      return;
    }

    if (derby.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        message: "Derby is not in progress",
      });
      return;
    }

    // Cancel the timer
    cancelDerbyTimer(parseInt(draftId));

    // Emit socket event
    io.to(`draft_${draftId}`).emit('derby:paused', {
      draftId: parseInt(draftId),
      message: 'Derby has been paused',
    });

    res.status(200).json({
      success: true,
      message: "Derby paused successfully",
    });

  } catch (error: any) {
    console.error('[Derby] Error pausing:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error pausing derby",
    });
  }
}

/**
 * Resume derby timer
 * POST /api/drafts/:draftId/derby/resume
 */
export async function resumeDerby(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    console.log('[Derby] Resuming derby for draft', draftId);

    // Get the draft
    const draft = await getDraftById(parseInt(draftId));
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Draft not found",
      });
      return;
    }

    // Check if user is commissioner
    const { getLeagueById } = await import("../models/League");
    const league = await getLeagueById(draft.league_id);
    const commissionerId = league?.settings?.commissioner_id;

    if (!commissionerId || commissionerId !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can resume derby",
      });
      return;
    }

    // Get derby
    const { getDraftDerbyByDraftId } = await import('../models/DraftDerby');
    const derby = await getDraftDerbyByDraftId(parseInt(draftId));

    if (!derby) {
      res.status(404).json({
        success: false,
        message: "Derby not found",
      });
      return;
    }

    if (derby.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        message: "Derby is not in progress",
      });
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

    res.status(200).json({
      success: true,
      message: "Derby resumed successfully",
    });

  } catch (error: any) {
    console.error('[Derby] Error resuming:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error resuming derby",
    });
  }
}