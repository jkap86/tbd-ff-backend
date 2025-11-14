import { Server, Socket } from "socket.io";
import { throttle } from "lodash";
import {
  createNomination,
  placeBid,
  getActiveNominations,
  getRosterBudget,
  getNominationById,
  isAuctionComplete,
  assignAuctionPlayersToRosters,
} from "../models/Auction";
import { getDraftById, completeDraft } from "../models/Draft";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware";
import { setTransactionTimeouts } from "../utils/transactionTimeout";
import {
  isUserDraftParticipant,
  doesUserOwnRoster,
} from "../utils/draftAuthorization";
import { logger } from "../config/logger";

// Track active nomination timers (for when bids close)
const nominationTimers = new Map<number, NodeJS.Timeout>();

// Track bid timers (for when bidding window closes in regular auctions)
const bidTimers = new Map<number, NodeJS.Timeout>();

// Track bid timer tick intervals (for countdown updates)
const bidTimerIntervals = new Map<number, NodeJS.Timeout>();

// Track turn timers (for when it's someone's turn to nominate)
const turnTimers = new Map<number, NodeJS.Timeout>();

// Throttle bid placements per roster to prevent spam (200ms cooldown)
const bidThrottlers = new Map<number, Function>();
const BID_THROTTLE_MS = 200;

