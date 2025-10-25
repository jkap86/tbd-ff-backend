import { Server, Socket } from "socket.io";
import { createLeagueChatMessage } from "../models/LeagueChatMessage";
import { getLeagueById } from "../models/League";

export function setupLeagueSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    /**
     * Join a league room
     */
    socket.on("join_league", async (data: { league_id: number; user_id: number; username: string }) => {
      const { league_id, user_id, username } = data;

      try {
        // Verify league exists
        const league = await getLeagueById(league_id);
        if (!league) {
          socket.emit("error", { message: "League not found" });
          return;
        }

        // Join the league room
        const roomName = `league_${league_id}`;
        socket.join(roomName);

        console.log(`User ${username} (${user_id}) joined league ${league_id}`);

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
        console.error("Error joining league:", error);
        socket.emit("error", { message: "Error joining league" });
      }
    });

    /**
     * Leave a league room
     */
    socket.on("leave_league", async (data: { league_id: number; user_id: number; username: string }) => {
      const { league_id, user_id, username } = data;

      const roomName = `league_${league_id}`;
      socket.leave(roomName);

      console.log(`User ${username} (${user_id}) left league ${league_id}`);

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

      try {
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
        console.error("Error sending league chat message:", error);
        socket.emit("error", { message: "Error sending message" });
      }
    });
  });
}
