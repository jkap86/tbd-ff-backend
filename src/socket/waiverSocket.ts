import { Server, Socket } from "socket.io";
import { logger } from "../config/logger";

/**
 * Waiver Socket Setup
 * Handles real-time waiver claim updates, processing notifications, and free agent pickups
 */
export function setupWaiverSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    /**
     * Join a waiver room for a specific league
     * All waiver-related events for this league will be broadcast to this room
     */
    socket.on("join_waiver_room", async (data: { league_id: number; user_id?: number; username?: string }) => {
      const { league_id, user_id, username } = data;

      try {
        const roomName = `waivers_${league_id}`;
        socket.join(roomName);

        logger.info(`${username ? `User ${username} (${user_id})` : `Socket ${socket.id}`} joined waiver room for league ${league_id}`, {
          league_id,
          user_id,
          username,
          socket_id: socket.id,
          context: 'WaiverSocket'
        });

        // Send confirmation to the user
        socket.emit("joined_waiver_room", {
          league_id,
          message: `Joined waiver room for league ${league_id}`,
          timestamp: new Date(),
        });

        // Optionally notify others in the room (can be disabled for privacy)
        // socket.to(roomName).emit("user_joined_waiver_room", {
        //   user_id,
        //   username,
        //   timestamp: new Date(),
        // });
      } catch (error) {
        logger.error("Error joining waiver room", { error, context: 'WaiverSocket' });
        socket.emit("error", { message: "Error joining waiver room" });
      }
    });

    /**
     * Leave a waiver room
     */
    socket.on("leave_waiver_room", (data: { league_id: number; user_id?: number; username?: string }) => {
      const { league_id, user_id, username } = data;

      const roomName = `waivers_${league_id}`;
      socket.leave(roomName);

      logger.info(`${username ? `User ${username} (${user_id})` : `Socket ${socket.id}`} left waiver room for league ${league_id}`, {
        league_id,
        user_id,
        username,
        socket_id: socket.id,
        context: 'WaiverSocket'
      });
    });

    /**
     * Request current waiver state (optional - for sync on reconnect)
     */
    socket.on("request_waiver_state", async (data: { league_id: number }) => {
      const { league_id } = data;

      try {
        // This would call the waiver service to get current state
        // For now, just acknowledge the request
        socket.emit("waiver_state_requested", {
          league_id,
          message: "Waiver state request received",
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error("Error getting waiver state", { error, context: 'WaiverSocket' });
        socket.emit("error", { message: "Error getting waiver state" });
      }
    });
  });
}

/**
 * Emit when a waiver claim is submitted
 * Called from the waiver service after a claim is successfully created
 */
export function emitClaimSubmitted(
  io: Server,
  leagueId: number,
  claim: any
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("claim_submitted", {
    league_id: leagueId,
    claim,
    timestamp: new Date(),
  });

  logger.info(`Waiver claim submitted in league ${leagueId}: Claim ID ${claim.id}`, {
    league_id: leagueId,
    claim_id: claim.id,
    context: 'WaiverSocket'
  });
}

/**
 * Emit when a waiver claim is cancelled
 * Called from the waiver service after a claim is successfully cancelled
 */
export function emitClaimCancelled(
  io: Server,
  leagueId: number,
  claimId: number,
  rosterId?: number
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("claim_cancelled", {
    league_id: leagueId,
    claim_id: claimId,
    roster_id: rosterId,
    timestamp: new Date(),
  });

  logger.info(`Waiver claim ${claimId} cancelled in league ${leagueId}`, {
    league_id: leagueId,
    claim_id: claimId,
    roster_id: rosterId,
    context: 'WaiverSocket'
  });
}

/**
 * Emit when waivers start processing
 * Called at the beginning of the waiver processing job
 */
export function emitWaiversProcessing(
  io: Server,
  leagueId: number
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("waivers_processing", {
    league_id: leagueId,
    status: "processing",
    timestamp: new Date(),
  });

  logger.info(`Waivers processing started for league ${leagueId}`, {
    league_id: leagueId,
    status: 'processing',
    context: 'WaiverSocket'
  });
}

/**
 * Emit when waivers finish processing
 * Called after all waiver claims have been processed
 */
export function emitWaiversProcessed(
  io: Server,
  leagueId: number,
  results: {
    successful: any[];
    failed: any[];
  }
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("waivers_processed", {
    league_id: leagueId,
    results,
    status: "completed",
    timestamp: new Date(),
  });

  logger.info(`Waivers processed for league ${leagueId}: ${results.successful.length} successful, ${results.failed.length} failed`, {
    league_id: leagueId,
    successful_count: results.successful.length,
    failed_count: results.failed.length,
    context: 'WaiverSocket'
  });
}

/**
 * Emit when a free agent is picked up
 * Called from the free agent pickup service after successful transaction
 */
export function emitFreeAgentAdded(
  io: Server,
  leagueId: number,
  transaction: any
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("free_agent_added", {
    league_id: leagueId,
    transaction,
    timestamp: new Date(),
  });

  logger.info(`Free agent added in league ${leagueId}: Player ${transaction.player_id} to roster ${transaction.roster_id}`, {
    league_id: leagueId,
    player_id: transaction.player_id,
    roster_id: transaction.roster_id,
    context: 'WaiverSocket'
  });
}

/**
 * Emit when a player is dropped
 * Called from the roster service after a player is successfully dropped
 */
export function emitPlayerDropped(
  io: Server,
  leagueId: number,
  transaction: any
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("player_dropped", {
    league_id: leagueId,
    transaction,
    timestamp: new Date(),
  });

  logger.info(`Player dropped in league ${leagueId}: Player ${transaction.player_id} from roster ${transaction.roster_id}`, {
    league_id: leagueId,
    player_id: transaction.player_id,
    roster_id: transaction.roster_id,
    context: 'WaiverSocket'
  });
}

/**
 * Emit when waiver priority changes
 * Called after waiver processing or manual priority adjustment
 */
export function emitWaiverPriorityChanged(
  io: Server,
  leagueId: number,
  priorities: Array<{ roster_id: number; priority: number }>
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit("waiver_priority_changed", {
    league_id: leagueId,
    priorities,
    timestamp: new Date(),
  });

  logger.info(`Waiver priorities updated for league ${leagueId}`, {
    league_id: leagueId,
    priority_count: priorities.length,
    context: 'WaiverSocket'
  });
}

/**
 * Generic waiver update emitter
 * Use this for custom waiver events not covered by specific emitters
 */
export function emitWaiverUpdate(
  io: Server,
  leagueId: number,
  event: string,
  data: any
) {
  const roomName = `waivers_${leagueId}`;
  io.to(roomName).emit(event, {
    league_id: leagueId,
    ...data,
    timestamp: new Date(),
  });

  logger.info(`Waiver event '${event}' emitted for league ${leagueId}`, {
    league_id: leagueId,
    event,
    context: 'WaiverSocket'
  });
}
