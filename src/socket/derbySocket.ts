import { Server } from "socket.io";
import { DraftDerbySelection } from "../models/DraftDerby";

let io: Server;

export function setDerbySocketIO(socketIO: Server) {
  io = socketIO;
}

/**
 * Emit general derby update
 */
export function emitDerbyUpdate(draftId: number, derby: any) {
  if (!io) {
    console.warn("[DerbySocket] Socket.IO not initialized");
    return;
  }

  const roomName = `draft:${draftId}`;
  console.log(`[DerbySocket] Emitting derby:update to room ${roomName}`);

  io.to(roomName).emit("derby:update", {
    draftId,
    derby,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit when a selection is made
 */
export function emitDerbySelectionMade(
  draftId: number,
  selection: DraftDerbySelection
) {
  if (!io) {
    console.warn("[DerbySocket] Socket.IO not initialized");
    return;
  }

  const roomName = `draft:${draftId}`;
  console.log(
    `[DerbySocket] Emitting derby:selection_made to room ${roomName} - Roster ${selection.roster_id} selected position ${selection.draft_position}`
  );

  io.to(roomName).emit("derby:selection_made", {
    draftId,
    selection,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit when turn changes to next roster
 */
export function emitDerbyTurnChanged(draftId: number, rosterId: number) {
  if (!io) {
    console.warn("[DerbySocket] Socket.IO not initialized");
    return;
  }

  const roomName = `draft:${draftId}`;
  console.log(
    `[DerbySocket] Emitting derby:turn_changed to room ${roomName} - Now roster ${rosterId}'s turn`
  );

  io.to(roomName).emit("derby:turn_changed", {
    draftId,
    rosterId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit when derby is completed
 */
export function emitDerbyCompleted(draftId: number) {
  if (!io) {
    console.warn("[DerbySocket] Socket.IO not initialized");
    return;
  }

  const roomName = `draft:${draftId}`;
  console.log(
    `[DerbySocket] Emitting derby:completed to room ${roomName}`
  );

  io.to(roomName).emit("derby:completed", {
    draftId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit timer update for derby turn (if time limit enabled)
 */
export function emitDerbyTimerUpdate(
  draftId: number,
  deadline: Date,
  serverTime: Date
) {
  if (!io) {
    console.warn("[DerbySocket] Socket.IO not initialized");
    return;
  }

  const roomName = `draft:${draftId}`;

  io.to(roomName).emit("derby:timer_update", {
    draftId,
    deadline: deadline.toISOString(),
    server_time: serverTime.toISOString(),
  });
}

/**
 * Start timer broadcast for derby (similar to draft timer)
 */
let derbyTimerIntervals: Map<number, NodeJS.Timeout> = new Map();

export function startDerbyTimerBroadcast(
  draftId: number,
  deadline: Date
): void {
  if (!io) {
    console.warn("[DerbySocket] Socket.IO not initialized");
    return;
  }

  // Stop existing timer if any
  stopDerbyTimerBroadcast(draftId);

  console.log(`[DerbySocket] Starting timer broadcast for draft ${draftId}`);

  // Broadcast every 1 second
  const interval = setInterval(() => {
    const now = new Date();

    // Check if deadline has passed
    if (now >= deadline) {
      console.log(
        `[DerbySocket] Derby timer expired for draft ${draftId}`
      );
      stopDerbyTimerBroadcast(draftId);

      // Emit timeout event
      io.to(`draft:${draftId}`).emit("derby:timeout", {
        draftId,
        timestamp: now.toISOString(),
      });

      return;
    }

    emitDerbyTimerUpdate(draftId, deadline, now);
  }, 1000);

  derbyTimerIntervals.set(draftId, interval);
}

/**
 * Stop timer broadcast for derby
 */
export function stopDerbyTimerBroadcast(draftId: number): void {
  const interval = derbyTimerIntervals.get(draftId);

  if (interval) {
    console.log(`[DerbySocket] Stopping timer broadcast for draft ${draftId}`);
    clearInterval(interval);
    derbyTimerIntervals.delete(draftId);
  }
}
