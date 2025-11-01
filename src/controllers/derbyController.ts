import { Request, Response } from "express";
import pool from "../config/database";
import { getDraftById } from "../models/Draft";
import { getRostersByLeagueId } from "../models/Roster";
import { io } from "../index";

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
    const commissionerCheck = await pool.query(
      `SELECT l.commissioner_id FROM leagues l
       JOIN drafts d ON d.league_id = l.id
       WHERE d.id = $1`,
      [draftId]
    );

    if (commissionerCheck.rows[0]?.commissioner_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can start derby",
      });
      return;
    }

    // Get all rosters for this league
    const rosters = await getRostersByLeagueId(draft.league_id);
    const rosterIds = rosters.map(r => r.id);

    // Randomize the derby order (order for picking positions)
    const shuffledRosterIds = [...rosterIds].sort(() => Math.random() - 0.5);

    // Calculate turn deadline
    const derbyTimeLimit = draft.derby_time_limit_seconds || 60;
    const turnDeadline = new Date(Date.now() + derbyTimeLimit * 1000);

    // Create/update derby record with derby order
    const derbyResult = await pool.query(
      `INSERT INTO draft_derby (draft_id, status, derby_order, current_turn, turn_deadline)
       VALUES ($1, 'in_progress', $2, 0, $3)
       ON CONFLICT (draft_id)
       DO UPDATE SET
         status = 'in_progress',
         derby_order = $2,
         current_turn = 0,
         turn_deadline = $3,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [draftId, JSON.stringify(shuffledRosterIds), turnDeadline]
    );

    const derby = derbyResult.rows[0];

    // Emit to socket
    io.to(`draft-${draftId}`).emit('derby:update', {
      draftId: parseInt(draftId),
      derby: {
        ...derby,
        derby_order: shuffledRosterIds,
      },
      derbyOrder: shuffledRosterIds,
      currentTurn: 0,
      currentRosterId: shuffledRosterIds[0],
      turnDeadline: turnDeadline.toISOString(),
      message: 'Derby has started - teams will now select their draft positions',
    });

    res.status(200).json({
      success: true,
      data: {
        ...derby,
        derby_order: shuffledRosterIds,
      },
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

    const result = await pool.query(
      `SELECT * FROM draft_derby WHERE draft_id = $1`,
      [draftId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Derby not found for this draft",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
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

    // Check if user is commissioner
    const commissionerCheck = await pool.query(
      `SELECT l.commissioner_id FROM leagues l
       JOIN drafts d ON d.league_id = l.id
       WHERE d.id = $1`,
      [draftId]
    );

    if (commissionerCheck.rows[0]?.commissioner_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can create derby",
      });
      return;
    }

    // Create derby record
    const result = await pool.query(
      `INSERT INTO draft_derby (draft_id, status)
       VALUES ($1, 'not_started')
       ON CONFLICT (draft_id) DO NOTHING
       RETURNING *`,
      [draftId]
    );

    if (result.rows.length === 0) {
      // Derby already exists
      const existing = await pool.query(
        `SELECT * FROM draft_derby WHERE draft_id = $1`,
        [draftId]
      );

      res.status(200).json({
        success: true,
        data: existing.rows[0],
        message: "Derby already exists",
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: result.rows[0],
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
  const client = await pool.connect();

  try {
    const { draftId } = req.params;
    const { rosterId, draftPosition } = req.body;
    const userId = req.user?.userId;

    console.log('[Derby] Position selection attempt:', { draftId, rosterId, draftPosition, userId });

    await client.query('BEGIN');

    // Get derby status
    const derbyResult = await client.query(
      `SELECT * FROM draft_derby WHERE draft_id = $1`,
      [draftId]
    );

    if (derbyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "Derby not found",
      });
      return;
    }

    const derby = derbyResult.rows[0];

    // Validate derby is in progress
    if (derby.status !== 'in_progress') {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: `Derby is not in progress (status: ${derby.status})`,
      });
      return;
    }

    // Parse derby order
    const derbyOrder = typeof derby.derby_order === 'string'
      ? JSON.parse(derby.derby_order)
      : derby.derby_order;

    // Validate it's this roster's turn
    const currentRosterId = derbyOrder[derby.current_turn];
    if (currentRosterId !== rosterId) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: "It's not your turn to select",
      });
      return;
    }

    // Verify user owns this roster
    const rosterCheck = await client.query(
      `SELECT r.id FROM rosters r
       JOIN leagues l ON l.id = r.league_id
       WHERE r.id = $1 AND r.user_id = $2`,
      [rosterId, userId]
    );

    if (rosterCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: "You don't own this roster",
      });
      return;
    }

    // Check if position is already taken
    const existingSelection = await client.query(
      `SELECT * FROM draft_derby_selections
       WHERE derby_id = $1 AND draft_position = $2`,
      [derby.id, draftPosition]
    );

    if (existingSelection.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: "Position already selected",
      });
      return;
    }

    // Record the selection
    await client.query(
      `INSERT INTO draft_derby_selections (derby_id, roster_id, draft_position, selected_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [derby.id, rosterId, draftPosition]
    );

    // Update draft_order table with selected position
    await client.query(
      `INSERT INTO draft_order (draft_id, roster_id, pick_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id, roster_id)
       DO UPDATE SET pick_order = $3`,
      [draftId, rosterId, draftPosition]
    );

    // Get draft for time limit
    const draft = await getDraftById(parseInt(draftId));
    const derbyTimeLimit = draft?.derby_time_limit_seconds || 60;

    // Calculate next turn
    const nextTurn = derby.current_turn + 1;
    const isComplete = nextTurn >= derbyOrder.length;

    // Update derby status
    if (isComplete) {
      await client.query(
        `UPDATE draft_derby
         SET status = 'completed', current_turn = $1, turn_deadline = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [nextTurn, derby.id]
      );
    } else {
      // Calculate new turn deadline
      const newDeadline = new Date(Date.now() + derbyTimeLimit * 1000);

      await client.query(
        `UPDATE draft_derby
         SET current_turn = $1, turn_deadline = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextTurn, newDeadline, derby.id]
      );
    }

    await client.query('COMMIT');

    // Get updated derby with selections
    const updatedDerby = await client.query(
      `SELECT dd.*,
              json_agg(
                json_build_object(
                  'roster_id', dds.roster_id,
                  'draft_position', dds.draft_position,
                  'selected_at', dds.selected_at
                ) ORDER BY dds.selected_at
              ) FILTER (WHERE dds.id IS NOT NULL) as selections
       FROM draft_derby dd
       LEFT JOIN draft_derby_selections dds ON dds.derby_id = dd.id
       WHERE dd.id = $1
       GROUP BY dd.id`,
      [derby.id]
    );

    const result = updatedDerby.rows[0];

    // Emit socket events
    io.to(`draft-${draftId}`).emit('derby:selection_made', {
      draftId: parseInt(draftId),
      rosterId,
      draftPosition,
      currentTurn: nextTurn,
      isComplete,
    });

    if (!isComplete) {
      const nextRosterId = derbyOrder[nextTurn];
      io.to(`draft-${draftId}`).emit('derby:turn_changed', {
        draftId: parseInt(draftId),
        currentTurn: nextTurn,
        currentRosterId: nextRosterId,
        turnDeadline: new Date(Date.now() + (draft?.derby_time_limit_seconds || 60) * 1000).toISOString(),
      });
    } else {
      io.to(`draft-${draftId}`).emit('derby:completed', {
        draftId: parseInt(draftId),
        message: 'Derby completed - all positions selected',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        derby: result,
        selection: {
          rosterId,
          draftPosition,
          isComplete,
        },
      },
      message: isComplete ? "Derby completed!" : "Position selected successfully",
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Derby] Error selecting position:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error selecting position",
    });
  } finally {
    client.release();
  }
}

