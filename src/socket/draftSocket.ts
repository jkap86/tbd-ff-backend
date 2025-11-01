import { Server, Socket } from "socket.io";
import { createChatMessage } from "../models/DraftChatMessage";
import { getDraftById } from "../models/Draft";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware";
import {
  isUserDraftParticipant,
  isUserDraftCommissioner,
  doesUserOwnRoster,
} from "../utils/draftAuthorization";
import validator from "validator";
import { SocketRateLimiter } from "../utils/socketRateLimiter";

export function setupDraftSocket(io: Server) {
  // Apply authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  // Create rate limiter for chat messages (500ms cooldown = max 2 messages per second)
  const chatLimiter = new SocketRateLimiter(500);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      console.error(`[DraftSocket] Socket connected without user data: ${socket.id}`);
      socket.disconnect();
      return;
    }

    console.log(`[DraftSocket] Socket connected: ${socket.id} - User: ${user.username} (${user.userId})`);

    /**
     * Join a draft room
     */
    socket.on("join_draft", async (data: { draft_id: number }) => {
      const { draft_id } = data;
      const user = socket.data.user!;

      try {
        // Verify draft exists
        const draft = await getDraftById(draft_id);
        if (!draft) {
          socket.emit("error", { message: "Draft not found" });
          return;
        }

        // Verify user is a participant in this draft
        const isParticipant = await isUserDraftParticipant(user.userId, draft_id);
        if (!isParticipant) {
          console.log(`[DraftSocket] User ${user.username} (${user.userId}) denied access to draft ${draft_id} - not a participant`);
          socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
          return;
        }

        // Join the draft room
        const roomName = `draft_${draft_id}`;
        socket.join(roomName);

        console.log(`[DraftSocket] User ${user.username} (${user.userId}) joined draft ${draft_id}`);

        // Notify others in the room
        socket.to(roomName).emit("user_joined", {
          user_id: user.userId,
          username: user.username,
          timestamp: new Date(),
        });

        // Send confirmation to the user
        socket.emit("joined_draft", {
          draft_id,
          message: `Joined draft ${draft_id}`,
        });

        // Send system message to chat
        const systemMessage = await createChatMessage({
          draft_id,
          user_id: user.userId,
          message: `${user.username} joined the draft`,
          message_type: "system",
        });

        io.to(roomName).emit("chat_message", systemMessage);
      } catch (error) {
        console.error("[DraftSocket] Error joining draft:", error);
        socket.emit("error", { message: "Error joining draft" });
      }
    });

    /**
     * Leave a draft room
     */
    socket.on("leave_draft", async (data: { draft_id: number }) => {
      const { draft_id } = data;
      const user = socket.data.user!;

      const roomName = `draft_${draft_id}`;
      socket.leave(roomName);

      console.log(`[DraftSocket] User ${user.username} (${user.userId}) left draft ${draft_id}`);

      // Notify others in the room
      socket.to(roomName).emit("user_left", {
        user_id: user.userId,
        username: user.username,
        timestamp: new Date(),
      });

      // Send system message to chat
      try {
        const systemMessage = await createChatMessage({
          draft_id,
          user_id: user.userId,
          message: `${user.username} left the draft`,
          message_type: "system",
        });

        io.to(roomName).emit("chat_message", systemMessage);
      } catch (error) {
        console.error("[DraftSocket] Error sending leave message:", error);
      }
    });

    /**
     * Send chat message
     */
    socket.on("send_chat_message", async (data: { draft_id: number; message: string }) => {
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

        // Verify user is a participant in this draft
        const isParticipant = await isUserDraftParticipant(user.userId, draft_id);
        if (!isParticipant) {
          console.log(`[DraftSocket] User ${user.username} (${user.userId}) denied chat access to draft ${draft_id}`);
          socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
          return;
        }

        // Save message to database
        const chatMessage = await createChatMessage({
          draft_id,
          user_id: user.userId,
          message,
          message_type: "chat",
        });

        // Broadcast to all users in the draft room
        const roomName = `draft_${draft_id}`;
        io.to(roomName).emit("chat_message", {
          ...chatMessage,
          username: user.username, // Include username for display
        });
      } catch (error) {
        console.error("[DraftSocket] Error sending chat message:", error);
        socket.emit("error", { message: "Error sending chat message" });
      }
    });

    /**
     * Broadcast draft pick (called by server after pick is made)
     */
    socket.on("draft_pick_made", (data: {
      draft_id: number;
      pick: any;
      draft: any;
    }) => {
      const { draft_id, pick, draft } = data;

      const roomName = `draft_${draft_id}`;
      io.to(roomName).emit("pick_made", {
        pick,
        draft,
        timestamp: new Date(),
      });

      console.log(`Pick made in draft ${draft_id}: ${pick.pick_number}`);
    });

    /**
     * Broadcast draft status change
     */
    socket.on("draft_status_changed", (data: {
      draft_id: number;
      status: string;
      draft: any;
    }) => {
      const { draft_id, status, draft } = data;

      const roomName = `draft_${draft_id}`;
      io.to(roomName).emit("status_changed", {
        status,
        draft,
        timestamp: new Date(),
      });

      console.log(`Draft ${draft_id} status changed to ${status}`);
    });

    /**
     * Broadcast timer update
     */
    socket.on("timer_update", (data: {
      draft_id: number;
      seconds_remaining: number;
      pick_deadline: Date;
    }) => {
      const { draft_id, seconds_remaining, pick_deadline } = data;

      const roomName = `draft_${draft_id}`;
      socket.to(roomName).emit("timer_tick", {
        seconds_remaining,
        pick_deadline,
        timestamp: new Date(),
      });
    });

    /**
     * Auto-pick notification
     */
    socket.on("auto_pick", (data: {
      draft_id: number;
      roster_id: number;
      player: any;
    }) => {
      const { draft_id, roster_id, player } = data;

      const roomName = `draft_${draft_id}`;
      io.to(roomName).emit("auto_pick_made", {
        roster_id,
        player,
        timestamp: new Date(),
      });

      console.log(`Auto-pick made in draft ${draft_id} for roster ${roster_id}`);
    });

    /**
     * Draft order set/randomized
     */
    socket.on("draft_order_set", (data: {
      draft_id: number;
      draft_order: any[];
    }) => {
      const { draft_id, draft_order } = data;

      const roomName = `draft_${draft_id}`;
      io.to(roomName).emit("order_updated", {
        draft_order,
        timestamp: new Date(),
      });

      console.log(`Draft order set for draft ${draft_id}`);
    });

    /**
     * Request current draft state
     */
    socket.on("request_draft_state", async (data: { draft_id: number }) => {
      const { draft_id } = data;
      const user = socket.data.user!;

      try {
        // Verify user is a participant in this draft
        const isParticipant = await isUserDraftParticipant(user.userId, draft_id);
        if (!isParticipant) {
          console.log(`[DraftSocket] User ${user.username} (${user.userId}) denied draft state access to draft ${draft_id}`);
          socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
          return;
        }

        const draft = await getDraftById(draft_id);
        if (!draft) {
          socket.emit("error", { message: "Draft not found" });
          return;
        }

        socket.emit("draft_state", {
          draft,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("[DraftSocket] Error getting draft state:", error);
        socket.emit("error", { message: "Error getting draft state" });
      }
    });

    /**
     * Toggle autodraft status
     */
    socket.on("toggle_autodraft", async (data: {
      draft_id: number;
      roster_id: number;
      is_autodrafting: boolean;
    }) => {
      const { draft_id, roster_id, is_autodrafting } = data;
      const user = socket.data.user!;

      try {
        // Verify user owns this roster or is the commissioner
        const ownsRoster = await doesUserOwnRoster(user.userId, roster_id, draft_id);
        const isCommissioner = await isUserDraftCommissioner(user.userId, draft_id);

        if (!ownsRoster && !isCommissioner) {
          console.log(`[DraftSocket] User ${user.username} (${user.userId}) denied autodraft toggle for roster ${roster_id} in draft ${draft_id}`);
          socket.emit("error", { message: "Access denied: You can only toggle autodraft for your own roster" });
          return;
        }

        const { toggleAutodraft } = await import("../models/DraftOrder");
        const updatedOrder = await toggleAutodraft(draft_id, roster_id, is_autodrafting);

        if (updatedOrder) {
          const roomName = `draft_${draft_id}`;

          // Broadcast to all users in the room
          io.to(roomName).emit("autodraft_toggled", {
            roster_id,
            is_autodrafting,
            username: user.username,
            timestamp: new Date(),
          });

          console.log(`[DraftSocket] Autodraft ${is_autodrafting ? 'enabled' : 'disabled'} for roster ${roster_id} in draft ${draft_id} by ${user.username}`);
        }
      } catch (error) {
        console.error("[DraftSocket] Error toggling autodraft:", error);
        socket.emit("error", { message: "Error toggling autodraft" });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      const user = socket.data.user;
      if (user) {
        console.log(`[DraftSocket] Socket disconnected: ${socket.id} - User: ${user.username} (${user.userId})`);
      } else {
        console.log(`[DraftSocket] Socket disconnected: ${socket.id}`);
      }
    });
  });
}

