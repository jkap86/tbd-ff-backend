import { Server, Socket } from "socket.io";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware";
import { SocketRateLimiter } from "../utils/socketRateLimiter";
import { logger } from "../config/logger";
import validator from "validator";
import {
  getOpponentSelectionDraftByLeague,
  getOpponentSelectionDraftPicksWithDetails,
} from "../models/OpponentSelectionDraft";
import { getOpponentSelectionOrder } from "../models/OpponentSelectionOrder";
import { getLeagueById } from "../models/League";

export function setupOpponentSelectionDraftSocket(io: Server) {
  // Apply authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  // Create rate limiter for chat messages (500ms cooldown = max 2 messages per second)
  const chatLimiter = new SocketRateLimiter(500);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      logger.error('Socket connected without user data', { socketId: socket.id, context: 'OpponentSelectionDraftSocket' });
      socket.disconnect();
      return;
    }

    logger.info('Socket connected', { socketId: socket.id, username: user.username, userId: user.userId, context: 'OpponentSelectionDraftSocket' });

    /**
     * Join an opponent selection draft room
     */
    socket.on("join_opponent_selection_draft", async (data: { draft_id: number; league_id: number }) => {
      const { draft_id, league_id } = data;
      const user = socket.data.user!;

      try {
        // Verify league exists
        const league = await getLeagueById(league_id);
        if (!league) {
          socket.emit("error", { message: "League not found" });
          return;
        }

        // Verify draft exists
        const draft = await getOpponentSelectionDraftByLeague(league_id);
        if (!draft || draft.id !== draft_id) {
          socket.emit("error", { message: "Opponent selection draft not found" });
          return;
        }

        // Join the draft room
        const roomName = `opponent_selection_draft_${draft_id}`;
        socket.join(roomName);

        logger.info('User joined opponent selection draft', { username: user.username, userId: user.userId, draftId: draft_id, context: 'OpponentSelectionDraftSocket' });

        // Notify others in the room
        socket.to(roomName).emit("user_joined", {
          user_id: user.userId,
          username: user.username,
          timestamp: new Date(),
        });

        // Send confirmation to the user
        socket.emit("joined_opponent_selection_draft", {
          draft_id,
          message: `Joined opponent selection draft ${draft_id}`,
        });
      } catch (error) {
        logger.error('Error joining opponent selection draft', { error, context: 'OpponentSelectionDraftSocket' });
        socket.emit("error", { message: "Error joining opponent selection draft" });
      }
    });

    /**
     * Leave an opponent selection draft room
     */
    socket.on("leave_opponent_selection_draft", async (data: { draft_id: number }) => {
      const { draft_id } = data;
      const user = socket.data.user!;

      const roomName = `opponent_selection_draft_${draft_id}`;
      socket.leave(roomName);

      logger.info('User left opponent selection draft', { username: user.username, userId: user.userId, draftId: draft_id, context: 'OpponentSelectionDraftSocket' });

      // Notify others in the room
      socket.to(roomName).emit("user_left", {
        user_id: user.userId,
        username: user.username,
        timestamp: new Date(),
      });
    });

    /**
     * Send chat message
     */
    socket.on("send_opponent_selection_chat", async (data: { draft_id: number; league_id: number; message: string }) => {
      const { draft_id } = data;
      let { message } = data;
      const user = socket.data.user!;

      // Rate limiting check
      if (!chatLimiter.canProceed(user.userId)) {
        socket.emit("rate_limit_error", { message: "Please slow down" });
        return;
      }

      try {
        // Sanitize message
        message = validator.escape(message);  // Escapes HTML characters
        message = message.trim();
        message = message.substring(0, 500);  // Limit length

        if (message.length === 0) {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        // Broadcast to all users in the draft room
        const roomName = `opponent_selection_draft_${draft_id}`;
        io.to(roomName).emit("chat_message", {
          user_id: user.userId,
          username: user.username,
          message,
          message_type: "chat",
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Error sending chat message', { error, context: 'OpponentSelectionDraftSocket' });
        socket.emit("error", { message: "Error sending chat message" });
      }
    });

    /**
     * Request current draft state
     */
    socket.on("request_opponent_selection_draft_state", async (data: { draft_id: number; league_id: number }) => {
      const { draft_id, league_id } = data;

      try {
        const draft = await getOpponentSelectionDraftByLeague(league_id);
        if (!draft || draft.id !== draft_id) {
          socket.emit("error", { message: "Opponent selection draft not found" });
          return;
        }

        // Get picks and selection order
        const picks = await getOpponentSelectionDraftPicksWithDetails(draft_id);
        const selectionOrder = await getOpponentSelectionOrder(league_id);

        socket.emit("opponent_selection_draft_state", {
          draft,
          picks,
          selectionOrder,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Error getting opponent selection draft state', { error, context: 'OpponentSelectionDraftSocket' });
        socket.emit("error", { message: "Error getting opponent selection draft state" });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      const user = socket.data.user;
      if (user) {
        logger.info('Socket disconnected', { socketId: socket.id, username: user.username, userId: user.userId, context: 'OpponentSelectionDraftSocket' });
      } else {
        logger.info('Socket disconnected', { socketId: socket.id, context: 'OpponentSelectionDraftSocket' });
      }
    });
  });
}

/**
 * Emit opponent selection pick event from server-side code
 */
export function emitOpponentSelectionPick(
  io: Server,
  draftId: number,
  pick: any,
  draft: any
) {
  const roomName = `opponent_selection_draft_${draftId}`;
  io.to(roomName).emit("pick_made", {
    pick,
    draft,
    timestamp: new Date(),
  });

  logger.info('Opponent selection pick made', {
    draftId,
    pickNumber: pick.pick_number,
    context: 'OpponentSelectionDraftSocket'
  });
}

/**
 * Emit opponent selection draft status change from server-side code
 */
export function emitOpponentSelectionDraftStatusChange(
  io: Server,
  draftId: number,
  status: string,
  draft: any
) {
  const roomName = `opponent_selection_draft_${draftId}`;
  io.to(roomName).emit("status_changed", {
    status,
    draft,
    timestamp: new Date(),
  });

  logger.info('Opponent selection draft status changed', {
    draftId,
    status,
    context: 'OpponentSelectionDraftSocket'
  });
}

/**
 * Broadcast timer update with deadline timestamp
 * This is the source of truth for all clients to calculate remaining time
 */
export function broadcastOpponentSelectionTimerUpdate(
  io: Server,
  draftId: number,
  deadline: Date,
  pickNumber: number
) {
  const roomName = `opponent_selection_draft_${draftId}`;
  io.to(roomName).emit("timer_update", {
    deadline: deadline.toISOString(),
    pick_number: pickNumber,
    server_time: new Date().toISOString(),
  });
}

// Store interval IDs for cleanup
declare global {
  var opponentSelectionDraftTimerIntervals: { [key: number]: NodeJS.Timeout } | undefined;
}

/**
 * Determine the optimal interval based on remaining time
 */
function getTimerInterval(secondsRemaining: number): number {
  if (secondsRemaining > 60) {
    return 10000; // 10 seconds
  } else {
    return 1000; // 1 second
  }
}

/**
 * Start periodic timer broadcasts for an opponent selection draft
 */
export async function startOpponentSelectionTimerBroadcast(io: Server, draftId: number, leagueId: number) {
  let currentInterval: number | null = null;
  let intervalId: NodeJS.Timeout;

  const broadcastTimer = async () => {
    try {
      const draft = await getOpponentSelectionDraftByLeague(leagueId);

      if (!draft || draft.id !== draftId || draft.status !== "in_progress") {
        logger.info('Opponent selection draft not in progress, stopping timer broadcast', { draftId, context: 'OpponentSelectionTimerBroadcast' });
        if (intervalId) {
          clearInterval(intervalId);
        }
        if (global.opponentSelectionDraftTimerIntervals) {
          delete global.opponentSelectionDraftTimerIntervals[draftId];
        }
        return;
      }

      // Calculate time remaining based on time limit
      // TODO: Implement pick_expiration tracking similar to draft_order
      const timeLimitSeconds = draft.time_limit_seconds || 120;
      const secondsRemaining = timeLimitSeconds; // Placeholder

      // Broadcast the timer update
      const deadline = new Date(Date.now() + secondsRemaining * 1000);
      broadcastOpponentSelectionTimerUpdate(io, draftId, deadline, 0); // TODO: Track pick number

      // Determine if we need to change the interval
      const optimalInterval = getTimerInterval(secondsRemaining);

      if (currentInterval !== optimalInterval) {
        logger.info('Changing opponent selection timer interval', {
          draftId,
          fromMs: currentInterval,
          toMs: optimalInterval,
          secondsRemaining,
          context: 'OpponentSelectionTimerBroadcast'
        });
        currentInterval = optimalInterval;

        // Clear the current interval and restart with new interval
        clearInterval(intervalId);
        intervalId = setInterval(broadcastTimer, optimalInterval);

        // Update stored interval ID
        if (global.opponentSelectionDraftTimerIntervals) {
          global.opponentSelectionDraftTimerIntervals[draftId] = intervalId;
        }
      }
    } catch (error) {
      logger.error('Opponent selection timer broadcast error', { error, context: 'OpponentSelectionTimerBroadcast' });
    }
  };

  // Start with initial interval
  currentInterval = 1000; // Start with 1 second
  intervalId = setInterval(broadcastTimer, currentInterval);

  // Store interval ID for cleanup
  global.opponentSelectionDraftTimerIntervals = global.opponentSelectionDraftTimerIntervals || {};
  global.opponentSelectionDraftTimerIntervals[draftId] = intervalId;

  logger.info('Started opponent selection timer broadcast', {
    draftId,
    intervalMs: currentInterval,
    context: 'OpponentSelectionTimerBroadcast'
  });
}

/**
 * Stop timer broadcasts for an opponent selection draft
 */
export function stopOpponentSelectionTimerBroadcast(draftId: number) {
  if (global.opponentSelectionDraftTimerIntervals?.[draftId]) {
    clearInterval(global.opponentSelectionDraftTimerIntervals[draftId]);
    delete global.opponentSelectionDraftTimerIntervals[draftId];
    logger.info('Stopped opponent selection timer broadcast', { draftId, context: 'OpponentSelectionTimerBroadcast' });
  }
}
