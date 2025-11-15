// Before split: 1760 lines
// After split: ~1117 lines
// Split into: draftPickController.ts (~580 lines), draftOrderController.ts (~145 lines), utils/draftCalculations.ts (~69 lines)

import { Request, Response } from "express";
import { BaseController } from "./BaseController";
import {
  Draft,
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraft,
  resetDraft,
} from "../models/Draft";
import { eventBus } from "../index";
import {
  emitDraftStatusChange,
  startTimerBroadcast,
  stopTimerBroadcast,
} from "../socket/draftSocket";
import {
  getDraftOrder,
  getRosterAtPosition,
} from "../models/DraftOrder";
import { getLeagueById, updateLeague } from "../models/League";
import {
  sendCollapsibleSystemMessageSafe,
} from "../services/leagueChatService";
import {
  startAutoPickMonitoring,
  stopAutoPickMonitoring,
} from "../services/autoPickService";
import { checkAndAutoPauseDraft } from "../services/draftScheduler";
import pool from "../config/database";
import { TRANSACTION_TIMEOUTS, DB_ERROR_CODES } from "../config/constants";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import { calculateCurrentRoster } from "../utils/draftCalculations";
import { logger } from "../utils/logger";

class DraftController extends BaseController {
  /**
   * Create a new draft for a league
   * POST /api/drafts/create
   */
  createDraftHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const {
      league_id,
      draft_type = "snake",
      third_round_reversal = false,
      pick_time_seconds = 90,
      rounds = 15,
      timer_mode = "traditional",
      team_time_budget_seconds,
      settings = {},
      // Scheduling parameters
      scheduled_start_time,
      auto_start = false,
      // Derby parameters
      derby_enabled,
      derby_time_limit_seconds,
      derby_timeout_behavior,
    } = req.body;

    // Validate required fields
    if (!league_id) {
      this.respondBadRequest(res, "League ID is required");
      return;
    }

    // Validate draft type
    if (!["snake", "linear", "auction", "slow_auction"].includes(draft_type)) {
      this.respondBadRequest(res, "Draft type must be 'snake', 'linear', 'auction', or 'slow_auction'");
      return;
    }

    // Validate timer mode
    if (!["traditional", "chess"].includes(timer_mode)) {
      this.respondBadRequest(res, "Timer mode must be 'traditional' or 'chess'");
      return;
    }

    // Validate chess timer requirements
    if (timer_mode === "chess") {
      if (!team_time_budget_seconds || team_time_budget_seconds <= 0) {
        this.respondBadRequest(res, "Chess timer mode requires a positive team_time_budget_seconds value");
        return;
      }
    }

    // Check if league exists
    const league = await getLeagueById(league_id);
    if (!league) {
      this.respondNotFound(res, "League not found");
      return;
    }

    // Check if draft already exists for this league
    const existingDraft = await getDraftByLeagueId(league_id);
    if (existingDraft) {
      this.respondBadRequest(res, "Draft already exists for this league");
      return;
    }

