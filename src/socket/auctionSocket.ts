import { Server, Socket } from "socket.io";
import {
  createNomination,
  placeBid,
  getActiveNominations,
  completeNomination,
  getRosterBudget,
  getNominationById,
  getBidsForNomination,
  updateNominationStatus,
} from "../models/Auction";
import { getDraftById } from "../models/Draft";

// Track active nomination timers
const nominationTimers = new Map<number, NodeJS.Timeout>();

export function setupAuctionSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    // Join auction room
    socket.on("join_auction", async (data: { draftId: number; rosterId?: number }) => {
      try {
        const room = `auction_${data.draftId}`;
        socket.join(room);

        // Also join roster-specific room for budget updates
        if (data.rosterId) {
          socket.join(`roster_${data.rosterId}`);
        }

        // Send current active nominations
        const nominations = await getActiveNominations(data.draftId);
        socket.emit("active_nominations", nominations);
      } catch (error: any) {
        console.error("Error joining auction:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // Nominate player
    socket.on(
      "nominate_player",
      async (data: {
        draftId: number;
        playerId: number;
        nominatingRosterId: number;
      }) => {
        try {
          const draft = await getDraftById(data.draftId);
          if (!draft) {
            throw new Error("Draft not found");
          }

          // Check if auction type
          if (draft.draft_type !== "auction" && draft.draft_type !== "slow_auction") {
            throw new Error("Draft is not an auction type");
          }

          // For slow auction, check max simultaneous nominations
          if (draft.draft_type === "slow_auction") {
            const activeNominations = await getActiveNominations(data.draftId);
            if (activeNominations.length >= (draft.max_simultaneous_nominations || 1)) {
              socket.emit("error", {
                message: `Maximum nominations reached (${draft.max_simultaneous_nominations})`,
              });
              return;
            }
          }

          // Calculate deadline based on draft type
          let deadline: Date | null = null;
          if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
            deadline = new Date(Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000);
          } else if (draft.draft_type === "auction" && draft.pick_time_seconds) {
            deadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
          }

          const nomination = await createNomination({
            draft_id: data.draftId,
            player_id: data.playerId,
            nominating_roster_id: data.nominatingRosterId,
            deadline,
          });

          // Broadcast to all in auction room
          const room = `auction_${data.draftId}`;
          io.to(room).emit("player_nominated", nomination);

          // Start timer for this nomination
          if (deadline) {
            scheduleNominationExpiry(io, nomination.id, data.draftId, deadline);
          }
        } catch (error: any) {
          console.error("Error nominating player:", error);
          socket.emit("error", { message: error.message });
        }
      }
    );

    // Place bid
    socket.on(
      "place_bid",
      async (data: {
        nominationId: number;
        rosterId: number;
        maxBid: number;
        draftId: number;
      }) => {
        try {
          // Get nomination to check if it's a slow auction (for timer reset)
          const nomination = await getNominationById(data.nominationId);
          if (!nomination) {
            throw new Error("Nomination not found");
          }

          const draft = await getDraftById(nomination.draft_id);
          if (!draft) {
            throw new Error("Draft not found");
          }

          // Process bid with proxy logic
          const result = await placeBid({
            nomination_id: data.nominationId,
            roster_id: data.rosterId,
            max_bid: data.maxBid,
          });

          if (result.success) {
            const room = `auction_${data.draftId}`;

            // Broadcast bid update (only shows current winning bid, not max)
            io.to(room).emit("bid_placed", {
              nominationId: data.nominationId,
              bid: {
                id: result.currentBid.id,
                nomination_id: result.currentBid.nomination_id,
                roster_id: result.currentBid.roster_id,
                bid_amount: result.currentBid.bid_amount,
                is_winning: result.currentBid.is_winning,
                created_at: result.currentBid.created_at,
              },
              winningRosterId: result.newWinner,
              previousWinner: result.previousWinner,
            });

            // Send budget updates to affected rosters
            const newWinnerBudget = await getRosterBudget(result.newWinner, data.draftId);
            io.to(`roster_${result.newWinner}`).emit("budget_updated", newWinnerBudget);

            if (result.previousWinner && result.previousWinner !== result.newWinner) {
              const prevWinnerBudget = await getRosterBudget(
                result.previousWinner,
                data.draftId
              );
              io.to(`roster_${result.previousWinner}`).emit(
                "budget_updated",
                prevWinnerBudget
              );
            }

            // For slow auction, reset timer
            if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
              const newDeadline = new Date(
                Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000
              );

              // Update nomination deadline in database
              await getNominationById(data.nominationId); // This ensures nomination exists
              // Note: We should add an updateNominationDeadline function, but for now timer handles it

              // Reset timer
              resetNominationTimer(io, data.nominationId, data.draftId, newDeadline);

              // Broadcast deadline update
              io.to(room).emit("nomination_deadline_updated", {
                nominationId: data.nominationId,
                deadline: newDeadline,
              });
            }
          }
        } catch (error: any) {
          console.error("Error placing bid:", error);
          socket.emit("error", { message: error.message });
        }
      }
    );

    socket.on("leave_auction", (data: { draftId: number; rosterId?: number }) => {
      socket.leave(`auction_${data.draftId}`);
      if (data.rosterId) {
        socket.leave(`roster_${data.rosterId}`);
      }
    });
  });
}

