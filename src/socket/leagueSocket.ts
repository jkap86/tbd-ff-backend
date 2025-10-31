import { Server, Socket } from "socket.io";
import { createLeagueChatMessage } from "../models/LeagueChatMessage";
import { getLeagueById } from "../models/League";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware";
import { isUserLeagueMember } from "../utils/leagueAuthorization";

export function setupLeagueSocket(io: Server) {
  // Apply authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      console.error(`[LeagueSocket] Socket connected without user data: ${socket.id}`);
      socket.disconnect();
      return;
    }

    console.log(`[LeagueSocket] Socket connected: ${socket.id} - User: ${user.username} (${user.userId})`);

    /**
     * Join a league room
     */
    socket.on("join_league", async (data: { league_id: number; user_id: number; username: string }) => {
      const { league_id, user_id, username } = data;
      const user = socket.data.user!;

      try {
        // Verify the authenticated user matches the user_id in the request
        if (user.userId !== user_id) {
          console.log(`[LeagueSocket] User ${user.username} (${user.userId}) attempted to join league as different user ${user_id}`);
          socket.emit("error", { message: "Access denied: User ID mismatch" });
          return;
        }

        // Verify league exists
        const league = await getLeagueById(league_id);
        if (!league) {
          socket.emit("error", { message: "League not found" });
          return;
        }

        // Verify user is a member of this league
        const isMember = await isUserLeagueMember(user.userId, league_id);
        if (!isMember) {
          console.log(`[LeagueSocket] User ${user.username} (${user.userId}) denied access to league ${league_id} - not a member`);
          socket.emit("error", { message: "Access denied: You are not a member of this league" });
          return;
        }

        // Join the league room
        const roomName = `league_${league_id}`;
        socket.join(roomName);

        console.log(`[LeagueSocket] User ${username} (${user_id}) joined league ${league_id}`);

        // Notify others in the room
        socket.to(roomName).emit("user_joined_league", {
          user_id,
          username,
          timestamp: new Date(),
        });

        // Send confirmation to the user
        socket.emit("joined_league", {
          league_id,
          message: `Joined league ${league_id}`,
        });
      } catch (error) {
        console.error("[LeagueSocket] Error joining league:", error);
        socket.emit("error", { message: "Error joining league" });
      }
    });

    /**
     * Leave a league room
     */
    socket.on("leave_league", async (data: { league_id: number; user_id: number; username: string }) => {
      const { league_id, user_id, username } = data;
      const user = socket.data.user!;

      // Verify the authenticated user matches the user_id in the request
      if (user.userId !== user_id) {
        console.log(`[LeagueSocket] User ${user.username} (${user.userId}) attempted to leave league as different user ${user_id}`);
        socket.emit("error", { message: "Access denied: User ID mismatch" });
        return;
      }

      const roomName = `league_${league_id}`;
      socket.leave(roomName);

      console.log(`[LeagueSocket] User ${username} (${user_id}) left league ${league_id}`);

      // Notify others in the room
      socket.to(roomName).emit("user_left_league", {
        user_id,
        username,
        timestamp: new Date(),
      });
    });

    /**
     * Send league chat message
     */
    socket.on("send_league_chat_message", async (data: { league_id: number; user_id: number; username: string; message: string }) => {
      const { league_id, user_id, username, message } = data;
      const user = socket.data.user!;

      try {
        // Verify the authenticated user matches the user_id in the request
        if (user.userId !== user_id) {
          console.log(`[LeagueSocket] User ${user.username} (${user.userId}) attempted to send chat as different user ${user_id}`);
          socket.emit("error", { message: "Access denied: User ID mismatch" });
          return;
        }

        // Verify user is a member of this league
        const isMember = await isUserLeagueMember(user.userId, league_id);
        if (!isMember) {
          console.log(`[LeagueSocket] User ${user.username} (${user.userId}) denied chat access to league ${league_id}`);
          socket.emit("error", { message: "Access denied: You are not a member of this league" });
          return;
        }

        // Save message to database
        const chatMessage = await createLeagueChatMessage({
          league_id,
          user_id,
          message,
          message_type: "chat",
        });

        // Broadcast message to all users in the league room
        const roomName = `league_${league_id}`;
        io.to(roomName).emit("league_chat_message", {
          ...chatMessage,
          username,
        });
      } catch (error) {
        console.error("[LeagueSocket] Error sending league chat message:", error);
        socket.emit("error", { message: "Error sending message" });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      const user = socket.data.user;
      if (user) {
        console.log(`[LeagueSocket] Socket disconnected: ${socket.id} - User: ${user.username} (${user.userId})`);
      } else {
        console.log(`[LeagueSocket] Socket disconnected: ${socket.id}`);
      }
    });
  });
}