    // Parse scheduled_start_time if provided
    let parsedStartTime: Date | undefined;
    if (scheduled_start_time) {
      parsedStartTime = new Date(scheduled_start_time);
      if (isNaN(parsedStartTime.getTime())) {
        this.respondBadRequest(res, "Invalid scheduled_start_time format");
        return;
      }
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
      // Scheduling parameters
      scheduled_start_time: parsedStartTime,
      auto_start,
      // Derby parameters
      derby_enabled,
      derby_time_limit_seconds,
      derby_timeout_behavior,
    });

    this.respondCreated(res, draft);
  });

  /**
   * Get draft by ID
   * GET /api/drafts/:draftId
   */
  getDraftHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const parsedDraftId = this.validateId(req.params.draftId, "Draft ID");
    const draft = await getDraftById(parsedDraftId);

    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    this.respondSuccess(res, draft);
  });

  /**
   * Update draft settings
   * PUT /api/drafts/:draftId/settings
   */
  updateDraftSettingsHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const parsedDraftId = this.validateId(req.params.draftId, "Draft ID");
    const {
      draft_type,
      third_round_reversal,
      pick_time_seconds,
      rounds,
      timer_mode,
      team_time_budget_seconds,
      settings,
      // Scheduling
      scheduled_start_time,
      auto_start,
      // Auction
      starting_budget,
      min_bid,
      bid_increment,
      nominations_per_manager,
      nomination_timer_hours,
      bid_timer_seconds,
      reserve_budget_per_slot,
      // Derby
      derby_enabled,
      derby_time_limit_seconds,
      derby_skipped_user_time_limit_seconds,
      derby_timeout_behavior,
    } = req.body;

    const draft = await getDraftById(parsedDraftId);
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Only allow core draft settings updates if draft hasn't started
    // But allow settings (like overnight pause) to be updated anytime
    const isCoreSettingsUpdate = draft_type || typeof third_round_reversal === 'boolean' || pick_time_seconds || rounds || timer_mode || team_time_budget_seconds;
    if (isCoreSettingsUpdate && draft.status !== "not_started") {
      this.respondBadRequest(res, "Cannot update draft type, rounds, or timer settings after draft has started");
      return;
    }

    // Validate timer mode if provided
    if (timer_mode && !["traditional", "chess"].includes(timer_mode)) {
      this.respondBadRequest(res, "Timer mode must be 'traditional' or 'chess'");
      return;
    }

    // Validate chess timer requirements
    const finalTimerMode = timer_mode || draft.timer_mode;
    const finalTimeBudget = team_time_budget_seconds !== undefined ? team_time_budget_seconds : draft.team_time_budget_seconds;

    if (finalTimerMode === "chess" && (!finalTimeBudget || finalTimeBudget <= 0)) {
      this.respondBadRequest(res, "Chess timer mode requires a positive team_time_budget_seconds value");
      return;
    }

    // Check if user is commissioner
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, draft.league_id);
    if (!auth) {
      this.respondForbidden(res, "Only the commissioner can update draft settings");
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

    // Track if draft time was changed for system message
    let draftTimeChanged = false;
    let newDraftTime: Date | null = null;

    // Scheduling
    if (scheduled_start_time !== undefined) {
      const oldTime = draft.scheduled_start_time;
      newDraftTime = scheduled_start_time ? new Date(scheduled_start_time) : null;
      updates.scheduled_start_time = newDraftTime;

      // Check if the time actually changed
      const oldTimeStr = oldTime ? oldTime.toISOString() : null;
      const newTimeStr = newDraftTime ? newDraftTime.toISOString() : null;
      if (oldTimeStr !== newTimeStr) {
        draftTimeChanged = true;
      }
    }
    if (typeof auto_start === 'boolean') updates.auto_start = auto_start;

    // Auction
    if (starting_budget !== undefined) updates.starting_budget = starting_budget;
    if (min_bid !== undefined) updates.min_bid = min_bid;
    if (bid_increment !== undefined) updates.bid_increment = bid_increment;
    if (nominations_per_manager !== undefined) updates.nominations_per_manager = nominations_per_manager;
    if (nomination_timer_hours !== undefined) updates.nomination_timer_hours = nomination_timer_hours;
    if (bid_timer_seconds !== undefined) updates.bid_timer_seconds = bid_timer_seconds;
    if (reserve_budget_per_slot !== undefined) updates.reserve_budget_per_slot = reserve_budget_per_slot;

    // Derby - track changes for system message
    const derbyChanges: Array<{ field: string; label: string; oldValue: any; newValue: any }> = [];

    if (typeof derby_enabled === 'boolean' && derby_enabled !== draft.derby_enabled) {
      derbyChanges.push({
        field: 'derby_enabled',
        label: 'Derby Enabled',
        oldValue: draft.derby_enabled ? 'Yes' : 'No',
        newValue: derby_enabled ? 'Yes' : 'No',
      });
      updates.derby_enabled = derby_enabled;
    }

    if (derby_time_limit_seconds !== undefined && derby_time_limit_seconds !== draft.derby_time_limit_seconds) {
      derbyChanges.push({
        field: 'derby_time_limit_seconds',
        label: 'Derby Time Limit',
        oldValue: `${draft.derby_time_limit_seconds || 120}s`,
        newValue: `${derby_time_limit_seconds}s`,
      });
      updates.derby_time_limit_seconds = derby_time_limit_seconds;
    }

    if (derby_skipped_user_time_limit_seconds !== undefined && derby_skipped_user_time_limit_seconds !== draft.derby_skipped_user_time_limit_seconds) {
      derbyChanges.push({
        field: 'derby_skipped_user_time_limit_seconds',
        label: 'Derby Skipped User Time Limit',
        oldValue: `${draft.derby_skipped_user_time_limit_seconds || 60}s`,
        newValue: `${derby_skipped_user_time_limit_seconds}s`,
      });
      updates.derby_skipped_user_time_limit_seconds = derby_skipped_user_time_limit_seconds;
    }

    if (derby_timeout_behavior && derby_timeout_behavior !== draft.derby_timeout_behavior) {
      derbyChanges.push({
        field: 'derby_timeout_behavior',
        label: 'Derby Timeout Behavior',
        oldValue: draft.derby_timeout_behavior || 'skip',
        newValue: derby_timeout_behavior,
      });
      updates.derby_timeout_behavior = derby_timeout_behavior;
    }

    const updatedDraft = await updateDraft(parsedDraftId, updates);

    // Send system message to league chat if draft time was changed
    if (draftTimeChanged) {
      let message: string;
      if (newDraftTime) {
        // Format the date/time for display in EST/EDT timezone (no timezone abbreviation)
        const dateStr = newDraftTime.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York'
        });

        message = `Draft scheduled for ${dateStr}`;
      } else {
        message = 'Draft time has been cleared';
      }

      const io = eventBus.getSocketIOInstance();
      await sendCollapsibleSystemMessageSafe(io, draft.league_id, message, 'draft_time_update', {
        draft_id: draft.id,
        scheduled_start_time: newDraftTime,
      });
    }

    // Send system message to league chat if derby settings were changed
    if (derbyChanges.length > 0) {
      const io = eventBus.getSocketIOInstance();
      await sendCollapsibleSystemMessageSafe(io, draft.league_id, 'Derby settings updated', 'derby_settings_update', {
        changes: derbyChanges,
      });
    }

    this.respondSuccess(res, updatedDraft);
  });

  /**
   * Get draft by league ID
   * GET /api/leagues/:leagueId/draft
   */
  getDraftByLeagueHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const parsedLeagueId = this.validateId(req.params.leagueId, "League ID");
    const userId = this.getAuthenticatedUserId(req);

    logger.info('[Draft] getDraftByLeagueHandler called', {
      leagueId: parsedLeagueId,
      userId,
      authenticated: !!userId,
    });

    const draft = await getDraftByLeagueId(parsedLeagueId);

    if (!draft) {
      this.respondNotFound(res, "Draft not found for this league");
      return;
    }

    this.respondSuccess(res, draft);
  });

  /**
   * Start a draft
   * POST /api/drafts/:draftId/start
   */
  startDraftHandler = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    await setTransactionTimeouts(client);

    try {
      await client.query('BEGIN');

      // Set transaction timeout to prevent hung queries on FOR UPDATE
      await client.query(`SET LOCAL statement_timeout = '${TRANSACTION_TIMEOUTS.DRAFT_PICK}'`);

      const { draftId } = req.params;

      // Lock the draft row to prevent concurrent state changes
      const draftResult = await client.query(
        'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId]
      );

      if (draftResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "Draft not found",
        });
        return;
      }

      const draft = draftResult.rows[0];

      // Check if user is commissioner
      const userId = req.user?.userId;
      if (!userId) {
        await client.query('ROLLBACK');
        res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
        return;
      }

      // Check if already started
      if (draft.status !== "not_started") {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: "Draft has already started",
        });
        return;
      }

      const league = await getLeagueById(draft.league_id);

      if (!league) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "League not found",
        });
        return;
      }

      // Validate commissioner access (check against league commissioner_id)
      const commissionerId = league.settings?.commissioner_id;
      if (!commissionerId || commissionerId !== userId) {
        await client.query('ROLLBACK');
        res.status(403).json({
          success: false,
          message: "Only the commissioner can start the draft",
        });
        return;
      }

      // For auction drafts, start is simpler - just set status
      if (draft.draft_type === "auction" || draft.draft_type === "slow_auction") {
        // Get first roster for turn tracking using draft order
        const draftOrder = await getDraftOrder(parseInt(draftId));
        let firstRosterId = null;

        if (draftOrder.length > 0) {
          // Use draft order (sorted by draft_position)
          const orderedRosters = draftOrder.sort((a, b) => a.draft_position - b.draft_position);
          firstRosterId = orderedRosters[0].roster_id;
        } else {
          // Fallback: use rosters sorted by roster_id if no draft order exists
          const { getRostersByLeagueId } = await import("../models/Roster");
          const rosters = await getRostersByLeagueId(draft.league_id);
          rosters.sort((a, b) => a.roster_id - b.roster_id);
          firstRosterId = rosters.length > 0 ? rosters[0].id : null;
        }

        // Start the draft using transaction client
        const updateDraftResult = await client.query(
          `UPDATE drafts
           SET status = 'in_progress',
               started_at = CURRENT_TIMESTAMP,
               current_roster_id = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [firstRosterId, draftId]
        );
        const updatedDraft = updateDraftResult.rows[0];

        // Commit transaction
        await client.query('COMMIT');

        // Update league status to 'drafting'
        if (league) {
          await updateLeague(league.id, { status: "drafting" });
        }

        // Emit draft status change via WebSocket
        // TODO: Update emitDraftStatusChange to accept IEventBus instead of Server
        const io = eventBus.getSocketIOInstance();
        emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

        // For regular auctions (not slow), start turn timer
        if (draft.draft_type === "auction" && firstRosterId) {
          const { scheduleTurnTimer } = await import("../socket/auctionSocket");
          scheduleTurnTimer(io, parseInt(draftId), firstRosterId, draft.pick_time_seconds);
        }

        res.status(200).json({
          success: true,
          data: updatedDraft,
        });
        return;
      }

      // For snake/linear drafts, check draft order and set current pick
      const draftOrder = await getDraftOrder(parseInt(draftId));
      if (draftOrder.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: "Draft order must be set before starting",
        });
        return;
      }

      // Calculate first roster to pick
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

      // Set pick deadline for first pick
      const pickDeadline = new Date();
      pickDeadline.setSeconds(pickDeadline.getSeconds() + draft.pick_time_seconds);

      // Update draft_order with deadline for first pick using transaction client
      await client.query(
        `UPDATE draft_order
         SET pick_expiration = $1, pick_number = $2
         WHERE draft_id = $3 AND roster_id = $4`,
        [pickDeadline, 1, draftId, firstRosterId]
      );

      // Start the draft using transaction client
      const updateDraftResult = await client.query(
        `UPDATE drafts
         SET status = 'in_progress',
             started_at = CURRENT_TIMESTAMP,
             current_pick = 1,
             current_round = 1,
             current_roster_id = $1,
             pick_deadline = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [firstRosterId, pickDeadline, draftId]
      );
      const updatedDraft = updateDraftResult.rows[0];

      // Commit transaction
      await client.query('COMMIT');

      // Update league status to 'drafting'
      if (league) {
        await updateLeague(league.id, { status: "drafting" });
      }

      // Start timer broadcast and emit draft status change
      // TODO: Update startTimerBroadcast and emitDraftStatusChange to accept IEventBus
      const io = eventBus.getSocketIOInstance();
      startTimerBroadcast(io, parseInt(draftId));
      emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

      // Broadcast initial timer state
      eventBus.emitToRoom(`draft_${draftId}`, "draft_started", {
        draft: updatedDraft,
        deadline: pickDeadline.toISOString(),
        server_time: new Date().toISOString(),
      });

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
      await client.query('ROLLBACK');

      // Handle transaction timeout errors
      if (error.code === DB_ERROR_CODES.STATEMENT_TIMEOUT) {
        logger.error("Draft start operation timed out", { error: error.message });
        res.status(504).json({
          success: false,
          message: `Draft operation timed out - please retry`,
          code: 'STATEMENT_TIMEOUT',
        });
        return;
      }

      logger.error("Error starting draft", { error });
      res.status(500).json({
        success: false,
        message: error.message || "Error starting draft",
      });
    } finally {
      client.release();
    }
  };

  /**
   * Pause draft
   * POST /api/drafts/:draftId/pause
   */
  pauseDraftHandler = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    await setTransactionTimeouts(client);

    try {
      await client.query('BEGIN');

      const { draftId } = req.params;

      // Lock the draft row to prevent concurrent state changes
      const draftResult = await client.query(
        'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId]
      );

      if (draftResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "Draft not found",
        });
        return;
      }

      const draft = draftResult.rows[0];

      // Check if user is commissioner
      const userId = req.user?.userId;
      if (!userId) {
        await client.query('ROLLBACK');
        res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
        return;
      }

      const league = await getLeagueById(draft.league_id);
      if (!league) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "League not found",
        });
        return;
      }

      const commissionerId = league.settings?.commissioner_id;
      if (!commissionerId || commissionerId !== userId) {
        await client.query('ROLLBACK');
        res.status(403).json({
          success: false,
          message: "Only the commissioner can pause the draft",
        });
        return;
      }

      if (draft.status !== "in_progress") {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: "Draft is not in progress",
        });
        return;
      }

      // Calculate remaining time from pick_deadline
      let pausedTimeRemaining = null;
      if (draft.pick_deadline) {
        const now = new Date();
        const deadline = new Date(draft.pick_deadline);
        const remainingMs = deadline.getTime() - now.getTime();
        pausedTimeRemaining = Math.max(0, Math.ceil(remainingMs / 1000)); // Convert to seconds, round up
      }

      // Pause the draft using transaction client
      const updateDraftResult = await client.query(
        `UPDATE drafts
         SET status = 'paused',
             pick_deadline = NULL,
             paused_time_remaining_seconds = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [draftId, pausedTimeRemaining]
      );
      const updatedDraft = updateDraftResult.rows[0];

      // Commit transaction
      await client.query('COMMIT');

      // Stop timer broadcasts
      stopTimerBroadcast(parseInt(draftId));

      // Stop auto-pick monitoring when paused
      stopAutoPickMonitoring(parseInt(draftId));

      // Cancel turn timer for auctions
      if (draft.draft_type === "auction" || draft.draft_type === "slow_auction") {
        const { cancelTurnTimer } = await import("../socket/auctionSocket");
        cancelTurnTimer(parseInt(draftId));
      }

      // Emit draft status change via WebSocket
      const io = eventBus.getSocketIOInstance();
      emitDraftStatusChange(io, parseInt(draftId), "paused", updatedDraft);

      eventBus.emitToRoom(`draft_${draftId}`, "draft_paused", {
        draft: updatedDraft,
      });

      res.status(200).json({
        success: true,
        data: updatedDraft,
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error("Error pausing draft", { error });
      res.status(500).json({
        success: false,
        message: error.message || "Error pausing draft",
      });
    } finally {
      client.release();
    }
  };

  /**
   * Resume draft
   * POST /api/drafts/:draftId/resume
   */
  resumeDraftHandler = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    await setTransactionTimeouts(client);

    try {
      await client.query('BEGIN');

      const { draftId } = req.params;

      // Lock the draft row to prevent concurrent state changes
      const draftResult = await client.query(
        'SELECT * FROM drafts WHERE id = $1 FOR UPDATE',
        [draftId]
      );

      if (draftResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "Draft not found",
        });
        return;
      }

      const draft = draftResult.rows[0];

      // Check if user is commissioner
      const userId = req.user?.userId;
      if (!userId) {
        await client.query('ROLLBACK');
        res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
        return;
      }

      const league = await getLeagueById(draft.league_id);
      if (!league) {
        await client.query('ROLLBACK');
        res.status(404).json({
          success: false,
          message: "League not found",
        });
        return;
      }

      const commissionerId = league.settings?.commissioner_id;
      if (!commissionerId || commissionerId !== userId) {
        await client.query('ROLLBACK');
        res.status(403).json({
          success: false,
          message: "Only the commissioner can resume the draft",
        });
        return;
      }

      if (draft.status !== "paused") {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: "Draft is not paused",
        });
        return;
      }

      // Calculate new deadline based on remaining time saved when paused
      let newDeadline: Date;

      if (draft.paused_time_remaining_seconds != null && draft.paused_time_remaining_seconds > 0) {
        // Resume from saved remaining time (minimum 10 seconds)
        const resumeSeconds = Math.max(draft.paused_time_remaining_seconds, 10);
        newDeadline = new Date(Date.now() + resumeSeconds * 1000);
        logger.info('[Resume] Restoring timer from paused state', {
          resume_seconds: resumeSeconds,
        });
      } else {
        // No saved time, use full pick time
        newDeadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
        logger.info('[Resume] No paused time found, using full pick time', {
          pick_time_seconds: draft.pick_time_seconds,
        });
      }

      // Update draft_order with new deadline using transaction client
      await client.query(
        `UPDATE draft_order
         SET pick_expiration = $1
         WHERE draft_id = $2 AND pick_number = $3`,
        [newDeadline, draftId, draft.current_pick]
      );

      // Resume the draft using transaction client (clear paused time)
      const updateDraftResult = await client.query(
        `UPDATE drafts
         SET status = 'in_progress',
             pick_deadline = $1,
             paused_time_remaining_seconds = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newDeadline, draftId]
      );
      const updatedDraft = updateDraftResult.rows[0];

      // Commit transaction
      await client.query('COMMIT');

      // TODO: Update startTimerBroadcast and emitDraftStatusChange to accept IEventBus
      const io = eventBus.getSocketIOInstance();

      // Restart timer broadcasts
      startTimerBroadcast(io, parseInt(draftId));

      // Restart auto-pick monitoring when resumed
      startAutoPickMonitoring(parseInt(draftId));

      // Restart turn timer for auctions
      if ((draft.draft_type === "auction" || draft.draft_type === "slow_auction") && updatedDraft.current_roster_id) {
        const { scheduleTurnTimer } = await import("../socket/auctionSocket");
        scheduleTurnTimer(io, parseInt(draftId), updatedDraft.current_roster_id, draft.pick_time_seconds);
      }

      // Emit draft status change via WebSocket
      emitDraftStatusChange(io, parseInt(draftId), "in_progress", updatedDraft);

      eventBus.emitToRoom(`draft_${draftId}`, "draft_resumed", {
        draft: updatedDraft,
        deadline: newDeadline.toISOString(),
        server_time: new Date().toISOString(),
      });

      res.status(200).json({
        success: true,
        data: updatedDraft,
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error("Error resuming draft", { error });
      res.status(500).json({
        success: false,
        message: error.message || "Error resuming draft",
      });
    } finally {
      client.release();
    }
  };

  /**
   * Manually trigger roster assignment from draft picks
   * POST /api/drafts/:draftId/assign-rosters
   */
  assignRostersHandler = this.asyncHandler(async (req: Request, res: Response) => {
    logger.info('[AssignRostersHandler] Manually triggering roster assignment', {
      draft_id: req.params.draftId,
    });

    const { assignDraftedPlayersToRosters } = await import("../models/Draft");
    await assignDraftedPlayersToRosters(parseInt(req.params.draftId));

    logger.info('[AssignRostersHandler] Roster assignment completed successfully', {
      draft_id: req.params.draftId,
    });

    this.respondSuccess(res, null, "Rosters assigned successfully");
  });

  /**
   * Reset draft - clears all picks and resets to not_started
   * POST /api/drafts/:draftId/reset
   */
  resetDraftHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const parsedDraftId = this.validateId(req.params.draftId, "Draft ID");

    const draft = await getDraftById(parsedDraftId);
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Check if user is commissioner
    const userId = this.getAuthenticatedUserId(req);
    if (!userId) {
      this.respondUnauthorized(res, "User not authenticated");
      return;
    }

    // Validate commissioner access
    const auth = await this.validateCommissionerAccess(req, draft.league_id);
    if (!auth) {
      this.respondForbidden(res, "Only the commissioner can reset the draft");
      return;
    }

    // Stop auto-pick monitoring
    stopAutoPickMonitoring(parsedDraftId);

    // Reset the draft
    const updatedDraft = await resetDraft(parsedDraftId);

    // Emit draft status change via WebSocket
    // TODO: Update emitDraftStatusChange to accept IEventBus instead of Server
    const io = eventBus.getSocketIOInstance();
    emitDraftStatusChange(io, parsedDraftId, "not_started", updatedDraft);

    this.respondSuccess(res, updatedDraft);
  });

  /**
   * Get draft health status
   * GET /api/drafts/:draftId/health
   */
  getDraftHealthHandler = this.asyncHandler(async (req: Request, res: Response) => {
    const parsedDraftId = this.validateId(req.params.draftId, "Draft ID");

    const draft = await getDraftById(parsedDraftId);
    if (!draft) {
      this.respondNotFound(res, "Draft not found");
      return;
    }

    // Check for issues
    const issues: string[] = [];

    // Check if stuck (hasn't progressed in >10 minutes while in_progress)
    if (draft.status === 'in_progress') {
      const lastUpdate = new Date(draft.updated_at);
      const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 60000;

      if (minutesSinceUpdate > 10) {
        issues.push(`Draft hasn't progressed in ${minutesSinceUpdate.toFixed(0)} minutes`);
      }
    }

    // Check for duplicate picks
    const duplicateCheck = await pool.query(
      `SELECT player_id, COUNT(*) as count
       FROM draft_picks
       WHERE draft_id = $1
       GROUP BY player_id
       HAVING COUNT(*) > 1`,
      [parsedDraftId]
    );

    if (duplicateCheck.rows.length > 0) {
      issues.push(`${duplicateCheck.rows.length} players drafted multiple times`);
    }

    // Check budget integrity for auctions
    if (draft.draft_type === 'auction' || draft.draft_type === 'slow_auction') {
      const budgetCheck = await pool.query(
        `SELECT r.id, r.settings->>'team_name' as team_name,
          COALESCE(SUM(ab.bid_amount), 0) as spent,
          $1 as budget
         FROM rosters r
         LEFT JOIN auction_bids ab ON ab.roster_id = r.id AND ab.is_winning = true
         WHERE r.league_id = (SELECT league_id FROM drafts WHERE id = $2)
         GROUP BY r.id
         HAVING COALESCE(SUM(ab.bid_amount), 0) > $1`,
        [draft.starting_budget, parsedDraftId]
      );

      if (budgetCheck.rows.length > 0) {
        issues.push(`${budgetCheck.rows.length} rosters exceeded budget`);
      }
    }

    this.respondSuccess(res, {
      draft,
      health: issues.length === 0 ? 'healthy' : 'issues_detected',
      issues,
    });
  });
}

const controller = new DraftController();

// Export handlers
export const createDraftHandler = controller.createDraftHandler;
export const getDraftHandler = controller.getDraftHandler;
export const updateDraftSettingsHandler = controller.updateDraftSettingsHandler;
export const getDraftByLeagueHandler = controller.getDraftByLeagueHandler;
export const startDraftHandler = controller.startDraftHandler;
export const pauseDraftHandler = controller.pauseDraftHandler;
export const resumeDraftHandler = controller.resumeDraftHandler;
export const assignRostersHandler = controller.assignRostersHandler;
export const resetDraftHandler = controller.resetDraftHandler;
export const getDraftHealthHandler = controller.getDraftHealthHandler;

// Line count before split: 1760 lines
// Line count after split: ~1117 lines
// Lines moved to other files: ~643 lines
//   - draftPickController.ts: ~580 lines (makeDraftPickHandler, getDraftPicksHandler, getAvailablePlayersHandler)
//   - draftOrderController.ts: ~145 lines (setDraftOrderHandler, getDraftOrderHandler)
//   - utils/draftCalculations.ts: ~69 lines (calculateCurrentRoster utility function)
