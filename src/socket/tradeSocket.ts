import { Server, Socket } from "socket.io";

export function setupTradeSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    // User joins their league room to receive trade updates
    socket.on("join_league", (leagueId: number) => {
      socket.join(`league_${leagueId}`);
      console.log(`[TradeSocket] Socket ${socket.id} joined league_${leagueId}`);
    });

    socket.on("leave_league", (leagueId: number) => {
      socket.leave(`league_${leagueId}`);
      console.log(`[TradeSocket] Socket ${socket.id} left league_${leagueId}`);
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
  console.log(`[TradeSocket] Trade ${trade.id} proposed in league ${leagueId}`);
}

/**
 * Emit trade accepted/processed event
 */
export function emitTradeProcessed(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_processed", {
    trade,
    timestamp: new Date(),
  });
  console.log(`[TradeSocket] Trade ${trade.id} processed in league ${leagueId}`);
}

/**
 * Emit trade rejected event
 */
export function emitTradeRejected(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_rejected", {
    trade,
    timestamp: new Date(),
  });
  console.log(`[TradeSocket] Trade ${trade.id} rejected in league ${leagueId}`);
}

/**
 * Emit trade cancelled event
 */
export function emitTradeCancelled(io: Server, leagueId: number, trade: any) {
  io.to(`league_${leagueId}`).emit("trade_cancelled", {
    trade,
    timestamp: new Date(),
  });
  console.log(`[TradeSocket] Trade ${trade.id} cancelled in league ${leagueId}`);
}