/**
 * Emit draft pick event from server-side code
 */
export function emitDraftPick(io: Server, draftId: number, pick: any, draft: any) {
  const roomName = `draft_${draftId}`;
  io.to(roomName).emit("pick_made", {
    pick,
    draft,
    timestamp: new Date(),
  });
}

/**
 * Emit draft status change from server-side code
 */
export function emitDraftStatusChange(io: Server, draftId: number, status: string, draft: any) {
  const roomName = `draft_${draftId}`;
  io.to(roomName).emit("status_changed", {
    status,
    draft,
    timestamp: new Date(),
  });
}

/**
 * Emit draft order update from server-side code
 */
export function emitDraftOrderUpdate(io: Server, draftId: number, draftOrder: any[]) {
  const roomName = `draft_${draftId}`;
  io.to(roomName).emit("order_updated", {
    draft_order: draftOrder,
    timestamp: new Date(),
  });
}

/**
 * Broadcast timer update with deadline timestamp
 * This is the source of truth for all clients to calculate remaining time
 */
export function broadcastTimerUpdate(io: Server, draftId: number, deadline: Date, pickNumber: number) {
  const roomName = `draft_${draftId}`;
  io.to(roomName).emit("timer_update", {
    deadline: deadline.toISOString(),
    pick_number: pickNumber,
    server_time: new Date().toISOString(),
  });
}

