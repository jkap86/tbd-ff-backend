import { Server, Socket } from "socket.io";
import { logger } from "../config/logger";

export function setupTradeSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    // User joins their league room to receive trade updates
    socket.on("join_league", (leagueId: number) => {
      socket.join(`league_${leagueId}`);
      logger.info(`Socket joined league`, {
        socket_id: socket.id,
        league_id: leagueId,
        context: 'TradeSocket'
      });
    });

    socket.on("leave_league", (leagueId: number) => {
      socket.leave(`league_${leagueId}`);
      logger.info(`Socket left league`, {
        socket_id: socket.id,
        league_id: leagueId,
        context: 'TradeSocket'
      });
    });
  });
}

/**
 * Emit trade proposed event
 */
export function emitTradeProposed(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_proposed", {
    trade,
    timestamp: new Date(),
  });
  logger.info(`Trade proposed in league`, {
    trade_id: trade.id,
    league_id: leagueId,
    context: 'TradeSocket'
  });
}

/**
 * Emit trade accepted/processed event
 */
export function emitTradeProcessed(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_processed", {
    trade,
    timestamp: new Date(),
  });
  logger.info(`Trade processed in league`, {
    trade_id: trade.id,
    league_id: leagueId,
    context: 'TradeSocket'
  });
}

/**
 * Emit trade rejected event
 */
export function emitTradeRejected(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_rejected", {
    trade,
    timestamp: new Date(),
  });
  logger.info(`Trade rejected in league`, {
    trade_id: trade.id,
    league_id: leagueId,
    context: 'TradeSocket'
  });
}

/**
 * Emit trade cancelled event
 */
export function emitTradeCancelled(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_cancelled", {
    trade,
    timestamp: new Date(),
  });
  logger.info(`Trade cancelled in league`, {
    trade_id: trade.id,
    league_id: leagueId,
    context: 'TradeSocket'
  });
}