// Timer management functions

function scheduleNominationExpiry(
  io: Server,
  nominationId: number,
  draftId: number,
  deadline: Date
) {
  const delay = deadline.getTime() - Date.now();

  // Don't schedule if deadline has already passed
  if (delay <= 0) {
    processNominationExpiry(io, nominationId, draftId);
    return;
  }

  const timer = setTimeout(async () => {
    await processNominationExpiry(io, nominationId, draftId);
  }, delay);

  nominationTimers.set(nominationId, timer);
}

async function processNominationExpiry(io: Server, nominationId: number, draftId: number) {
  try {
    // Get nomination and check if still active
    const nomination = await getNominationById(nominationId);
    if (!nomination || nomination.status !== "active") {
      nominationTimers.delete(nominationId);
      return;
    }

    // Get highest bidder
    const bids = await getBidsForNomination(nominationId);
    const room = `auction_${draftId}`;

    if (bids.length > 0) {
      // Award to highest bidder
      const winningBid = bids.find((b) => b.is_winning);
      if (winningBid) {
        await completeNomination(
          nominationId,
          winningBid.roster_id,
          winningBid.bid_amount
        );

        io.to(room).emit("player_won", {
          nominationId,
          playerId: nomination.player_id,
          winningRosterId: winningBid.roster_id,
          winningBid: winningBid.bid_amount,
        });

        // Update budgets for winner
        const winnerBudget = await getRosterBudget(winningBid.roster_id, draftId);
        io.to(`roster_${winningBid.roster_id}`).emit("budget_updated", winnerBudget);
      }
    } else {
      // No bids - mark as passed
      await updateNominationStatus(nominationId, "passed");

      io.to(room).emit("nomination_expired", {
        nominationId,
        playerId: nomination.player_id,
      });
    }

    nominationTimers.delete(nominationId);
  } catch (error) {
    console.error("Error processing nomination expiry:", error);
    nominationTimers.delete(nominationId);
  }
}

export function resetNominationTimer(
  io: Server,
  nominationId: number,
  draftId: number,
  newDeadline: Date
) {
  const existingTimer = nominationTimers.get(nominationId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  scheduleNominationExpiry(io, nominationId, draftId, newDeadline);
}

// Helper function to cancel timer (if nomination is manually cancelled)
export function cancelNominationTimer(nominationId: number) {
  const existingTimer = nominationTimers.get(nominationId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    nominationTimers.delete(nominationId);
  }
}