/**
 * Skip current derby turn (commissioner only)
 * POST /api/drafts/:draftId/derby/skip
 */
export async function skipDerbyTurn(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    const { draftId } = req.params;
    const userId = req.user?.userId;

    console.log('[Derby] Skip turn attempt:', { draftId, userId });

    // Check if user is commissioner
    const commissionerCheck = await client.query(
      `SELECT l.commissioner_id FROM leagues l
       JOIN drafts d ON d.league_id = l.id
       WHERE d.id = $1`,
      [draftId]
    );

    if (commissionerCheck.rows[0]?.commissioner_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Only commissioner can skip turns",
      });
      return;
    }

    await client.query('BEGIN');

    // Get derby status
    const derbyResult = await client.query(
      `SELECT * FROM draft_derby WHERE draft_id = $1`,
      [draftId]
    );

    if (derbyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: "Derby not found",
      });
      return;
    }

    const derby = derbyResult.rows[0];

    // Validate derby is in progress
    if (derby.status !== 'in_progress') {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: `Derby is not in progress (status: ${derby.status})`,
      });
      return;
    }

    // Parse derby order
    const derbyOrder = typeof derby.derby_order === 'string'
      ? JSON.parse(derby.derby_order)
      : derby.derby_order;

    const currentRosterId = derbyOrder[derby.current_turn];

    // Get draft to check timeout behavior
    const draft = await getDraftById(parseInt(draftId));
    const timeoutBehavior = draft?.derby_timeout_behavior || 'auto';

    // If auto-assign, find available position
    if (timeoutBehavior === 'auto') {
      // Get already selected positions
      const selectedPositions = await client.query(
        `SELECT draft_position FROM draft_derby_selections WHERE derby_id = $1`,
        [derby.id]
      );

      const takenPositions = new Set(selectedPositions.rows.map(r => r.draft_position));
      const totalRosters = derbyOrder.length;

      // Find first available position (1-indexed)
      let assignedPosition = null;
      for (let i = 1; i <= totalRosters; i++) {
        if (!takenPositions.has(i)) {
          assignedPosition = i;
          break;
        }
      }

      if (assignedPosition) {
        // Record the auto-assigned selection
        await client.query(
          `INSERT INTO draft_derby_selections (derby_id, roster_id, draft_position, selected_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          [derby.id, currentRosterId, assignedPosition]
        );

        // Update draft_order table
        await client.query(
          `INSERT INTO draft_order (draft_id, roster_id, pick_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (draft_id, roster_id)
           DO UPDATE SET pick_order = $3`,
          [draftId, currentRosterId, assignedPosition]
        );
      }
    }

    // Advance to next turn
    const nextTurn = derby.current_turn + 1;
    const isComplete = nextTurn >= derbyOrder.length;

    // Update derby status
    if (isComplete) {
      await client.query(
        `UPDATE draft_derby
         SET status = 'completed', current_turn = $1, turn_deadline = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [nextTurn, derby.id]
      );
    } else {
      // Calculate new turn deadline
      const derbyTimeLimit = draft?.derby_time_limit_seconds || 60;
      const newDeadline = new Date(Date.now() + derbyTimeLimit * 1000);

      await client.query(
        `UPDATE draft_derby
         SET current_turn = $1, turn_deadline = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextTurn, newDeadline, derby.id]
      );
    }

    await client.query('COMMIT');

    // Get updated derby with selections
    const updatedDerby = await client.query(
      `SELECT dd.*,
              json_agg(
                json_build_object(
                  'roster_id', dds.roster_id,
                  'draft_position', dds.draft_position,
                  'selected_at', dds.selected_at
                ) ORDER BY dds.selected_at
              ) FILTER (WHERE dds.id IS NOT NULL) as selections
       FROM draft_derby dd
       LEFT JOIN draft_derby_selections dds ON dds.derby_id = dd.id
       WHERE dd.id = $1
       GROUP BY dd.id`,
      [derby.id]
    );

    const result = updatedDerby.rows[0];

    // Emit socket events
    if (!isComplete) {
      const nextRosterId = derbyOrder[nextTurn];
      io.to(`draft-${draftId}`).emit('derby:turn_changed', {
        draftId: parseInt(draftId),
        currentTurn: nextTurn,
        currentRosterId: nextRosterId,
        turnDeadline: new Date(Date.now() + (draft?.derby_time_limit_seconds || 60) * 1000).toISOString(),
        skipped: true,
      });
    } else {
      io.to(`draft-${draftId}`).emit('derby:completed', {
        draftId: parseInt(draftId),
        message: 'Derby completed',
      });
    }

    res.status(200).json({
      success: true,
      data: result,
      message: isComplete ? "Derby completed" : "Turn skipped",
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Derby] Error skipping turn:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error skipping turn",
    });
  } finally {
    client.release();
  }
}