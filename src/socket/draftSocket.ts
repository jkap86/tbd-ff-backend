import { Server, Socket } from "socket.io";
import { createChatMessage } from "../models/DraftChatMessage";
import { getDraftById } from "../models/Draft";

export function setupDraftSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    /**
     * Join a draft room
     */
    socket.on("join_draft", async (data: { draft_id: number; user_id: number; username: string }) => {
      const { draft_id, user_id, username } = data;

      try {
        // Verify draft exists
        const draft = await getDraftById(draft_id);
        if (!draft) {
          socket.emit("error", { message: "Draft not found" });
          return;
        }

        // Join the draft room
        const roomName = `draft_${draft_id}`;
        socket.join(roomName);

        console.log(`User ${username} (${user_id}) joined draft ${draft_id}`);

        // Notify others in the room
        socket.to(roomName).emit("user_joined", {
          user_id,
          username,
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
          user_id,
          message: `${username} joined the draft`,
          message_type: "system",
        });

        io.to(roomName).emit("chat_message", systemMessage);
      } catch (error) {
        console.error("Error joining draft:", error);
        socket.emit("error", { message: "Error joining draft" });
      }
    });

    /**
     * Leave a draft room
     */
    socket.on("leave_draft", async (data: { draft_id: number; user_id: number; username: string }) => {
      const { draft_id, user_id, username } = data;

      const roomName = `draft_${draft_id}`;
      socket.leave(roomName);

      console.log(`User ${username} (${user_id}) left draft ${draft_id}`);

      // Notify others in the room
      socket.to(roomName).emit("user_left", {
        user_id,
        username,
        timestamp: new Date(),
      });

      // Send system message to chat
      try {
        const systemMessage = await createChatMessage({
          draft_id,
          user_id,
          message: `${username} left the draft`,
          message_type: "system",
        });

        io.to(roomName).emit("chat_message", systemMessage);
      } catch (error) {
        console.error("Error sending leave message:", error);
      }
    });

    /**
     * Send chat message
     */
    socket.on("send_chat_message", async (data: { draft_id: number; user_id: number; username: string; message: string }) => {
      const { draft_id, user_id, username, message } = data;

      try {
        // Save message to database
        const chatMessage = await createChatMessage({
          draft_id,
          user_id,
          message,
          message_type: "chat",
        });

        // Broadcast to all users in the draft room
        const roomName = `draft_${draft_id}`;
        io.to(roomName).emit("chat_message", {
          ...chatMessage,
          username, // Include username for display
        });
      } catch (error) {
        console.error("Error sending chat message:", error);
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

      try {
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
        console.error("Error getting draft state:", error);
        socket.emit("error", { message: "Error getting draft state" });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
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