export function setupAuctionSocket(io: Server) {
  // Apply authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      logger.error('Socket connected without user data', { socketId: socket.id, context: 'AuctionSocket' });
      socket.disconnect();
      return;
    }

    logger.info('Socket connected', { socketId: socket.id, username: user.username, userId: user.userId, context: 'AuctionSocket' });

    // Join auction room
    socket.on("join_auction", async (data: { draftId: number; rosterId?: number }) => {
      const user = socket.data.user!;

      try {
        // Verify user is a participant in this draft
        const isParticipant = await isUserDraftParticipant(user.userId, data.draftId);
        if (!isParticipant) {
          logger.warn('User denied access to auction - not a participant', {
            username: user.username,
            userId: user.userId,
            draftId: data.draftId,
            context: 'AuctionSocket'
          });
          socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
          return;
        }

        // If rosterId provided, verify user owns the roster
        if (data.rosterId) {
          const ownsRoster = await doesUserOwnRoster(user.userId, data.rosterId, data.draftId);
          if (!ownsRoster) {
            logger.warn('User denied access to roster', {
              username: user.username,
              userId: user.userId,
              rosterId: data.rosterId,
              context: 'AuctionSocket'
            });
            socket.emit("error", { message: "Access denied: You do not own this roster" });
            return;
          }
        }

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
        logger.error('Error joining auction', { error, context: 'AuctionSocket' });
        socket.emit("error", { message: error.message });
      }
    });

    // Nominate player
    socket.on(
      "nominate_player",
      async (data: {
        draftId: number;
        playerId: string;
        nominatingRosterId: number;
      }) => {
        const user = socket.data.user!;

        try {
          // Verify user is a participant in this draft
          const isParticipant = await isUserDraftParticipant(user.userId, data.draftId);
          if (!isParticipant) {
            logger.warn("User denied nominate access to draft", {
              username: user.username,
              user_id: user.userId,
              draft_id: data.draftId,
              context: 'AuctionSocket'
            });
            socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
            return;
          }

          // Verify user owns the nominating roster
          const ownsRoster = await doesUserOwnRoster(user.userId, data.nominatingRosterId, data.draftId);
          if (!ownsRoster) {
            logger.warn("User denied nominate access - does not own roster", {
              username: user.username,
              user_id: user.userId,
              roster_id: data.nominatingRosterId,
              context: 'AuctionSocket'
            });
            socket.emit("error", { message: "Access denied: You can only nominate players for your own roster" });
            return;
          }

          const draft = await getDraftById(data.draftId);
          if (!draft) {
            throw new Error("Draft not found");
          }

          // Check if auction type
          if (draft.draft_type !== "auction" && draft.draft_type !== "slow_auction") {
            throw new Error("Draft is not an auction type");
          }

          // For regular auction, check if it's this roster's turn
          if (draft.draft_type === "auction") {
            if (draft.current_roster_id && draft.current_roster_id !== data.nominatingRosterId) {
              socket.emit("error", {
                message: "It's not your turn to nominate",
              });
              return;
            }
          }

          // For slow auction, check nominations per manager limit
          if (draft.draft_type === "slow_auction") {
            const activeNominations = await getActiveNominations(data.draftId);
            // Count how many active nominations this manager currently has
            const managerActiveNominations = activeNominations.filter(
              (nom: any) => nom.nominating_roster_id === data.nominatingRosterId
            );
            const nominationsPerManager = draft.nominations_per_manager || 3;

            if (managerActiveNominations.length >= nominationsPerManager) {
              socket.emit("error", {
                message: `You have reached your nomination limit (${nominationsPerManager} active nominations)`,
              });
              return;
            }
          }

          // Calculate deadline based on draft type
          let deadline: Date | null = null;
          let bidDeadline: Date | null = null;

          if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
            deadline = new Date(Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000);
          } else if (draft.draft_type === "auction") {
            // For regular auctions, pick_time_seconds is for nomination deadline
            if (draft.pick_time_seconds) {
              deadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
            }
            // Calculate bid deadline using bid_timer_seconds
            if (draft.bid_timer_seconds) {
              bidDeadline = new Date(Date.now() + draft.bid_timer_seconds * 1000);
            }
          }

          const nomination = await createNomination({
            draft_id: data.draftId,
            player_id: data.playerId,
            nominating_roster_id: data.nominatingRosterId,
            deadline,
            bid_deadline: bidDeadline,
          });

          // Broadcast to all in auction room
          const room = `auction_${data.draftId}`;
          io.to(room).emit("player_nominated", nomination);

          // For regular auctions, emit bid timer started event and schedule bid expiry
          if (draft.draft_type === "auction" && bidDeadline) {
            io.to(room).emit("bid_timer_started", {
              nominationId: nomination.id,
              bidDeadline: bidDeadline,
            });

            scheduleBidExpiry(io, nomination.id, data.draftId, bidDeadline);
          }

          // For slow auctions, start timer for nomination expiry
          if (draft.draft_type === "slow_auction" && deadline) {
            scheduleNominationExpiry(io, nomination.id, data.draftId, deadline);
          }
        } catch (error: any) {
          logger.error("Error nominating player", { error, context: 'AuctionSocket' });
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
        const rosterId = data.rosterId;

        // Get or create throttled handler for this roster
        if (!bidThrottlers.has(rosterId)) {
          bidThrottlers.set(rosterId, throttle(async (bidData) => {
            const user = socket.data.user!;

            try {
              // Verify user is a participant in this draft
              const isParticipant = await isUserDraftParticipant(user.userId, bidData.draftId);
              if (!isParticipant) {
                logger.warn("User denied bid access to draft", {
                  username: user.username,
                  user_id: user.userId,
                  draft_id: bidData.draftId,
                  context: 'AuctionSocket'
                });
                socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
                return;
              }

              // Verify user owns the bidding roster
              const ownsRoster = await doesUserOwnRoster(user.userId, bidData.rosterId, bidData.draftId);
              if (!ownsRoster) {
                logger.warn("User denied bid access - does not own roster", {
                  username: user.username,
                  user_id: user.userId,
                  roster_id: bidData.rosterId,
                  context: 'AuctionSocket'
                });
                socket.emit("error", { message: "Access denied: You can only place bids for your own roster" });
                return;
              }

              // Get nomination to check if it's a slow auction (for timer reset)
              const nomination = await getNominationById(bidData.nominationId);
              if (!nomination) {
                throw new Error("Nomination not found");
              }

              const draft = await getDraftById(nomination.draft_id);
              if (!draft) {
                throw new Error("Draft not found");
              }

              // For regular auctions, check if bid window is still open
              // Note: We're using the nomination deadline field to store bid_deadline for now
              if (draft.draft_type === "auction" && nomination.deadline) {
                const now = new Date();
                const bidDeadline = new Date(nomination.deadline);

                if (now >= bidDeadline) {
                  socket.emit("error", {
                    message: "Bid window has closed for this nomination"
                  });
                  return;
                }
              }

              // Process bid with proxy logic
              const result = await placeBid({
                nomination_id: bidData.nominationId,
                roster_id: bidData.rosterId,
                max_bid: bidData.maxBid,
              });

              if (result.success) {
                const room = `auction_${bidData.draftId}`;

            // Get team name for the bidder
            const { getRosterTeamName } = await import("../models/Auction");
            const teamName = await getRosterTeamName(result.currentBid.roster_id);

                // Broadcast bid update (only shows current winning bid, not max)
                io.to(room).emit("bid_placed", {
                  nominationId: bidData.nominationId,
              bid: {
                id: result.currentBid.id,
                nomination_id: result.currentBid.nomination_id,
                roster_id: result.currentBid.roster_id,
                bid_amount: result.currentBid.bid_amount,
                is_winning: result.currentBid.is_winning,
                created_at: result.currentBid.created_at,
                team_name: teamName,
              },
              winningRosterId: result.newWinner,
              previousWinner: result.previousWinner,
            });

            // Send budget updates to affected rosters
            const newWinnerBudget = await getRosterBudget(result.newWinner, data.draftId);
            io.to(`roster_${result.newWinner}`).emit("budget_updated", {
              roster_id: result.newWinner,
              budget: newWinnerBudget,
            });

            if (result.previousWinner && result.previousWinner !== result.newWinner) {
              const prevWinnerBudget = await getRosterBudget(
                result.previousWinner,
                data.draftId
              );
              io.to(`roster_${result.previousWinner}`).emit("budget_updated", {
                roster_id: result.previousWinner,
                budget: prevWinnerBudget,
              });
            }

                // For slow auction, reset timer
                if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
                  const newDeadline = new Date(
                    Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000
                  );

                  // Update nomination deadline in database
                  const { updateNominationDeadline } = await import("../models/Auction");
                  await updateNominationDeadline(bidData.nominationId, newDeadline);

                  // Reset timer
                  resetNominationTimer(io, bidData.nominationId, bidData.draftId, newDeadline);

                  // Broadcast deadline update
                  io.to(room).emit("nomination_deadline_updated", {
                    nominationId: bidData.nominationId,
                    deadline: newDeadline,
                  });
                }
              }
            } catch (error: any) {
              logger.error("Error placing bid", { error, context: 'AuctionSocket' });
              socket.emit("error", {
                message: error.message || "Failed to place bid"
              });
            }
          }, BID_THROTTLE_MS, { leading: true, trailing: false }));
        }

        // Execute throttled handler
        const throttledHandler = bidThrottlers.get(rosterId)!;
        throttledHandler(data);
      }
    );

    socket.on("leave_auction", (data: { draftId: number; rosterId?: number }) => {
      socket.leave(`auction_${data.draftId}`);
      if (data.rosterId) {
        socket.leave(`roster_${data.rosterId}`);
      }
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      const user = socket.data.user;
      if (user) {
        logger.info("Socket disconnected", { socket_id: socket.id, username: user.username, user_id: user.userId, context: 'AuctionSocket' });
      } else {
        logger.info("Socket disconnected", { socket_id: socket.id, context: 'AuctionSocket' });
      }
    });
  });
}

