import { Server, Socket } from "socket.io";
import { logger } from "../config/logger";
import { IEventBus } from "../interfaces/IEventBus";

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
export function emitTradeProposed(eventBus: IEventBus, leagueId: number, trade: any) {
  eventBus.emitToRoom(`league_${leagueId}`, "trade_proposed", {
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
export function emitTradeProcessed(eventBus: IEventBus, leagueId: number, trade: any) {
  eventBus.emitToRoom(`league_${leagueId}`, "trade_processed", {
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
export function emitTradeRejected(eventBus: IEventBus, leagueId: number, trade: any) {
  eventBus.emitToRoom(`league_${leagueId}`, "trade_rejected", {
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
export function emitTradeCancelled(eventBus: IEventBus, leagueId: number, trade: any) {
  eventBus.emitToRoom(`league_${leagueId}`, "trade_cancelled", {
    trade,
    timestamp: new Date(),
  });
  logger.info(`Trade cancelled in league`, {
    trade_id: trade.id,
    league_id: leagueId,
    context: 'TradeSocket'
  });
}