// Store interval IDs for cleanup
declare global {
  var draftTimerIntervals: { [key: number]: NodeJS.Timeout } | undefined;
}

/**
 * Determine the optimal interval based on remaining time
 * - > 60 seconds: Update every 10 seconds (low frequency)
 * - <= 60 seconds: Update every 1 second (high frequency)
 */
function getTimerInterval(secondsRemaining: number): number {
  if (secondsRemaining > 60) {
    return 10000; // 10 seconds
  } else {
    return 1000; // 1 second
  }
}

/**
 * Start periodic timer broadcasts for a draft
 * Uses dynamic intervals based on remaining time for optimal performance
 */
export async function startTimerBroadcast(io: Server, draftId: number) {
  const { getDraftById } = await import("../models/Draft");
  const pool = (await import("../config/database")).default;

  let currentInterval: number | null = null;
  let intervalId: NodeJS.Timeout;

  const broadcastTimer = async () => {
    try {
      const draft = await getDraftById(draftId);

      if (!draft || draft.status !== "in_progress") {
        console.log(`[TimerBroadcast] Draft ${draftId} is not in progress, stopping broadcast`);
        if (intervalId) {
          clearInterval(intervalId);
        }
        if (global.draftTimerIntervals) {
          delete global.draftTimerIntervals[draftId];
        }
        return;
      }

      // Query the current pick's deadline from draft_order
      const turn = await pool.query(
        `SELECT pick_expiration FROM draft_order
         WHERE draft_id = $1 AND pick_number = $2`,
        [draftId, draft.current_pick]
      );

      if (turn.rows.length > 0 && turn.rows[0].pick_expiration) {
        const deadline = new Date(turn.rows[0].pick_expiration);
        const secondsRemaining = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));

        // Broadcast the timer update
        broadcastTimerUpdate(
          io,
          draftId,
          deadline,
          draft.current_pick
        );

        // Determine if we need to change the interval
        const optimalInterval = getTimerInterval(secondsRemaining);

        if (currentInterval !== optimalInterval) {
          console.log(`[TimerBroadcast] Draft ${draftId}: Changing interval from ${currentInterval}ms to ${optimalInterval}ms (${secondsRemaining}s remaining)`);
          currentInterval = optimalInterval;

          // Clear the current interval and restart with new interval
          clearInterval(intervalId);
          intervalId = setInterval(broadcastTimer, optimalInterval);

          // Update stored interval ID
          if (global.draftTimerIntervals) {
            global.draftTimerIntervals[draftId] = intervalId;
          }
        }
      }

    } catch (error) {
      console.error("[TimerBroadcast] Error:", error);
    }
  };

  // Start with initial interval based on current time remaining
  try {
    const draft = await getDraftById(draftId);
    const pool = (await import("../config/database")).default;

    if (draft && draft.status === "in_progress") {
      const turn = await pool.query(
        `SELECT pick_expiration FROM draft_order
         WHERE draft_id = $1 AND pick_number = $2`,
        [draftId, draft.current_pick]
      );

      if (turn.rows.length > 0 && turn.rows[0].pick_expiration) {
        const deadline = new Date(turn.rows[0].pick_expiration);
        const secondsRemaining = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
        currentInterval = getTimerInterval(secondsRemaining);
        console.log(`[TimerBroadcast] Starting timer broadcast for draft ${draftId} with ${currentInterval}ms interval (${secondsRemaining}s remaining)`);
      } else {
        currentInterval = 10000; // Default to 10 seconds if no deadline
      }
    } else {
      currentInterval = 10000; // Default to 10 seconds
    }
  } catch (error) {
    console.error("[TimerBroadcast] Error determining initial interval:", error);
    currentInterval = 10000; // Default to 10 seconds on error
  }

  // Start the interval
  intervalId = setInterval(broadcastTimer, currentInterval);

  // Store interval ID for cleanup
  global.draftTimerIntervals = global.draftTimerIntervals || {};
  global.draftTimerIntervals[draftId] = intervalId;
}

/**
 * Stop timer broadcasts for a draft
 */
export function stopTimerBroadcast(draftId: number) {
  if (global.draftTimerIntervals?.[draftId]) {
    clearInterval(global.draftTimerIntervals[draftId]);
    delete global.draftTimerIntervals[draftId];
    console.log(`[TimerBroadcast] Stopped timer broadcast for draft ${draftId}`);
  }
}
