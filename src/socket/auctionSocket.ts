import { Server, Socket } from "socket.io";
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
import {
  isUserDraftParticipant,
  doesUserOwnRoster,
} from "../utils/draftAuthorization";

// Track active nomination timers (for when bids close)
const nominationTimers = new Map<number, NodeJS.Timeout>();

// Track turn timers (for when it's someone's turn to nominate)
const turnTimers = new Map<number, NodeJS.Timeout>();

export function setupAuctionSocket(io: Server) {
  // Apply authentication middleware to all socket connections
  io.use(socketAuthMiddleware);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      console.error(`[AuctionSocket] Socket connected without user data: ${socket.id}`);
      socket.disconnect();
      return;
    }

    console.log(`[AuctionSocket] Socket connected: ${socket.id} - User: ${user.username} (${user.userId})`);

    // Join auction room
    socket.on("join_auction", async (data: { draftId: number; rosterId?: number }) => {
      const user = socket.data.user!;

      try {
        // Verify user is a participant in this draft
        const isParticipant = await isUserDraftParticipant(user.userId, data.draftId);
        if (!isParticipant) {
          console.log(`[AuctionSocket] User ${user.username} (${user.userId}) denied access to auction ${data.draftId} - not a participant`);
          socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
          return;
        }

        // If rosterId provided, verify user owns the roster
        if (data.rosterId) {
          const ownsRoster = await doesUserOwnRoster(user.userId, data.rosterId, data.draftId);
          if (!ownsRoster) {
            console.log(`[AuctionSocket] User ${user.username} (${user.userId}) denied access to roster ${data.rosterId}`);
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
        console.error("Error joining auction:", error);
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
            console.log(`[AuctionSocket] User ${user.username} (${user.userId}) denied nominate access to draft ${data.draftId}`);
            socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
            return;
          }

          // Verify user owns the nominating roster
          const ownsRoster = await doesUserOwnRoster(user.userId, data.nominatingRosterId, data.draftId);
          if (!ownsRoster) {
            console.log(`[AuctionSocket] User ${user.username} (${user.userId}) denied nominate - does not own roster ${data.nominatingRosterId}`);
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
        const user = socket.data.user!;

        try {
          // Verify user is a participant in this draft
          const isParticipant = await isUserDraftParticipant(user.userId, data.draftId);
          if (!isParticipant) {
            console.log(`[AuctionSocket] User ${user.username} (${user.userId}) denied bid access to draft ${data.draftId}`);
            socket.emit("error", { message: "Access denied: You are not a participant in this draft" });
            return;
          }

          // Verify user owns the bidding roster
          const ownsRoster = await doesUserOwnRoster(user.userId, data.rosterId, data.draftId);
          if (!ownsRoster) {
            console.log(`[AuctionSocket] User ${user.username} (${user.userId}) denied bid - does not own roster ${data.rosterId}`);
            socket.emit("error", { message: "Access denied: You can only place bids for your own roster" });
            return;
          }

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

            // Get team name for the bidder
            const { getRosterTeamName } = await import("../models/Auction");
            const teamName = await getRosterTeamName(result.currentBid.roster_id);

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
              await updateNominationDeadline(data.nominationId, newDeadline);

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

    /**
     * Handle disconnection
     */
    socket.on("disconnect", () => {
      const user = socket.data.user;
      if (user) {
        console.log(`[AuctionSocket] Socket disconnected: ${socket.id} - User: ${user.username} (${user.userId})`);
      } else {
        console.log(`[AuctionSocket] Socket disconnected: ${socket.id}`);
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
          console.log(`[Auction] Draft ${draftId} is complete!`);

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

              const startWeek = league.settings?.start_week || 1;
              const playoffWeekStart = league.settings?.playoff_week_start || 15;

              // Generate matchups if they don't exist
              console.log(`[Auction] Checking/generating matchups...`);
              const { generateMatchupsForWeek, getMatchupsByLeagueAndWeek } =
                await import("../models/Matchup");

              for (let week = startWeek; week < playoffWeekStart; week++) {
                try {
                  const existingMatchups = await getMatchupsByLeagueAndWeek(
                    league.id,
                    week
                  );
                  if (existingMatchups.length === 0) {
                    console.log(`[Auction] Generating matchups for week ${week}...`);
                    await generateMatchupsForWeek(league.id, week, league.season);
                  }
                } catch (error) {
                  console.error(
                    `[Auction] Failed to generate matchups for week ${week}:`,
                    error
                  );
                }
              }

              // Calculate scores for all weeks
              console.log(`[Auction] Calculating scores for all weeks...`);
              const { updateMatchupScoresForWeek } = await import(
                "../services/scoringService"
              );
              const { finalizeWeekScores, recalculateAllRecords } = await import(
                "../services/recordService"
              );

              for (let week = startWeek; week < playoffWeekStart; week++) {
                try {
                  console.log(`[Auction] Updating scores for week ${week}...`);
                  await updateMatchupScoresForWeek(
                    league.id,
                    week,
                    league.season,
                    "regular"
                  );
                  await finalizeWeekScores(league.id, week, league.season, "regular");
                } catch (error) {
                  console.error(
                    `[Auction] Failed to update scores for week ${week}:`,
                    error
                  );
                }
              }

              // Recalculate all records
              console.log(`[Auction] Recalculating all records...`);
              try {
                await recalculateAllRecords(league.id, league.season);
              } catch (error) {
                console.error(`[Auction] Failed to recalculate records:`, error);
              }
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
    console.error("Error processing nomination expiry:", error);
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
  console.log(`[TurnTimer] Scheduled turn timer for draft ${draftId}, roster ${rosterId}, ${pickTimeSeconds}s`);
}

async function processTurnExpiry(io: Server, draftId: number, rosterId: number) {
  try {
    console.log(`[TurnTimer] Turn expired for draft ${draftId}, roster ${rosterId}`);

    const draft = await getDraftById(draftId);
    if (!draft || draft.status !== "in_progress") {
      turnTimers.delete(draftId);
      return;
    }

    // Check if it's still this roster's turn
    if (draft.current_roster_id !== rosterId) {
      console.log(`[TurnTimer] Turn has changed, skipping auto-nomination`);
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
      console.log(`[TurnTimer] No available players, skipping auto-nomination`);
      turnTimers.delete(draftId);
      return;
    }

    // Pick a random player from available players
    const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

    console.log(`[TurnTimer] Auto-nominating player ${randomPlayer.player_id} for roster ${rosterId}`);

    // Calculate deadline for the nomination
    let deadline: Date | null = null;
    if (draft.draft_type === "slow_auction" && draft.nomination_timer_hours) {
      deadline = new Date(Date.now() + draft.nomination_timer_hours * 60 * 60 * 1000);
    } else if (draft.draft_type === "auction" && draft.pick_time_seconds) {
      deadline = new Date(Date.now() + draft.pick_time_seconds * 1000);
    }

    // Create the nomination
    const nomination = await createNomination({
      draft_id: draftId,
      player_id: randomPlayer.player_id,
      nominating_roster_id: rosterId,
      deadline,
    });

    // Broadcast to all in auction room
    const room = `auction_${draftId}`;
    io.to(room).emit("player_nominated", nomination);

    // Start timer for this nomination to expire (for bids)
    if (deadline) {
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
    console.error("Error processing turn expiry:", error);
    turnTimers.delete(draftId);
  }
}

export function cancelTurnTimer(draftId: number) {
  const existingTimer = turnTimers.get(draftId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    turnTimers.delete(draftId);
  }
  console.log(`[TurnTimer] Cancelled turn timer for draft ${draftId}`);
}
