import { Server, Socket } from "socket.io";

export function setupMatchupSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    /**
     * Join a league's matchup room for live score updates
     */
    socket.on(
      "join_league_matchups",
      async (data: { league_id: number; week: number }) => {
        const { league_id, week } = data;

        try {
          // Join the league-week room
          const roomName = `league_${league_id}_week_${week}`;
          socket.join(roomName);

          console.log(
            `[Socket] Client ${socket.id} joined ${roomName} for live scores`
          );

          // Send confirmation
          socket.emit("joined_matchup_room", {
            league_id,
            week,
            room: roomName,
            message: `Subscribed to live scores for league ${league_id} week ${week}`,
          });
        } catch (error) {
          console.error("[Socket] Error joining matchup room:", error);
          socket.emit("error", { message: "Failed to join matchup room" });
        }
      }
    );

    /**
     * Leave a league's matchup room
     */
    socket.on(
      "leave_league_matchups",
      async (data: { league_id: number; week: number }) => {
        const { league_id, week } = data;

        try {
          const roomName = `league_${league_id}_week_${week}`;
          socket.leave(roomName);

          console.log(
            `[Socket] Client ${socket.id} left ${roomName}`
          );

          socket.emit("left_matchup_room", {
            league_id,
            week,
            message: `Unsubscribed from league ${league_id} week ${week}`,
          });
        } catch (error) {
          console.error("[Socket] Error leaving matchup room:", error);
        }
      }
    );

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      console.log(`[Socket] Client ${socket.id} disconnected`);
    });
  });
}

/**
 * Broadcast score updates to all clients watching a specific league/week
 * Called by the scheduler when scores are updated
 */
export function broadcastScoreUpdate(
  io: Server,
  leagueId: number,
  week: number,
  matchups: any[]
) {
  const roomName = `league_${leagueId}_week_${week}`;

  console.log(
    `[Socket] Broadcasting score update to ${roomName} (${matchups.length} matchups)`
  );

  io.to(roomName).emit("matchup_scores_updated", {
    league_id: leagueId,
    week,
    matchups,
    timestamp: new Date(),
  });
}
