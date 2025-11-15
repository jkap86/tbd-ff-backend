import { Server, Socket } from "socket.io";
import { createLeagueChatMessage } from "../models/LeagueChatMessage";
import { getLeagueById } from "../models/League";
import { getRostersByLeagueId } from "../models/Roster";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware";
import { isUserLeagueMember } from "../utils/leagueAuthorization";
import { notifyLeagueChat } from "../services/notificationHelpers";
import { logger } from "../config/logger";
import validator from "validator";
import { IEventBus } from "../interfaces/IEventBus";

/**
 * Emit a league chat message to all users in a league room
 */
export function emitLeagueChat(eventBus: IEventBus, leagueId: number, chatMessage: any) {
  const roomName = `league_${leagueId}`;
  eventBus.emitToRoom(roomName, "league_chat_message", chatMessage);
}

export function setupLeagueSocket(io: Server) {
  // Apply authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      logger.error("Socket connected without user data", { socket_id: socket.id, context: 'LeagueSocket' });
      socket.disconnect();
      return;
    }

    logger.info("Socket connected", { socket_id: socket.id, username: user.username, user_id: user.userId, context: 'LeagueSocket' });

    /**
     * Join a league room
     */
    socket.on("join_league", async (data: { league_id: number; user_id: number; username: string }) => {
      const { league_id, user_id, username } = data;
      const user = socket.data.user!;

      try {
        // Verify the authenticated user matches the user_id in the request
        if (user.userId !== user_id) {
          logger.warn("User attempted to join league as different user", {
            authenticated_user: user.username,
            authenticated_user_id: user.userId,
            requested_user_id: user_id,
            context: 'LeagueSocket'
          });
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
          logger.warn("User denied access to league - not a member", {
            username: user.username,
            user_id: user.userId,
            league_id,
            context: 'LeagueSocket'
          });
          socket.emit("error", { message: "Access denied: You are not a member of this league" });
          return;
        }

        // Join the league room
        const roomName = `league_${league_id}`;
        socket.join(roomName);

        logger.info("User joined league", { username, user_id, league_id, context: 'LeagueSocket' });

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
        logger.error("Error joining league", { error, context: 'LeagueSocket' });
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
        logger.warn("User attempted to leave league as different user", {
          authenticated_user: user.username,
          authenticated_user_id: user.userId,
          requested_user_id: user_id,
          context: 'LeagueSocket'
        });
        socket.emit("error", { message: "Access denied: User ID mismatch" });
        return;
      }

      const roomName = `league_${league_id}`;
      socket.leave(roomName);

      logger.info("User left league", { username, user_id, league_id, context: 'LeagueSocket' });

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
      const { league_id, user_id, username } = data;
      let { message } = data;
      const user = socket.data.user!;

      try {
        // Sanitize message
        message = validator.escape(message);  // Escapes HTML characters
        message = message.trim();
        message = message.substring(0, 500);  // Limit length

        if (message.length === 0) {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        // Verify the authenticated user matches the user_id in the request
        if (user.userId !== user_id) {
          logger.warn("User attempted to send chat as different user", {
            authenticated_user: user.username,
            authenticated_user_id: user.userId,
            requested_user_id: user_id,
            context: 'LeagueSocket'
          });
          socket.emit("error", { message: "Access denied: User ID mismatch" });
          return;
        }

        // Verify user is a member of this league
        const isMember = await isUserLeagueMember(user.userId, league_id);
        if (!isMember) {
          logger.warn("User denied chat access to league", {
            username: user.username,
            user_id: user.userId,
            league_id,
            context: 'LeagueSocket'
          });
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

        // Send push notifications to league members (async, don't await)
        // Get league details and members for notifications
        getLeagueById(league_id)
          .then(async (league) => {
            if (!league) return;

            // Get all league members
            const rosters = await getRostersByLeagueId(league_id);
            const allMemberIds = rosters.map(r => r.user_id);

            // Filter out the sender
            const recipientIds = allMemberIds.filter(id => id !== user_id);

            // Create message preview (first 50 chars)
            const messagePreview = message.length > 50
              ? message.substring(0, 50) + '...'
              : message;

            // Send notification
            await notifyLeagueChat(
              recipientIds,
              username,
              messagePreview,
              league_id,
              league.name
            );
          })
          .catch((error) => {
            logger.error("Error sending chat notifications", { error, context: 'LeagueSocket' });
          });
      } catch (error) {
        logger.error("Error sending league chat message", { error, context: 'LeagueSocket' });
        socket.emit("error", { message: "Error sending message" });
      }
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      const user = socket.data.user;
      if (user) {
        logger.info("Socket disconnected", { socket_id: socket.id, username: user.username, user_id: user.userId, context: 'LeagueSocket' });
      } else {
        logger.info("Socket disconnected", { socket_id: socket.id, context: 'LeagueSocket' });
      }
    });
  });
}