// Timer management functions

export function scheduleNominationExpiry(
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
  const pool = (await import("../config/database")).default;
  const client = await pool.connect();
    await setTransactionTimeouts(client);

  try {
    await client.query('BEGIN');

    // Lock the nomination to prevent concurrent completion
    const nominationResult = await client.query(
      'SELECT * FROM auction_nominations WHERE id = $1 FOR UPDATE',
      [nominationId]
    );

    if (nominationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      nominationTimers.delete(nominationId);
      return;
    }

    const nomination = nominationResult.rows[0];

    // Check if still active
    if (nomination.status !== "active") {
      await client.query('ROLLBACK');
      nominationTimers.delete(nominationId);
      return;
    }

    const room = `auction_${draftId}`;

    // Get highest bidder (within transaction)
    const bidsResult = await client.query(
      `SELECT ab.*,
        COALESCE(r.settings->>'team_name', u.username) as team_name
       FROM auction_bids ab
       LEFT JOIN rosters r ON ab.roster_id = r.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE ab.nomination_id = $1
       ORDER BY ab.max_bid DESC, ab.created_at ASC`,
      [nominationId]
    );

    const bids = bidsResult.rows;

    if (bids.length > 0) {
      // Award to highest bidder
      const winningBid = bids.find((b) => b.is_winning);
      if (winningBid) {
        // Mark all bids as not winning (final state)
        await client.query(
          `UPDATE auction_bids
           SET is_winning = false
           WHERE nomination_id = $1`,
          [nominationId]
        );

        // Complete the nomination
        await client.query(
          `UPDATE auction_nominations
           SET status = 'completed',
               winning_roster_id = $2,
               winning_bid = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [nominationId, winningBid.roster_id, winningBid.bid_amount]
        );

        // Commit transaction
        await client.query('COMMIT');

        // Get team name for the winner (after commit)
        const teamResult = await pool.query(
          `SELECT COALESCE(r.settings->>'team_name', u.username) as team_name
           FROM rosters r
           LEFT JOIN users u ON r.user_id = u.id
           WHERE r.id = $1`,
          [winningBid.roster_id]
        );
        const teamName = teamResult.rows[0]?.team_name;

        // Get player details (after commit)
        const playerResult = await pool.query(
          `SELECT p.full_name as player_name
           FROM auction_nominations an
           LEFT JOIN players p ON an.player_id = p.player_id
           WHERE an.id = $1`,
          [nominationId]
        );
        const playerName = playerResult.rows[0]?.player_name;

        io.to(room).emit("player_won", {
          nominationId,
          playerId: nomination.player_id,
          playerName: playerName,
          winningRosterId: winningBid.roster_id,
          teamName: teamName,
          amount: winningBid.bid_amount,
        });

        // Update budgets for winner
        const winnerBudget = await getRosterBudget(winningBid.roster_id, draftId);
        io.to(`roster_${winningBid.roster_id}`).emit("budget_updated", {
          roster_id: winningBid.roster_id,
          budget: winnerBudget,
        });

        // Check if auction is complete
        const complete = await isAuctionComplete(draftId);
        if (complete) {
          logger.info("Draft is complete", { draft_id: draftId, context: 'AuctionSocket' });

          // Complete the draft
          const updatedDraft = await completeDraft(draftId);

          // Assign auction players to rosters
          await assignAuctionPlayersToRosters(draftId);

          // Update league status to 'in_season'
          const draft = await getDraftById(draftId);
          if (draft) {
            const { getLeagueById } = await import("../models/League");
            const { updateLeague } = await import("../models/League");
            const league = await getLeagueById(draft.league_id);

            if (league) {
              await updateLeague(league.id, { status: "in_season" });

              // Initialize season: generate matchups and calculate scores
              const { initializeSeasonFromLeague } = await import(
                "../services/draftCompletionService"
              );
              await initializeSeasonFromLeague(league);
            }
          }

          // Emit completion status
          io.to(room).emit("auction_completed", {
            draft: updatedDraft,
            timestamp: new Date(),
          });
        }
      } else {
        await client.query('ROLLBACK');
      }
    } else {
      // No bids - mark as passed
      await client.query(
        `UPDATE auction_nominations
         SET status = 'passed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [nominationId]
      );

      await client.query('COMMIT');

      // Get player details (after commit)
      const playerResult = await pool.query(
        `SELECT p.full_name as player_name
         FROM auction_nominations an
         LEFT JOIN players p ON an.player_id = p.player_id
         WHERE an.id = $1`,
        [nominationId]
      );
      const playerName = playerResult.rows[0]?.player_name;

      io.to(room).emit("nomination_expired", {
        nominationId,
        playerId: nomination.player_id,
        playerName: playerName,
      });
    }

    nominationTimers.delete(nominationId);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error("Error processing nomination expiry", { error, context: 'AuctionSocket' });
    nominationTimers.delete(nominationId);
  } finally {
    client.release();
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

// Bid timer functions (for regular auctions - controls when bidding closes)

export function scheduleBidExpiry(
  io: Server,
  nominationId: number,
  draftId: number,
  bidDeadline: Date
) {
  const delay = bidDeadline.getTime() - Date.now();

  // Don't schedule if deadline has already passed
  if (delay <= 0) {
    processBidExpiry(io, nominationId, draftId);
    return;
  }

  const timer = setTimeout(async () => {
    await processBidExpiry(io, nominationId, draftId);
  }, delay);

  bidTimers.set(nominationId, timer);

  // Start bid timer tick interval (emit every second)
  startBidTimerTick(io, nominationId, draftId, bidDeadline);
}

function startBidTimerTick(
  io: Server,
  nominationId: number,
  draftId: number,
  bidDeadline: Date
) {
  // Clear existing interval if any
  const existingInterval = bidTimerIntervals.get(nominationId);
  if (existingInterval) {
    clearInterval(existingInterval);
  }

  const room = `auction_${draftId}`;

  // Emit tick every second
  const interval = setInterval(() => {
    const now = Date.now();
    const timeRemaining = Math.max(0, Math.floor((bidDeadline.getTime() - now) / 1000));

    io.to(room).emit("bid_timer_tick", {
      nominationId,
      timeRemaining,
      bidDeadline: bidDeadline,
    });

    // Stop interval when time runs out
    if (timeRemaining <= 0) {
      clearInterval(interval);
      bidTimerIntervals.delete(nominationId);
    }
  }, 1000);

  bidTimerIntervals.set(nominationId, interval);
}

function stopBidTimerTick(nominationId: number) {
  const existingInterval = bidTimerIntervals.get(nominationId);
  if (existingInterval) {
    clearInterval(existingInterval);
    bidTimerIntervals.delete(nominationId);
  }
}

async function processBidExpiry(io: Server, nominationId: number, draftId: number) {
  const pool = (await import("../config/database")).default;
  const client = await pool.connect();
  await setTransactionTimeouts(client);

  try {
    await client.query('BEGIN');

    // Lock the nomination to prevent concurrent completion
    const nominationResult = await client.query(
      'SELECT * FROM auction_nominations WHERE id = $1 FOR UPDATE',
      [nominationId]
    );

    if (nominationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      bidTimers.delete(nominationId);
      return;
    }

    const nomination = nominationResult.rows[0];

    // Check if still active
    if (nomination.status !== "active") {
      await client.query('ROLLBACK');
      bidTimers.delete(nominationId);
      return;
    }

    const room = `auction_${draftId}`;

    // Emit bid window closed event
    io.to(room).emit("bid_window_closed", {
      nominationId,
      playerId: nomination.player_id,
    });

    // Get highest bidder (within transaction)
    const bidsResult = await client.query(
      `SELECT ab.*,
        COALESCE(r.settings->>'team_name', u.username) as team_name
       FROM auction_bids ab
       LEFT JOIN rosters r ON ab.roster_id = r.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE ab.nomination_id = $1
       ORDER BY ab.max_bid DESC, ab.created_at ASC`,
      [nominationId]
    );

    const bids = bidsResult.rows;

    if (bids.length > 0) {
      // Award to highest bidder
      const winningBid = bids.find((b) => b.is_winning);
      if (winningBid) {
        // Mark all bids as not winning (final state)
        await client.query(
          `UPDATE auction_bids
           SET is_winning = false
           WHERE nomination_id = $1`,
          [nominationId]
        );

        // Complete the nomination
        await client.query(
          `UPDATE auction_nominations
           SET status = 'completed',
               winning_roster_id = $2,
               winning_bid = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [nominationId, winningBid.roster_id, winningBid.bid_amount]
        );

        // Commit transaction
        await client.query('COMMIT');

        // Get team name for the winner (after commit)
        const teamResult = await pool.query(
          `SELECT COALESCE(r.settings->>'team_name', u.username) as team_name
           FROM rosters r
           LEFT JOIN users u ON r.user_id = u.id
           WHERE r.id = $1`,
          [winningBid.roster_id]
        );
        const teamName = teamResult.rows[0]?.team_name;

        // Get player details (after commit)
        const playerResult = await pool.query(
          `SELECT p.full_name as player_name
           FROM auction_nominations an
           LEFT JOIN players p ON an.player_id = p.player_id
           WHERE an.id = $1`,
          [nominationId]
        );
        const playerName = playerResult.rows[0]?.player_name;

        io.to(room).emit("player_won", {
          nominationId,
          playerId: nomination.player_id,
          playerName: playerName,
          winningRosterId: winningBid.roster_id,
          teamName: teamName,
          amount: winningBid.bid_amount,
        });

        // Update budgets for winner
        const winnerBudget = await getRosterBudget(winningBid.roster_id, draftId);
        io.to(`roster_${winningBid.roster_id}`).emit("budget_updated", {
          roster_id: winningBid.roster_id,
          budget: winnerBudget,
        });

        // Check if auction is complete
        const complete = await isAuctionComplete(draftId);
        if (complete) {
          logger.info("Draft is complete", { draft_id: draftId, context: 'AuctionSocket' });

          // Complete the draft
          const updatedDraft = await completeDraft(draftId);

          // Assign auction players to rosters
          await assignAuctionPlayersToRosters(draftId);

          // Update league status to 'in_season'
          const draft = await getDraftById(draftId);
          if (draft) {
            const { getLeagueById } = await import("../models/League");
            const { updateLeague } = await import("../models/League");
            const league = await getLeagueById(draft.league_id);

            if (league) {
              await updateLeague(league.id, { status: "in_season" });

              // Initialize season: generate matchups and calculate scores
              const { initializeSeasonFromLeague } = await import(
                "../services/draftCompletionService"
              );
              await initializeSeasonFromLeague(league);
            }
          }

          // Emit completion status
          io.to(room).emit("auction_completed", {
            draft: updatedDraft,
            timestamp: new Date(),
          });
        }
      } else {
        await client.query('ROLLBACK');
      }
    } else {
      // No bids - mark as passed
      await client.query(
        `UPDATE auction_nominations
         SET status = 'passed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [nominationId]
      );

      await client.query('COMMIT');

      // Get player details (after commit)
      const playerResult = await pool.query(
        `SELECT p.full_name as player_name
         FROM auction_nominations an
         LEFT JOIN players p ON an.player_id = p.player_id
         WHERE an.id = $1`,
        [nominationId]
      );
      const playerName = playerResult.rows[0]?.player_name;

      io.to(room).emit("nomination_expired", {
        nominationId,
        playerId: nomination.player_id,
        playerName: playerName,
      });
    }

    bidTimers.delete(nominationId);
    stopBidTimerTick(nominationId);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error("Error processing bid expiry", { error, context: 'AuctionSocket' });
    bidTimers.delete(nominationId);
    stopBidTimerTick(nominationId);
  } finally {
    client.release();
  }
}

export function cancelBidTimer(nominationId: number) {
  const existingTimer = bidTimers.get(nominationId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    bidTimers.delete(nominationId);
  }
  stopBidTimerTick(nominationId);
}

// Turn timer functions (for auto-nominating when it's someone's turn)

export function scheduleTurnTimer(
  io: Server,
  draftId: number,
  rosterId: number,
  pickTimeSeconds: number
) {
  // Cancel existing turn timer for this draft
  const existingTimer = turnTimers.get(draftId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = pickTimeSeconds * 1000;

  const timer = setTimeout(async () => {
    await processTurnExpiry(io, draftId, rosterId);
  }, delay);

  turnTimers.set(draftId, timer);
  logger.info("Scheduled turn timer for draft", { draft_id: draftId, roster_id: rosterId, seconds: pickTimeSeconds, context: 'AuctionSocket' });
}

async function processTurnExpiry(io: Server, draftId: number, rosterId: number) {
  try {
    logger.info("Turn expired for draft", { draft_id: draftId, roster_id: rosterId, context: 'AuctionSocket' });

    const draft = await getDraftById(draftId);
    if (!draft || draft.status !== "in_progress") {
      turnTimers.delete(draftId);
      return;
    }

    // Check if it's still this roster's turn
    if (draft.current_roster_id !== rosterId) {
      logger.info("Turn has changed, skipping auto-nomination", { draft_id: draftId, context: 'AuctionSocket' });
      turnTimers.delete(draftId);
      return;
    }

    // Get available players for this draft (players not yet won)
    const pool = (await import("../config/database")).default;
    const availablePlayersQuery = `
      SELECT p.*
      FROM players p
      WHERE p.player_id NOT IN (
        SELECT DISTINCT player_id
        FROM auction_nominations
        WHERE draft_id = $1
          AND status = 'completed'
          AND winning_roster_id IS NOT NULL
      )
      ORDER BY p.search_rank ASC NULLS LAST
      LIMIT 100
    `;

    const availablePlayersResult = await pool.query(availablePlayersQuery, [draftId]);
    const availablePlayers = availablePlayersResult.rows;

    if (availablePlayers.length === 0) {
      logger.info("No available players, skipping auto-nomination", { draft_id: draftId, context: 'AuctionSocket' });
      turnTimers.delete(draftId);
      return;
    }

    // Pick a random player from available players
    const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

    logger.info("Auto-nominating player for roster", { player_id: randomPlayer.player_id, roster_id: rosterId, context: 'AuctionSocket' });

    // Calculate deadline for the nomination
    let deadline: Date | null = null;
    let bidDeadline: Date | null = null;

    if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
      deadline = new Date(Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000);
    } else if (draft.draft_type === "auction") {
      // For regular auctions, pick_time_seconds is for nomination deadline
      if (draft.pick_time_seconds) {
        deadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
      }
      // Calculate bid deadline using bid_timer_seconds
      if (draft.bid_timer_seconds) {
        bidDeadline = new Date(Date.now() + draft.bid_timer_seconds * 1000);
      }
    }

    // Create the nomination
    const nomination = await createNomination({
      draft_id: draftId,
      player_id: randomPlayer.player_id,
      nominating_roster_id: rosterId,
      deadline,
      bid_deadline: bidDeadline,
    });

    // Broadcast to all in auction room
    const room = `auction_${draftId}`;
    io.to(room).emit("player_nominated", nomination);

    // For regular auctions, emit bid timer started event and schedule bid expiry
    if (draft.draft_type === "auction" && bidDeadline) {
      io.to(room).emit("bid_timer_started", {
        nominationId: nomination.id,
        bidDeadline: bidDeadline,
      });

      scheduleBidExpiry(io, nomination.id, draftId, bidDeadline);
    }

    // For slow auctions, start timer for nomination expiry
    if (draft.draft_type === "slow_auction" && deadline) {
      scheduleNominationExpiry(io, nomination.id, draftId, deadline);
    }

    // Advance turn to next roster (for regular auctions)
    if (draft.draft_type === "auction") {
      const { advanceAuctionTurn } = await import("../models/Auction");
      const { updateDraft } = await import("../models/Draft");

      const nextRosterId = await advanceAuctionTurn(draftId);
      if (nextRosterId) {
        await updateDraft(draftId, { current_roster_id: nextRosterId });

        // Emit turn change via socket
        io.to(room).emit("turn_changed", {
          currentRosterId: nextRosterId,
          draftId: draftId,
        });

        // Schedule next turn timer
        scheduleTurnTimer(io, draftId, nextRosterId, draft.pick_time_seconds);
      }
    }

    turnTimers.delete(draftId);
  } catch (error) {
    logger.error("Error processing turn expiry", { error, context: 'AuctionSocket' });
    turnTimers.delete(draftId);
  }
}

export function cancelTurnTimer(draftId: number) {
  const existingTimer = turnTimers.get(draftId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    turnTimers.delete(draftId);
  }
  logger.info("Cancelled turn timer for draft", { draft_id: draftId, context: 'AuctionSocket' });
}
